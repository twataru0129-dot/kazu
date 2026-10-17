import type { Rng } from '../random';
import type { Op } from '../types';
import { generateProblem, levelLabel, type ArithProblem, type ArithSettings, type Carry, type DivLevel, type Digits, type MulLevel } from '../arithmetic/problems';

export type TestCount = 5 | 10 | 20 | 30;

export interface TestSettings {
  ops: Op[];
  add: { digits: Digits; carry: Carry };
  subtract: { digits: Digits; carry: Carry };
  mul: MulLevel;
  div: DivLevel;
  count: TestCount;
}

export const DEFAULT_TEST_SETTINGS: TestSettings = {
  ops: ['add', 'subtract'],
  add: { digits: 1, carry: 'mixed' },
  subtract: { digits: 1, carry: 'mixed' },
  mul: 'kuku',
  div: 'kuku',
  count: 10,
};

const ORDER: Op[] = ['add', 'subtract', 'multiply', 'divide'];

/** 同じ条件かどうかを判定するキー（選んでいない演算の設定は含めない） */
export function settingsKey(s: TestSettings): string {
  const ops = ORDER.filter((o) => s.ops.includes(o));
  const parts: string[] = [`n${s.count}`];
  for (const o of ops) {
    if (o === 'add') parts.push(`add:${s.add.digits}:${s.add.carry}`);
    if (o === 'subtract') parts.push(`sub:${s.subtract.digits}:${s.subtract.carry}`);
    if (o === 'multiply') parts.push(`mul:${s.mul}`);
    if (o === 'divide') parts.push(`div:${s.div}`);
  }
  return parts.join('|');
}

export function arithFor(s: TestSettings, op: Op): ArithSettings {
  const ds = op === 'subtract' ? s.subtract : s.add;
  return { ops: [op], digits: ds.digits, carry: ds.carry, mul: s.mul, div: s.div };
}

export function describeSettings(s: TestSettings): string {
  const ops = ORDER.filter((o) => s.ops.includes(o));
  const label = (o: Op) => {
    const sym = { add: '＋', subtract: '−', multiply: '×', divide: '÷' }[o];
    const a = arithFor(s, o);
    const key = o === 'multiply' ? `multiply:${a.mul}` : o === 'divide' ? `divide:${a.div}` : `${o}:d${a.digits}:${a.carry}`;
    return `${sym}（${levelLabel(key)}）`;
  };
  return `${ops.map(label).join(' ')}・${s.count}もん`;
}

/** 指定した演算をなるべく均等に振り分けて出題 */
export function generateTest(rng: Rng, s: TestSettings): ArithProblem[] {
  const ops = ORDER.filter((o) => s.ops.includes(o));
  if (ops.length === 0) throw new Error('select at least one op');
  const seq: Op[] = Array.from({ length: s.count }, (_, i) => ops[i % ops.length]);
  const recent: string[] = [];
  return rng.shuffle(seq).map((op) => {
    const p = generateProblem(rng, op, arithFor(s, op), new Set(recent.slice(-20)));
    recent.push(p.key);
    return p;
  });
}

export interface TestAnswer {
  value: number | null;
  skipped: boolean;
  correct: boolean;
  activeMs: number;
}

export interface TestScore {
  total: number;
  correct: number;
  wrong: number;
  skipped: number;
  /** 正答率 = 正解数 ÷ 設定した総問題数（スキップも分母に含む） */
  rate: number;
  totalActiveMs: number;
  /** 回答した問題（スキップ以外）の1問あたり時間の中央値 */
  medianMs: number | null;
  byOp: Partial<Record<Op, { total: number; correct: number; skipped: number }>>;
}

export function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function scoreTest(problems: ArithProblem[], answers: (TestAnswer | null)[], totalActiveMs: number): TestScore {
  const byOp: TestScore['byOp'] = {};
  let correct = 0;
  let skipped = 0;
  problems.forEach((p, i) => {
    const a = answers[i];
    const b = (byOp[p.op] ??= { total: 0, correct: 0, skipped: 0 });
    b.total++;
    if (a?.correct) {
      correct++;
      b.correct++;
    }
    if (!a || a.skipped) {
      skipped++;
      b.skipped++;
    }
  });
  const answeredMs = answers.filter((a): a is TestAnswer => !!a && !a.skipped).map((a) => a.activeMs);
  return {
    total: problems.length,
    correct,
    skipped,
    wrong: problems.length - correct - skipped,
    rate: problems.length ? correct / problems.length : 0,
    totalActiveMs,
    medianMs: median(answeredMs),
    byOp,
  };
}

/**
 * 時間の計測：見えていて一時停止していない間だけ進む。
 * 考えている間（操作がない時間）は含め、一時停止中・別タブ／アプリ中は除く。
 */
export class ActiveClock {
  private acc = 0;
  private since: number | null = null;
  constructor(private now: () => number = () => performance.now()) {}
  start() {
    if (this.since === null) this.since = this.now();
  }
  stop() {
    if (this.since !== null) {
      this.acc += this.now() - this.since;
      this.since = null;
    }
  }
  get running() {
    return this.since !== null;
  }
  elapsed(): number {
    return this.acc + (this.since !== null ? this.now() - this.since : 0);
  }
  reset(value = 0) {
    this.acc = value;
    this.since = null;
  }
}

export function formatMs(ms: number | null): string {
  if (ms === null) return '—';
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}びょう`;
  return `${Math.floor(s / 60)}ふん ${s % 60}びょう`;
}
