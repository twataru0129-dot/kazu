import type { Session, StoredAttempt } from '../../persistence/types';
import type { TestScore, TestSettings } from './scoring';

/** 集計はすべて原記録（attempts / sessions）から毎回計算する */
export interface CompletedTest {
  session: Session;
  settings: TestSettings;
  key: string;
  score: TestScore;
}

export interface TestSummary {
  settings: TestSettings;
  key: string;
  score: TestScore;
}

export function completedTests(sessions: Session[]): CompletedTest[] {
  return sessions
    .filter((s) => s.mode === 'test' && s.status === 'completed' && s.summary)
    .map((s) => {
      const sum = s.summary as TestSummary;
      return { session: s, settings: sum.settings, key: sum.key, score: sum.score };
    })
    .sort((a, b) => (b.session.completedAt ?? '').localeCompare(a.session.completedAt ?? ''));
}

/** 同じ条件の、ひとつ前の完了テスト */
export function previousSame(tests: CompletedTest[], current: CompletedTest | { key: string; session: { id: string; completedAt?: string } }): CompletedTest | undefined {
  const t = current.session.completedAt ?? '9999';
  return tests.find((x) => x.key === current.key && x.session.id !== current.session.id && (x.session.completedAt ?? '') < t);
}

export interface LevelStat {
  key: string; // op|levelKey
  op: string;
  levelKey: string;
  n: number;
  firstCorrect: number;
  rate: number;
}

/**
 * 計算モードと「完了した」テストの記録を、演算・難易度ごとにまとめる。
 * 途中でやめたテストは含めない。
 */
export function statsByLevel(attempts: StoredAttempt[], sessions: Session[], modes: ('calculation' | 'test')[] = ['calculation', 'test']): LevelStat[] {
  const done = new Set(sessions.filter((s) => s.mode === 'test' && s.status === 'completed').map((s) => s.id));
  const map = new Map<string, LevelStat>();
  for (const a of attempts) {
    if (!modes.includes(a.mode as 'calculation' | 'test') || !a.op || !a.levelKey) continue;
    // 100マス計算（gameId つき）は 1まいの 盤を 1件として べつに 数える（ふつうの 計算の 正答率に まぜない）
    if (a.gameId) continue;
    if (a.mode === 'test' && !done.has(a.sessionId)) continue;
    if (a.skipped && a.mode === 'calculation') continue;
    const key = `${a.op}|${a.levelKey}`;
    const s = map.get(key) ?? { key, op: a.op, levelKey: a.levelKey, n: 0, firstCorrect: 0, rate: 0 };
    s.n++;
    if (a.mode === 'test' ? a.finalCorrect : a.firstTryCorrect) s.firstCorrect++;
    map.set(key, s);
  }
  return [...map.values()].map((s) => ({ ...s, rate: s.n ? s.firstCorrect / s.n : 0 })).sort((a, b) => a.key.localeCompare(b.key));
}

export const MIN_SAMPLES_FOR_SUGGESTION = 10;

/** 「れんしゅうしてみよう」候補。記録が少ない項目は出さない（苦手と決めつけない）。 */
export function practiceSuggestions(stats: LevelStat[]): LevelStat[] {
  return stats.filter((s) => s.n >= MIN_SAMPLES_FOR_SUGGESTION && s.rate < 0.7).sort((a, b) => a.rate - b.rate);
}

/** 「よくできている」項目（こちらも十分な記録があるときだけ） */
export function strengths(stats: LevelStat[]): LevelStat[] {
  return stats.filter((s) => s.n >= MIN_SAMPLES_FOR_SUGGESTION && s.rate >= 0.9);
}

export interface GameStat {
  gameId: string;
  plays: number;
  solved: number;
  hints: number;
  lastAt: string;
}

export function statsByGame(attempts: StoredAttempt[]): GameStat[] {
  const map = new Map<string, GameStat>();
  for (const a of attempts) {
    if (a.mode !== 'game' || !a.gameId) continue;
    const s = map.get(a.gameId) ?? { gameId: a.gameId, plays: 0, solved: 0, hints: 0, lastAt: '' };
    s.plays++;
    if (a.finalCorrect) s.solved++;
    s.hints += a.hintsUsed;
    if (a.answeredAt > s.lastAt) s.lastAt = a.answeredAt;
    map.set(a.gameId, s);
  }
  return [...map.values()].sort((a, b) => b.lastAt.localeCompare(a.lastAt));
}
