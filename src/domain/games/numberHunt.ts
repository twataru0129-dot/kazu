import { createRng, type Rng } from '../random';
import type { Difficulty } from '../types';
import type { GameLogic } from './types';

/**
 * 27 数字をさがせ！：バラバラに ならんだ 数字を、きまった じゅんに さがして タップする。
 *
 * - 1回の あそびは 5ラウンド。ラウンドごとの ならび（1〜N の 並べかえ）は 問題を 作るときに きめて もつ
 *   （やりなおし・再開で かわらない。ゲームの とちゅうで うごかない）
 * - ルール：ぜんぶ（1→N）、2の倍数だけ、3の倍数だけ（チャレンジ）。1回の あそびの 5ラウンドは 同じ ルール
 * - まちがえて おしても すすまない（まちがいの 回数だけ 数える）
 */
export const HUNT_ROUNDS = 5;

export type HuntRule = 'all' | 'even' | 'mult3';
export const RULE_TEXT: Record<HuntRule, string> = { all: 'ちいさい じゅんに ぜんぶ', even: '2の ばいすう（2・4・6…）だけ', mult3: '3の ばいすう（3・6・9…）だけ' };
export const RULE_SHORT: Record<HuntRule, string> = { all: 'ぜんぶ', even: '2の ばいすう', mult3: '3の ばいすう' };

export interface NumberHuntPuzzle {
  size: number;
  rule: HuntRule;
  /** ラウンドごとの ならび（マスの じゅん。行 → 列）。1〜size² が 1つずつ */
  rounds: number[][];
}

export interface HuntRoundRecord {
  /** まちがえて おした 回数 */
  mistakes: number;
  /** はじめから まちがえずに できたか（まだなら undefined） */
  firstTry?: boolean;
  /** そのラウンドに かかった 時間（一時停止・画面を かくした 時間を のぞく。ミリ秒） */
  timeMs: number;
  /** 「もういちど」で このラウンドを やりなおした 回数 */
  restarts: number;
  cleared: boolean;
}

export interface NumberHuntAnswer {
  /** ラウンドごとに 正しく おした 数字（じゅんばん） */
  found: number[][];
  rounds: HuntRoundRecord[];
  timerOn: boolean;
  /** ぜんぶの 時間（ミリ秒） */
  timeMs: number;
}

export const HUNT_SIZE: Record<Difficulty, number> = { easy: 3, normal: 4, hard: 5, challenge: 6 };

/** さがす 数字（じゅんばん） */
export function huntTargets(p: Pick<NumberHuntPuzzle, 'size' | 'rule'>): number[] {
  const all = Array.from({ length: p.size * p.size }, (_, i) => i + 1);
  return p.rule === 'even' ? all.filter((n) => n % 2 === 0) : p.rule === 'mult3' ? all.filter((n) => n % 3 === 0) : all;
}

/** マスの ばしょ（行・列） */
export function cellOf(p: NumberHuntPuzzle, round: number, value: number): [number, number] {
  const i = p.rounds[round].indexOf(value);
  return [Math.floor(i / p.size), i % p.size];
}

/** 押した 数字を しらべる：つぎに さがす 数字か */
export function checkTap(p: NumberHuntPuzzle, foundCount: number, value: number): 'next' | 'done' | 'wrong' {
  const t = huntTargets(p);
  if (t[foundCount] !== value) return 'wrong';
  return foundCount + 1 === t.length ? 'done' : 'next';
}

function layout(rng: Rng, n: number) {
  return rng.shuffle(Array.from({ length: n * n }, (_, i) => i + 1));
}

export const numberHunt: GameLogic<NumberHuntPuzzle, NumberHuntAnswer> = {
  id: 'number-hunt',
  generatorVersion: 1,
  create(rng, d) {
    const size = HUNT_SIZE[d];
    const rule: HuntRule = d === 'challenge' ? rng.pick(['all', 'even', 'mult3'] as const) : 'all';
    const rounds: number[][] = [];
    for (let k = 0; k < HUNT_ROUNDS; k++) {
      let l = layout(rng, size);
      // ラウンドごとに ちがう ならび
      for (let t = 0; t < 5 && rounds.some((x) => x.join() === l.join()); t++) l = layout(rng, size);
      rounds.push(l);
    }
    return { size, rule, rounds };
  },
  validate(p, d) {
    if (p.size !== HUNT_SIZE[d]) return 'size';
    if (d !== 'challenge' && p.rule !== 'all') return 'rule';
    if (!['all', 'even', 'mult3'].includes(p.rule)) return 'rule';
    if (!Array.isArray(p.rounds) || p.rounds.length !== HUNT_ROUNDS) return 'rounds';
    const n = p.size * p.size;
    for (const r of p.rounds) {
      if (r.length !== n) return 'cells';
      const s = new Set(r);
      if (s.size !== n) return 'duplicate';
      for (let v = 1; v <= n; v++) if (!s.has(v)) return 'missing';
    }
    if (new Set(p.rounds.map((r) => r.join())).size !== HUNT_ROUNDS) return 'same layout';
    return null;
  },
  fallback(d) {
    const out: NumberHuntPuzzle[] = [];
    for (let seed = 1; seed < 50 && out.length < 3; seed++) {
      const p = numberHunt.create(createRng(seed), d);
      if (p && numberHunt.validate(p, d) === null) out.push(p);
    }
    return out;
  },
  judge(p, a) {
    if (!a || !Array.isArray(a.found)) return { correct: false, message: 'ちいさい かずから じゅんに さがそう' };
    const t = huntTargets(p);
    for (let k = 0; k < HUNT_ROUNDS; k++) {
      const f = a.found[k] ?? [];
      if (f.length !== t.length || f.some((v, i) => v !== t[i])) {
        const ok = f.every((v, i) => v === t[i]);
        return { correct: false, message: ok ? (k > 0 ? `${k}ラウンド まで できたよ` : 'ちいさい かずから じゅんに さがそう') : 'じゅんばんが ちがうよ' };
      }
    }
    return { correct: true };
  },
  hints(p, progress) {
    const pr = progress as { round?: number; index?: number } | undefined;
    const round = Math.min(pr?.round ?? 0, HUNT_ROUNDS - 1);
    const t = huntTargets(p);
    const target = t[Math.min(pr?.index ?? 0, t.length - 1)];
    const [r, c] = cellOf(p, round, target);
    // 行か 列かは 数字で きめる（いつも 同じ ヒントに なる）
    const line = target % 2 === 0 ? `うえから ${r + 1}ばんめの よこの れつに あるよ` : `ひだりから ${c + 1}ばんめの たての れつに あるよ`;
    return [`つぎに さがすのは「${target}」だよ`, line, 'うすく ひかって いる マスを よく みてね'];
  },
  key: (p) => `${p.size}:${p.rule}:${p.rounds.map((r) => r.join('.')).join('/')}`,
};

/** ヒント2の れつ：偶数は よこの れつ（行）、奇数は たての れつ（列） */
export const hintLine = (target: number): 'row' | 'col' => (target % 2 === 0 ? 'row' : 'col');
