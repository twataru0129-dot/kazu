import { createRng, type Rng } from '../random';
import type { Difficulty } from '../types';
import type { GameLogic } from './types';

/**
 * 30 魔法陣パズル：たて・よこ・ななめの 合計が ぜんぶ 同じに なるように、あいた マスに かずを いれる。
 *
 * 3×3 は 1〜9（合計 15）、4×4 は 1〜16（合計 34）を 1かいずつ つかう。
 * 判定は「数学の 条件」で きめる（作るときの お手本と くらべない）：
 *   ぜんぶ うまって いる・整数・1〜N² を 1かいずつ・はじめの かずは そのまま・すべての 列の 合計が 目標。
 * 出題は お手本（3×3 は 洛書、4×4 は 確かめた 型）を 回転・裏がえし（4×4 は 17−x の 入れかえも）して つくり、
 * 答えが 1つに なるか 解いて 数えて（2つ まで）たしかめる。
 */
export interface MagicPuzzle {
  n: 3 | 4;
  /** はじめから ある かず（0 は あき） */
  givens: number[];
}

export interface MagicAnswer {
  cells: number[];
}

interface LevelConf {
  n: 3 | 4;
  blanks: [number, number];
}
export const MAGIC_LEVELS: Record<Difficulty, LevelConf> = {
  easy: { n: 3, blanks: [2, 3] },
  normal: { n: 3, blanks: [4, 5] },
  hard: { n: 3, blanks: [5, 6] },
  challenge: { n: 4, blanks: [6, 8] },
};

/** 目標の 合計：n(n²+1)/2 */
export const magicSum = (n: number) => (n * (n * n + 1)) / 2;

/** 洛書（3×3 の 魔方陣は これの 回転・裏がえしの 8つだけ） */
export const LO_SHU = [2, 7, 6, 9, 5, 1, 4, 3, 8];
/** 4×4 の 型（テストで 魔方陣か たしかめる） */
export const MAGIC4_TEMPLATES: number[][] = [
  [16, 3, 2, 13, 5, 10, 11, 8, 9, 6, 7, 12, 4, 15, 14, 1], // デューラー
  [1, 15, 14, 4, 12, 6, 7, 9, 8, 10, 11, 5, 13, 3, 2, 16],
  [1, 8, 13, 12, 14, 11, 2, 7, 4, 5, 16, 9, 15, 10, 3, 6], // 完全方陣
  [7, 12, 1, 14, 2, 13, 8, 11, 16, 3, 10, 5, 9, 6, 15, 4], // 完全方陣
  [1, 2, 15, 16, 12, 14, 3, 5, 13, 7, 10, 4, 8, 11, 6, 9],
  [2, 16, 13, 3, 11, 5, 8, 10, 7, 9, 12, 6, 14, 4, 1, 15],
];

/** たて・よこ・ななめ の 列（マスの 番号）。ならびは よこ → たて → ななめ（＼）→ ななめ（／） */
export function magicLines(n: number): number[][] {
  const rows = Array.from({ length: n }, (_, r) => Array.from({ length: n }, (__, c) => r * n + c));
  const cols = Array.from({ length: n }, (_, c) => Array.from({ length: n }, (__, r) => r * n + c));
  const d1 = Array.from({ length: n }, (_, i) => i * n + i);
  const d2 = Array.from({ length: n }, (_, i) => i * n + (n - 1 - i));
  return [...rows, ...cols, d1, d2];
}
export type LineKind = 'row' | 'col' | 'diag';
export const lineKind = (n: number, li: number): LineKind => (li < n ? 'row' : li < 2 * n ? 'col' : 'diag');
const KIND_WORD: Record<LineKind, string> = { row: 'よこ', col: 'たて', diag: 'ななめ' };
export function lineName(n: number, li: number): string {
  const k = lineKind(n, li);
  if (k === 'row') return `うえから ${li + 1}だんめの よこ`;
  if (k === 'col') return `ひだりから ${li - n + 1}れつめの たて`;
  return li === 2 * n ? 'ななめ（＼）' : 'ななめ（／）';
}

/** 魔方陣か（1〜n² を 1かいずつ・すべての 列が 目標の 合計） */
export function isMagic(cells: readonly number[], n: number): boolean {
  const N = n * n;
  if (cells.length !== N) return false;
  if (!cells.every((v) => Number.isInteger(v) && v >= 1 && v <= N)) return false;
  if (new Set(cells).size !== N) return false;
  const t = magicSum(n);
  return magicLines(n).every((l) => l.reduce((s, i) => s + cells[i], 0) === t);
}

/** 回転・裏がえしの 8とおり */
export function symmetries(cells: readonly number[], n: number): number[][] {
  const at = (g: readonly number[], r: number, c: number) => g[r * n + c];
  const rot = (g: readonly number[]) => Array.from({ length: n * n }, (_, k) => at(g, n - 1 - (k % n), Math.floor(k / n)));
  const flip = (g: readonly number[]) => Array.from({ length: n * n }, (_, k) => at(g, Math.floor(k / n), n - 1 - (k % n)));
  const out: number[][] = [];
  let g = [...cells];
  for (let i = 0; i < 4; i++) {
    out.push(g, flip(g));
    g = rot(g);
  }
  return out;
}

