import { createRng, type Rng } from '../random';
import type { Difficulty } from '../types';
import type { GameLogic } from './types';

/** 12 ミニ数独（4×4・1〜4） */
export interface SudokuPuzzle {
  givens: number[]; // 16マス、0は空欄
  solution: number[];
}
export type SudokuAnswer = number[];

const N = 4;
const BASE = [1, 2, 3, 4, 3, 4, 1, 2, 2, 1, 4, 3, 4, 3, 2, 1];

export const rowOf = (i: number) => Math.floor(i / N);
export const colOf = (i: number) => i % N;
export const boxOf = (i: number) => Math.floor(rowOf(i) / 2) * 2 + Math.floor(colOf(i) / 2);

/** マス i と同じ行・列・ブロックのマス */
export function peers(i: number): number[] {
  const out: number[] = [];
  for (let j = 0; j < 16; j++) if (j !== i && (rowOf(j) === rowOf(i) || colOf(j) === colOf(i) || boxOf(j) === boxOf(i))) out.push(j);
  return out;
}
const PEERS = Array.from({ length: 16 }, (_, i) => peers(i));

export function candidates(grid: number[], i: number): number[] {
  if (grid[i] !== 0) return [];
  const used = new Set(PEERS[i].map((j) => grid[j]));
  return [1, 2, 3, 4].filter((v) => !used.has(v));
}

/** 解の個数を limit まで数える（バックトラック） */
export function countSolutions(grid: number[], limit = 2): number {
  const g = [...grid];
  let count = 0;
  const rec = (): void => {
    if (count >= limit) return;
    let best = -1;
    let bestC: number[] = [];
    for (let i = 0; i < 16; i++) {
      if (g[i] !== 0) continue;
      const c = candidates(g, i);
      if (c.length === 0) return;
      if (best < 0 || c.length < bestC.length) {
        best = i;
        bestC = c;
      }
    }
    if (best < 0) {
      count++;
      return;
    }
    for (const v of bestC) {
      g[best] = v;
      rec();
      g[best] = 0;
    }
  };
  rec();
  return count;
}

/** 「このマスに入る数は1つだけ」を繰り返すだけで解けるか（やさしさの目安） */
export function solvableByNakedSingles(grid: number[]): boolean {
  const g = [...grid];
  let progress = true;
  while (progress) {
    progress = false;
    for (let i = 0; i < 16; i++) {
      if (g[i] !== 0) continue;
      const c = candidates(g, i);
      if (c.length === 1) {
        g[i] = c[0];
        progress = true;
      }
    }
  }
  return g.every((v) => v !== 0);
}

export function isValidComplete(grid: number[]): boolean {
  if (grid.length !== 16 || grid.some((v) => !Number.isInteger(v) || v < 1 || v > 4)) return false;
  return grid.every((v, i) => PEERS[i].every((j) => grid[j] !== v));
}

/** 重複しているマス（見直し用の表示に使う） */
export function conflicts(grid: number[]): number[] {
  return grid.flatMap((v, i) => (v !== 0 && PEERS[i].some((j) => grid[j] === v) ? [i] : []));
}

function transformed(rng: Rng): number[] {
  const perm = rng.shuffle([1, 2, 3, 4]);
  let g = BASE.map((v) => perm[v - 1]);
  const rowOrder = (rng.chance(0.5) ? [[0, 1], [2, 3]] : [[2, 3], [0, 1]]).flatMap((band) => (rng.chance(0.5) ? band : [band[1], band[0]]));
  const colOrder = (rng.chance(0.5) ? [[0, 1], [2, 3]] : [[2, 3], [0, 1]]).flatMap((st) => (rng.chance(0.5) ? st : [st[1], st[0]]));
  g = Array.from({ length: 16 }, (_, i) => g[rowOrder[rowOf(i)] * N + colOrder[colOf(i)]]);
  if (rng.chance(0.5)) g = Array.from({ length: 16 }, (_, i) => g[colOf(i) * N + rowOf(i)]);
  return g;
}

const BLANKS: Record<Difficulty, [number, number]> = { easy: [4, 5], normal: [6, 7], hard: [8, 10], challenge: [10, 12] };

export const sudoku: GameLogic<SudokuPuzzle, SudokuAnswer> = {
  id: 'sudoku',
  generatorVersion: 1,
  create(rng, d) {
    const solution = transformed(rng);
    const [lo, hi] = BLANKS[d];
    const want = rng.int(lo, hi);
    const g = [...solution];
    let blanks = 0;
    for (const i of rng.shuffle(Array.from({ length: 16 }, (_, k) => k))) {
      if (blanks >= want) break;
      const v = g[i];
      g[i] = 0;
      if (countSolutions(g, 2) === 1) blanks++;
      else g[i] = v;
    }
    if (blanks < lo) return null;
    return { givens: g, solution };
  },
  validate(p, d) {
    if (p.givens.length !== 16 || !isValidComplete(p.solution)) return 'solution';
    if (p.givens.some((v, i) => v !== 0 && v !== p.solution[i])) return 'givens mismatch';
    const blanks = p.givens.filter((v) => v === 0).length;
    const [lo, hi] = BLANKS[d];
    if (blanks < lo || blanks > hi) return 'blank count';
    if (countSolutions(p.givens, 2) !== 1) return 'not unique';
    if ((d === 'easy' || d === 'normal') && !solvableByNakedSingles(p.givens)) return 'too hard';
    return null;
  },
  fallback(d) {
    // 固定シードで作り、検証を通ったものだけを予備にする（毎回同じ盤面）
    const out: SudokuPuzzle[] = [];
    for (let seed = 1; seed < 400 && out.length < 3; seed++) {
      const p = sudoku.create(createRng(seed), d);
      if (p && sudoku.validate(p, d) === null) out.push(p);
    }
    return out;
  },
  judge(p, a) {
    if (a.length !== 16 || a.some((v) => v === 0)) return { correct: false, message: 'まだ あいている マスが あるよ' };
    if (p.givens.some((v, i) => v !== 0 && a[i] !== v)) return { correct: false };
    if (!isValidComplete(a)) return { correct: false, message: 'おなじ かずが ならんでいる ところが あるよ。みなおしてみよう' };
    return { correct: true };
  },
  hints(p, progress) {
    const i = sudokuHintCell(p, (progress as number[] | undefined) ?? p.givens);
    if (i < 0) return ['ぜんぶ うまっているね。みなおしてみよう', 'たて・よこ・ブロックに おなじ かずが ないかな？', 'こたえあわせ してみよう'];
    return [
      `${rowOf(i) + 1}ぎょうめ で まだ つかっていない かずは？`,
      `${rowOf(i) + 1}ぎょうめ・${colOf(i) + 1}れつめ の マスを みよう。たて・よこ・ブロックに ない かずは？`,
      `その マスには ${p.solution[i]} が はいるよ`,
    ];
  },
  key: (p) => p.givens.join(''),
};

/** ヒントで示すマス：まだ正しく埋まっていない空欄のうち、候補が最も少ないマス */
export function sudokuHintCell(p: SudokuPuzzle, grid: number[]): number {
  let best = -1;
  let bestN = 99;
  for (let i = 0; i < 16; i++) {
    if (p.givens[i] !== 0 || grid[i] === p.solution[i]) continue;
    const n = candidates(p.givens, i).length;
    if (n < bestN) {
      best = i;
      bestN = n;
    }
  }
  return best;
}
