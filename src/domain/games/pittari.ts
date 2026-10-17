import type { Difficulty } from '../types';
import { canonicalLinearKey, evaluateLinear, formatLinear, type AddSubOp, type LinearExpr } from '../expr';
import { isPosInt, type GameLogic } from './types';

/** 02 ぴったり計算：答えが target になる式をたくさん作る */
export interface PittariPuzzle {
  target: number;
  terms: 2 | 3;
  ops: AddSubOp[];
  min: number;
  max: number;
  /** 使えない数（チャレンジ） */
  forbidden: number[];
  /** 事前に数えた「ちがう式」の数（2以上を保証） */
  solutionCount: number;
  /** ヒント用の例 */
  example: LinearExpr;
}

export interface PittariAnswer {
  nums: (number | null)[];
  ops: AddSubOp[];
}

const RULES: Record<Difficulty, { tMin: number; tMax: number; terms: 2 | 3; ops: AddSubOp[]; max: number; forbid: boolean }> = {
  easy: { tMin: 5, tMax: 10, terms: 2, ops: ['+'], max: 10, forbid: false },
  normal: { tMin: 10, tMax: 30, terms: 2, ops: ['+', '-'], max: 50, forbid: false },
  hard: { tMin: 20, tMax: 100, terms: 2, ops: ['+', '-'], max: 100, forbid: false },
  challenge: { tMin: 20, tMax: 100, terms: 3, ops: ['+', '-'], max: 100, forbid: true },
};

/** 条件を満たす式をすべて列挙（並べ替え違いは1つと数える） */
export function enumerateSolutions(p: Pick<PittariPuzzle, 'target' | 'terms' | 'ops' | 'min' | 'max' | 'forbidden'>, limit = Infinity): LinearExpr[] {
  const seen = new Map<string, LinearExpr>();
  const nums: number[] = [];
  for (let n = p.min; n <= p.max; n++) if (!p.forbidden.includes(n)) nums.push(n);
  const opsList: AddSubOp[][] = p.terms === 2 ? p.ops.map((o) => [o]) : p.ops.flatMap((o1) => p.ops.map((o2) => [o1, o2]));
  for (const ops of opsList) {
    for (const a of nums) {
      if (p.terms === 2) {
        const b = ops[0] === '+' ? p.target - a : a - p.target;
        if (b >= p.min && b <= p.max && !p.forbidden.includes(b)) {
          const e = { nums: [a, b], ops };
          seen.set(canonicalLinearKey(e), e);
        }
      } else {
        for (const b of nums) {
          const ab = ops[0] === '+' ? a + b : a - b;
          const c = ops[1] === '+' ? p.target - ab : ab - p.target;
          if (c >= p.min && c <= p.max && !p.forbidden.includes(c)) {
            const e = { nums: [a, b, c], ops };
            seen.set(canonicalLinearKey(e), e);
          }
          if (seen.size >= limit) return [...seen.values()];
        }
      }
      if (seen.size >= limit) return [...seen.values()];
    }
  }
  return [...seen.values()];
}

export const pittari: GameLogic<PittariPuzzle, PittariAnswer> = {
  id: 'pittari',
  generatorVersion: 1,
  create(rng, d) {
    const r = RULES[d];
    const target = rng.int(r.tMin, r.tMax);
    const forbidden = r.forbid ? [rng.pick([10, 5, Math.floor(target / 2)].filter((x) => x > 0))] : [];
    const base = { target, terms: r.terms, ops: r.ops, min: 1, max: r.max, forbidden };
    const sols = enumerateSolutions(base);
    if (sols.length < 2) return null;
    return { ...base, solutionCount: sols.length, example: rng.pick(sols) };
  },
  validate(p, d) {
    const r = RULES[d];
    if (p.target < r.tMin || p.target > r.tMax) return 'target range';
    if (p.terms !== r.terms || p.max !== r.max || p.min !== 1) return 'shape';
    const sols = enumerateSolutions(p);
    if (sols.length < 2 || sols.length !== p.solutionCount) return 'solutions';
    if (!pittari.judge(p, { nums: p.example.nums, ops: p.example.ops }).correct) return 'example';
    return null;
  },
  fallback(d) {
    const r = RULES[d];
    const targets: Record<Difficulty, number[]> = { easy: [5, 8, 10], normal: [12, 20, 25], hard: [50, 75, 100], challenge: [30, 50, 64] };
    return targets[d].map((target) => {
      const base = { target, terms: r.terms, ops: r.ops, min: 1, max: r.max, forbidden: r.forbid ? [10] : [] };
      const sols = enumerateSolutions(base);
      return { ...base, solutionCount: sols.length, example: sols[0] };
    });
  },
  judge(p, a) {
    if (a.nums.length !== p.terms || a.ops.length !== p.terms - 1 || a.nums.some((n) => n === null))
      return { correct: false, message: 'ぜんぶの はこに かずを いれてね' };
    const nums = a.nums as number[];
    if (nums.some((n) => !isPosInt(n))) return { correct: false, message: '1 いじょうの かずを つかおう' };
    if (nums.some((n) => n < p.min || n > p.max)) return { correct: false, message: `つかえる かずは ${p.min}〜${p.max} だよ` };
    const bad = nums.find((n) => p.forbidden.includes(n));
    if (bad !== undefined) return { correct: false, message: `${bad} は つかえないよ` };
    if (a.ops.some((o) => !p.ops.includes(o))) return { correct: false, message: 'その きごうは つかえないよ' };
    const e = { nums, ops: a.ops };
    const v = evaluateLinear(e);
    if (!v) return { correct: false, message: 'しきを たしかめてね' };
    if (v.value !== p.target) return { correct: false, message: `${formatLinear(e)} = ${v.value} だね。${p.target} に するには？` };
    return { correct: true, solutionKey: canonicalLinearKey(e) };
  },
  hints(p) {
    const e = p.example;
    const half = Math.floor(p.target / 2);
    return [
      p.target >= 10 ? `${p.target} は 10 と いくつ？` : `${p.target} は 1 と いくつ？`,
      `${half} + ${p.target - half} = ${p.target} から はじめて、かずを ずらしてみよう`,
      `たとえば ${e.nums[0]} ${e.ops[0] === '+' ? '+' : '−'} □ ${e.nums.length === 3 ? `${e.ops[1] === '+' ? '+' : '−'} □ ` : ''}= ${p.target}`,
    ];
  },
  key: (p) => `${p.target}/${p.terms}/${p.forbidden.join(',')}`,
};
