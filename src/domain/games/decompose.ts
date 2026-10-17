import type { Difficulty } from '../types';
import { placeParts } from '../arithmetic/explain';
import { isPosInt, sum, type GameLogic } from './types';

/** 01 すうじ分解パズル */
export interface DecomposePuzzle {
  target: number;
  parts: number; // 2〜4
  /** 使ってはいけない数（チャレンジ） */
  forbidden: number[];
  /** 内部で作った分け方の例（ヒント・検証用。画面には出さない） */
  example: number[];
}

export type DecomposeAnswer = (number | null)[];

const RULES: Record<Difficulty, { min: number; max: number; parts: number[]; forbid: boolean }> = {
  easy: { min: 5, max: 20, parts: [2], forbid: false },
  normal: { min: 10, max: 100, parts: [2, 3], forbid: false },
  hard: { min: 100, max: 999, parts: [3], forbid: false },
  challenge: { min: 100, max: 9999, parts: [2, 3, 4], forbid: true },
};

/** 位取りを元に k 個の正の整数へ分ける例を作る */
export function exampleSplit(target: number, k: number, forbidden: number[] = []): number[] | null {
  if (target < k) return null;
  const parts = placeParts(target).slice();
  while (parts.length > k) {
    parts.sort((a, b) => b - a);
    const x = parts.pop()!;
    const y = parts.pop()!;
    parts.push(x + y);
  }
  while (parts.length < k) {
    parts.sort((a, b) => b - a);
    const big = parts.shift()!;
    if (big < 2) return null;
    const unit = 10 ** (String(big).length - 1);
    const lead = Math.floor(big / unit);
    if (big % unit === 0 && lead >= 2) parts.push(big - unit, unit);
    else parts.push(Math.ceil(big / 2), Math.floor(big / 2));
  }
  // 禁止数を含むなら、他の数と 1 ずつやりとりして避ける
  for (let guard = 0; guard < 20 && parts.some((p) => forbidden.includes(p)); guard++) {
    const i = parts.findIndex((p) => forbidden.includes(p));
    const j = parts.findIndex((p, idx) => idx !== i && p > 1);
    if (j < 0 || parts[i] <= 1) return null;
    parts[i] += 1;
    parts[j] -= 1;
  }
  parts.sort((a, b) => b - a);
  if (parts.length !== k || sum(parts) !== target || parts.some((p) => !isPosInt(p) || forbidden.includes(p))) return null;
  return parts;
}

export const solutionKey = (values: number[]) => [...values].sort((a, b) => a - b).join('+');

export const decompose: GameLogic<DecomposePuzzle, DecomposeAnswer> = {
  id: 'decompose',
  generatorVersion: 1,
  create(rng, d) {
    const r = RULES[d];
    const target = rng.int(r.min, r.max);
    const parts = rng.pick(r.parts);
    const forbidden: number[] = [];
    if (r.forbid && rng.chance(0.6)) {
      const lead = placeParts(target)[0];
      const choices = [100, 10, lead].filter((x) => x < target && x > 1);
      if (choices.length) forbidden.push(rng.pick(choices));
    }
    const example = exampleSplit(target, parts, forbidden);
    return example ? { target, parts, forbidden, example } : null;
  },
  validate(p, d) {
    const r = RULES[d];
    if (!isPosInt(p.target) || p.target < r.min || p.target > r.max) return 'target range';
    if (!r.parts.includes(p.parts)) return 'parts';
    if (p.target < p.parts) return 'too small';
    if (!r.forbid && p.forbidden.length) return 'forbidden not allowed';
    if (p.example.length !== p.parts || sum(p.example) !== p.target) return 'example';
    if (p.example.some((x) => !isPosInt(x) || p.forbidden.includes(x))) return 'example breaks rule';
    return null;
  },
  fallback(d) {
    const bank: Record<Difficulty, [number, number, number[]][]> = {
      easy: [[10, 2, []], [12, 2, []], [15, 2, []]],
      normal: [[48, 2, []], [75, 3, []], [100, 2, []]],
      hard: [[148, 3, []], [365, 3, []], [720, 3, []]],
      challenge: [[1234, 4, [100]], [500, 2, [100]], [2026, 3, [10]]],
    };
    return bank[d].map(([target, parts, forbidden]) => ({ target, parts, forbidden, example: exampleSplit(target, parts, forbidden)! }));
  },
  judge(p, answer) {
    if (answer.length !== p.parts || answer.some((x) => x === null)) return { correct: false, message: `${p.parts}つの はこ ぜんぶに かずを いれてね` };
    const values = answer as number[];
    if (values.some((x) => !isPosInt(x))) return { correct: false, message: '0 より おおきい かずを つかおう' };
    const bad = values.find((x) => p.forbidden.includes(x));
    if (bad !== undefined) return { correct: false, message: `${bad} は つかえないよ` };
    const total = sum(values);
    if (total !== p.target) return { correct: false, message: `いまの ごうけいは ${total}。${p.target} に するには？` };
    return { correct: true, solutionKey: solutionKey(values) };
  },
  hints(p) {
    const first = p.example[0];
    const rest = p.target - first;
    return [
      `まず ${first} を とりだせるかな？`,
      `${p.target} − ${first} で のこりは ${rest}`,
      p.parts === 2 ? `${first} + □ = ${p.target} の □ は？` : `のこりの ${rest} を ${p.parts - 1}つに わけてみよう`,
    ];
  },
  key: (p) => `${p.target}/${p.parts}/${p.forbidden.join(',')}`,
};
