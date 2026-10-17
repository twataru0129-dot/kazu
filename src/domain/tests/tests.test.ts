import { describe, expect, it } from 'vitest';
import { createRng } from '../random';
import { ActiveClock, DEFAULT_TEST_SETTINGS, generateTest, median, scoreTest, settingsKey, type TestAnswer } from './scoring';
import { completedTests, practiceSuggestions, previousSame, statsByLevel } from './stats';
import type { Session, StoredAttempt } from '../../persistence/types';

describe('test generation', () => {
  it('distributes selected ops evenly and respects per-op levels', () => {
    for (const count of [5, 10, 20, 30] as const) {
      const s = { ...DEFAULT_TEST_SETTINGS, ops: ['add', 'subtract', 'multiply'] as const, count, add: { digits: 2 as const, carry: 'with' as const } };
      const ps = generateTest(createRng(count), { ...s, ops: [...s.ops] });
      expect(ps).toHaveLength(count);
      const counts = ['add', 'subtract', 'multiply'].map((o) => ps.filter((p) => p.op === o).length);
      expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
      for (const p of ps.filter((x) => x.op === 'add')) {
        expect(p.carry).toBe(true);
        expect(p.a).toBeGreaterThanOrEqual(10);
      }
    }
  });
  it('settings key ignores unselected ops', () => {
    const a = settingsKey({ ...DEFAULT_TEST_SETTINGS, ops: ['add'], mul: 'kuku' });
    const b = settingsKey({ ...DEFAULT_TEST_SETTINGS, ops: ['add'], mul: '2x1' });
    expect(a).toBe(b);
    expect(settingsKey({ ...DEFAULT_TEST_SETTINGS, count: 5 })).not.toBe(settingsKey({ ...DEFAULT_TEST_SETTINGS, count: 10 }));
  });
});

describe('scoring', () => {
  it('rate = correct / total, skipped is counted separately and stays in the denominator', () => {
    const ps = generateTest(createRng(1), { ...DEFAULT_TEST_SETTINGS, count: 5 });
    const ans: (TestAnswer | null)[] = [
      { value: ps[0].answer, skipped: false, correct: true, activeMs: 3000 },
      { value: ps[1].answer + 1, skipped: false, correct: false, activeMs: 5000 },
      { value: null, skipped: true, correct: false, activeMs: 9000 },
      { value: ps[3].answer, skipped: false, correct: true, activeMs: 1000 },
      null,
    ];
    const s = scoreTest(ps, ans, 20000);
    expect(s).toMatchObject({ total: 5, correct: 2, wrong: 1, skipped: 2, rate: 0.4 });
    expect(s.medianMs).toBe(3000);
  });
  it('median handles even and empty lists', () => {
    expect(median([])).toBeNull();
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });
  it('active clock excludes paused time', () => {
    let t = 0;
    const c = new ActiveClock(() => t);
    c.start();
    t = 1000;
    c.stop();
    t = 60000; // 一時停止・別アプリ中
    c.start();
    t = 61500;
    expect(c.elapsed()).toBe(2500);
  });
});

describe('aggregation from raw records', () => {
  const sess = (id: string, status: Session['status'], key = 'k', completedAt = '2026-01-01'): Session => ({
    id,
    profileId: 'p',
    mode: 'test',
    createdAt: completedAt,
    updatedAt: completedAt,
    completedAt: status === 'completed' ? completedAt : undefined,
    status,
    settingsSnapshot: {},
    summary: status === 'completed' ? { key, settings: DEFAULT_TEST_SETTINGS, score: { total: 1 } } : undefined,
  });
  const att = (sessionId: string, i: number, ok: boolean, mode: 'test' | 'calculation' = 'test'): StoredAttempt => ({
    id: `${sessionId}-${i}`,
    profileId: 'p',
    sessionId,
    mode,
    op: 'add',
    levelKey: 'add:d1:mixed',
    difficulty: 'easy',
    questionKey: 'q',
    generatorVersion: 1,
    questionSnapshot: {},
    answerSnapshot: 1,
    firstTryCorrect: ok,
    finalCorrect: ok,
    retryCount: 0,
    hintsUsed: 0,
    answeredAt: '2026-01-01',
  });

  it('unfinished tests are not mixed into completed statistics', () => {
    const sessions = [sess('done', 'completed'), sess('draft', 'inProgress')];
    const attempts = [att('done', 1, true), att('draft', 1, false), att('draft', 2, false)];
    const st = statsByLevel(attempts, sessions, ['test']);
    expect(st[0].n).toBe(1);
    expect(st[0].rate).toBe(1);
    expect(completedTests(sessions)).toHaveLength(1);
  });

  it('suggestions need at least 10 samples', () => {
    const few = statsByLevel(Array.from({ length: 5 }, (_, i) => att('c', i, false, 'calculation')), []);
    expect(practiceSuggestions(few)).toHaveLength(0);
    const many = statsByLevel(Array.from({ length: 12 }, (_, i) => att('c', i, i < 3, 'calculation')), []);
    expect(practiceSuggestions(many)).toHaveLength(1);
  });

  it('previous comparison only uses the same settings', () => {
    const tests = completedTests([sess('a', 'completed', 'k1', '2026-01-01'), sess('b', 'completed', 'k2', '2026-01-02'), sess('c', 'completed', 'k1', '2026-01-03')]);
    const cur = tests.find((t) => t.session.id === 'c')!;
    expect(previousSame(tests, cur)?.session.id).toBe('a');
    const other = tests.find((t) => t.session.id === 'b')!;
    expect(previousSame(tests, other)).toBeUndefined();
  });
});