export const SOLVE_NODE_LIMIT = 200_000;

/**
 * 答えの 数を limit まで 数える（えだがり つきの バックトラック）。
 * 列の 途中の 合計が、のこりの 小さい・大きい かずで 目標に とどかない なら そこで やめる。
 * ノードの 上限を こえたら aborted。
 */
export function solveMagic(givens: readonly number[], n: number, limit = 2): { count: number; first: number[] | null; aborted: boolean } {
  const N = n * n;
  const t = magicSum(n);
  const lines = magicLines(n);
  const linesOf: number[][] = Array.from({ length: N }, () => []);
  lines.forEach((l, li) => l.forEach((i) => linesOf[i].push(li)));
  const cells = [...givens];
  const used = new Array<boolean>(N + 1).fill(false);
  for (const v of cells) {
    if (v !== 0) {
      if (!Number.isInteger(v) || v < 1 || v > N || used[v]) return { count: 0, first: null, aborted: false };
      used[v] = true;
    }
  }
  const blanks = cells.map((v, i) => (v === 0 ? i : -1)).filter((i) => i >= 0);
  // 列が 多く うまって いる マスから
  blanks.sort((a, b) => {
    const filled = (i: number) => linesOf[i].reduce((s, li) => s + lines[li].filter((k) => cells[k] !== 0).length, 0);
    return filled(b) - filled(a);
  });
  let count = 0;
  let first: number[] | null = null;
  let nodes = 0;
  let aborted = false;

  const lineOk = (li: number) => {
    let sum = 0;
    let empty = 0;
    for (const k of lines[li]) {
      if (cells[k] === 0) empty++;
      else sum += cells[k];
    }
    if (empty === 0) return sum === t;
    // のこりの かずの いちばん 小さい・大きい 組みあわせで とどくか
    let lo = 0;
    let hi = 0;
    for (let v = 1, c = 0; v <= N && c < empty; v++)
      if (!used[v]) {
        lo += v;
        c++;
      }
    for (let v = N, c = 0; v >= 1 && c < empty; v--)
      if (!used[v]) {
        hi += v;
        c++;
      }
    return sum + lo <= t && sum + hi >= t;
  };
  for (let li = 0; li < lines.length; li++) if (!lineOk(li)) return { count: 0, first: null, aborted: false };

  const rec = (k: number) => {
    if (count >= limit || aborted) return;
    if (++nodes > SOLVE_NODE_LIMIT) {
      aborted = true;
      return;
    }
    if (k === blanks.length) {
      count++;
      if (!first) first = [...cells];
      return;
    }
    const i = blanks[k];
    for (let v = 1; v <= N; v++) {
      if (used[v]) continue;
      cells[i] = v;
      used[v] = true;
      if (linesOf[i].every(lineOk)) rec(k + 1);
      used[v] = false;
      cells[i] = 0;
      if (count >= limit || aborted) return;
    }
  };
  rec(0);
  return { count, first, aborted };
}

function sourceSquare(rng: Rng, n: 3 | 4): number[] {
  if (n === 3) return rng.pick(symmetries(LO_SHU, 3));
  const base = rng.pick(MAGIC4_TEMPLATES);
  const sq = rng.pick(symmetries(base, 4));
  // 17 − x に いれかえても 魔方陣
  return rng.chance(0.5) ? sq.map((v) => 17 - v) : sq;
}

function build(rng: Rng, d: Difficulty): MagicPuzzle | null {
  const { n, blanks } = MAGIC_LEVELS[d];
  const sq = sourceSquare(rng, n);
  const k = rng.int(blanks[0], blanks[1]);
  const idx = rng.shuffle(Array.from({ length: n * n }, (_, i) => i));
  const holes = new Set(idx.slice(0, k));
  const givens = sq.map((v, i) => (holes.has(i) ? 0 : v));
  // 答えが 1つで ない ときは、あきを 1つずつ もどして（ヒントを ふやして）ためす。下限を わったら つくりなおし
  for (let h = k; h >= blanks[0]; h--) {
    const r = solveMagic(givens, n);
    if (r.aborted) return null;
    if (r.count === 1) return { n, givens };
    const back = idx.slice(0, h).at(-1)!;
    givens[back] = sq[back];
  }
  return null;
}

export const blankCount = (p: MagicPuzzle) => p.givens.filter((v) => v === 0).length;

/** 答え（1つだけの はず）。ヒント3で つかう */
const solutionCache = new Map<string, number[] | null>();
export function magicSolution(p: MagicPuzzle): number[] | null {
  const key = p.givens.join(',');
  if (!solutionCache.has(key)) {
    const r = solveMagic(p.givens, p.n, 1);
    solutionCache.set(key, r.first);
  }
  return solutionCache.get(key) ?? null;
}

