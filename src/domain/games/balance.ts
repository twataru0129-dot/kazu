import type { Difficulty } from '../types';
import { hasCarryAdd } from '../arithmetic/problems';
import type { GameLogic } from './types';

/** 05 天秤バトル */
export interface Side {
  a: number;
  op: '+' | '-' | null; // null は数だけ
  b: number;
}
export interface BalancePuzzle {
  left: Side;
  right: Side;
}
export type BalanceAnswer = 'left' | 'equal' | 'right';

export function sideValue(s: Side): number {
  return s.op === '+' ? s.a + s.b : s.op === '-' ? s.a - s.b : s.a;
}
export function formatSide(s: Side): string {
  return s.op === null ? `${s.a}` : `${s.a} ${s.op === '+' ? '+' : '−'} ${s.b}`;
}
export function correctSide(p: BalancePuzzle): BalanceAnswer {
  const l = sideValue(p.left);
  const r = sideValue(p.right);
  return l > r ? 'left' : l < r ? 'right' : 'equal';
}

const RULES: Record<Difficulty, { lo: number; hi: number; vMax: number }> = {
  easy: { lo: 1, hi: 9, vMax: 18 },
  normal: { lo: 10, hi: 99, vMax: 198 },
  hard: { lo: 100, hi: 999, vMax: 1998 },
  challenge: { lo: 10, hi: 999, vMax: 1998 },
};

/** 値 v になる式を作る（オペランドは lo〜hi） */
function sideFor(rng: import('../random').Rng, v: number, lo: number, hi: number, d: Difficulty): Side | null {
  const op = rng.pick<'+' | '-'>(['+', '-']);
  if (op === '+') {
    const aMin = Math.max(lo, v - hi);
    const aMax = Math.min(hi, v - lo);
    if (aMin > aMax) return null;
    const a = rng.int(aMin, aMax);
    const s: Side = { a, op, b: v - a };
    if (d === 'hard' && !hasCarryAdd(s.a, s.b) && rng.chance(0.7)) return null;
    return s;
  }
  const bMax = Math.min(hi, hi - v);
  if (bMax < lo) return null;
  const b = rng.int(lo, bMax);
  return { a: v + b, op, b };
}

export const balance: GameLogic<BalancePuzzle, BalanceAnswer> = {
  id: 'balance',
  generatorVersion: 1,
  create(rng, d) {
    const r = RULES[d];
    const kind = d === 'challenge' ? rng.pick(['equal', 'equal', 'close', 'close', 'far']) : rng.pick(['equal', 'close', 'far']);
    const vMin = r.lo * 2 > 10 ? r.lo + 1 : 2;
    const L = rng.int(vMin, Math.floor(r.vMax * 0.8));
    const diff = kind === 'equal' ? 0 : kind === 'close' ? rng.int(1, d === 'easy' ? 2 : 3) : rng.int(3, Math.max(4, Math.floor(L / 3)));
    const R = rng.chance(0.5) ? L + diff : L - diff;
    if (R < 1) return null;
    const left = sideFor(rng, L, r.lo, r.hi, d);
    const right = sideFor(rng, R, r.lo, r.hi, d);
    if (!left || !right) return null;
    return rng.chance(0.5) ? { left, right } : { left: right, right: left };
  },
  validate(p, d) {
    const r = RULES[d];
    for (const s of [p.left, p.right]) {
      if (s.op === null) return 'need expression';
      for (const n of [s.a, s.b]) if (!Number.isInteger(n) || n < r.lo || n > r.hi) return 'operand range';
      if (sideValue(s) < 0) return 'negative';
    }
    if (formatSide(p.left) === formatSide(p.right)) return 'identical';
    return null;
  },
  fallback(d) {
    const bank: Record<Difficulty, BalancePuzzle[]> = {
      easy: [
        { left: { a: 3, op: '+', b: 4 }, right: { a: 9, op: '-', b: 2 } },
        { left: { a: 5, op: '+', b: 3 }, right: { a: 2, op: '+', b: 4 } },
      ],
      normal: [
        { left: { a: 27, op: '+', b: 15 }, right: { a: 50, op: '-', b: 10 } },
        { left: { a: 63, op: '-', b: 20 }, right: { a: 21, op: '+', b: 22 } },
      ],
      hard: [
        { left: { a: 100, op: '+', b: 127 }, right: { a: 400, op: '-', b: 171 } },
        { left: { a: 258, op: '+', b: 165 }, right: { a: 600, op: '-', b: 177 } },
      ],
      challenge: [
        { left: { a: 100, op: '+', b: 27 }, right: { a: 200, op: '-', b: 71 } },
        { left: { a: 349, op: '+', b: 151 }, right: { a: 999, op: '-', b: 499 } },
      ],
    };
    return bank[d];
  },
  judge(p, a) {
    const c = correctSide(p);
    if (a === c) return { correct: true };
    return { correct: false, message: 'もういちど りょうほうを けいさんしてみよう' };
  },
  hints(p) {
    return [
      'ひだりの しきを さきに けいさんしてみよう',
      `${formatSide(p.left)} = ${sideValue(p.left)}`,
      `みぎの ${formatSide(p.right)} も けいさんして ${sideValue(p.left)} と くらべよう`,
    ];
  },
  key: (p) => `${formatSide(p.left)}|${formatSide(p.right)}`,
};