/** 列ごとの いまの 合計と うまり ぐあい */
export function lineStatus(n: number, cells: readonly number[]) {
  const t = magicSum(n);
  return magicLines(n).map((l, li) => {
    const sum = l.reduce((s, i) => s + (cells[i] || 0), 0);
    const empty = l.filter((i) => !cells[i]).length;
    return { li, cells: l, sum, empty, complete: empty === 0, ok: empty === 0 && sum === t };
  });
}

/** ヒント2：あきが いちばん すくない 列（あきが 1つ以上） */
export function easiestLine(p: MagicPuzzle, cells: readonly number[]) {
  const st = lineStatus(p.n, cells).filter((s) => s.empty > 0);
  if (st.length === 0) return null;
  return st.reduce((a, b) => (b.empty < a.empty ? b : a));
}

const readCells = (p: MagicPuzzle, progress: unknown): number[] => {
  const N = p.n * p.n;
  const c = Array.isArray(progress) ? (progress as unknown[]) : [];
  return Array.from({ length: N }, (_, i) => (p.givens[i] !== 0 ? p.givens[i] : Number.isInteger(c[i]) && (c[i] as number) >= 1 && (c[i] as number) <= N ? (c[i] as number) : 0));
};

export const magicSquare: GameLogic<MagicPuzzle, MagicAnswer> = {
  id: 'magic-square',
  generatorVersion: 1,
  create: (rng, d) => build(rng, d),
  validate(p, d) {
    const { n, blanks } = MAGIC_LEVELS[d];
    if (p.n !== n) return 'size';
    const N = n * n;
    if (!Array.isArray(p.givens) || p.givens.length !== N) return 'givens';
    if (!p.givens.every((v) => Number.isInteger(v) && v >= 0 && v <= N)) return 'range';
    const filled = p.givens.filter((v) => v !== 0);
    if (new Set(filled).size !== filled.length) return 'duplicate';
    const k = N - filled.length;
    if (k < blanks[0] || k > blanks[1]) return 'blanks';
    const r = solveMagic(p.givens, n);
    if (r.aborted) return 'search limit';
    if (r.count === 0) return 'no solution';
    if (r.count > 1) return 'not unique';
    return null;
  },
  fallback(d) {
    const out: MagicPuzzle[] = [];
    for (let seed = 1; seed < 400 && out.length < 6; seed++) {
      const p = build(createRng(seed), d);
      if (p && magicSquare.validate(p, d) === null) out.push(p);
    }
    return out;
  },
  judge(p, a) {
    const N = p.n * p.n;
    const c = a?.cells;
    if (!Array.isArray(c) || c.length !== N) return { correct: false, message: 'かずを いれてね' };
    if (p.givens.some((v, i) => v !== 0 && c[i] !== v)) return { correct: false, message: 'はじめの かずは そのままに してね' };
    if (c.some((v) => v === 0 || v === null || v === undefined)) return { correct: false, message: `まだ あいて いる ところが あるよ（のこり ${c.filter((v) => !v).length}）` };
    if (!c.every((v) => Number.isInteger(v) && v >= 1 && v <= N)) return { correct: false, message: `1から ${N}までの かずを つかってね` };
    if (new Set(c).size !== N) return { correct: false, message: 'おなじ かずが 2かい つかわれて いるよ' };
    const bad = lineStatus(p.n, c).find((s) => !s.ok);
    if (!bad) return { correct: true };
    return { correct: false, message: `もうすこし！ ${KIND_WORD[lineKind(p.n, bad.li)]}の ごうけいを みてみよう` };
  },
  hints(p, progress) {
    const t = magicSum(p.n);
    const cells = readCells(p, progress);
    const line = easiestLine(p, cells);
    const sol = magicSolution(p);
    const h1 = `たて・よこ・ななめ、どの せんも ごうけい ${t} に なるよ。あいて いる ところが すくない せんから かんがえよう`;
    if (!line) return [h1, 'ぜんぶ うまったね。ごうけいが ちがう せんを さがしてみよう', 'ごうけいが ちがう せんの かずを いれかえてみよう'];
    const h2 = `ひかって いる ${lineName(p.n, line.li)}は あと ${line.empty}こ。いまの ごうけいは ${line.sum}`;
    const blank = line.cells.find((i) => !cells[i])!;
    const r = Math.floor(blank / p.n) + 1;
    const c = (blank % p.n) + 1;
    let h3: string;
    if (line.empty === 1) h3 = `${lineName(p.n, line.li)}の あいた ところは ${t} − ${line.sum} = ${t - line.sum}`;
    else h3 = sol ? `うえから ${r}だんめ・ひだりから ${c}れつめ は ${sol[blank]} だよ` : h2;
    return [h1, h2, h3];
  },
  key: (p) => `${p.n}:${p.givens.join(',')}`,
};
