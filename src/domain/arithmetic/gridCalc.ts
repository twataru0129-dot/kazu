import type { Rng } from '../random';
import type { Difficulty, Op } from '../types';

/**
 * 100マス計算（「けいさん」の マスけいさん）。
 * 表の 左（行）と 上（列）に かずを ならべ、まじわる マスに「左 ○ 上」の こたえを 入れる。
 * 1まいの 盤では 演算は 1しゅるいだけ。どの マスも 同じ きまり（左 ○ 上）で 計算できる。
 *
 * - 引き算は 左 ≧ 上 に なるよう かずを えらぶ（こたえが マイナスに ならない）
 * - 割り算は 左を「上の かず ぜんぶの 公倍数 L」の 倍数に し、上は L の 約数（1 と L を のぞく 10こ）に する。
 *   → どの マスも 割りきれ、0 で わる ことは ない
 * - かずの ならびは 毎回 シャッフル（シード付き 乱数）
 */
export const GRID_CALC_ID = 'grid-calc';
export const GRID_GENERATOR_VERSION = 1;

export interface GridPuzzle {
  difficulty: Difficulty;
  op: Op;
  /** 左（行）の かず */
  left: number[];
  /** 上（列）の かず */
  top: number[];
}

export const GRID_SIZE: Record<Difficulty, number> = { easy: 3, normal: 5, hard: 10, challenge: 10 };
export const GRID_OPS: Record<Difficulty, Op[]> = {
  easy: ['add'],
  normal: ['add', 'subtract'],
  hard: ['add', 'subtract', 'multiply'],
  challenge: ['add', 'subtract', 'multiply', 'divide'],
};
/** 割り算の 公倍数 L と、その 約数（1 と L を のぞく ちょうど 10こ） */
export const DIVIDE_BASES: Record<number, number[]> = {
  60: [2, 3, 4, 5, 6, 10, 12, 15, 20, 30],
  72: [2, 3, 4, 6, 8, 9, 12, 18, 24, 36],
  84: [2, 3, 4, 6, 7, 12, 14, 21, 28, 42],
  90: [2, 3, 5, 6, 9, 10, 15, 18, 30, 45],
};

export const isGridOpAllowed = (d: Difficulty, op: Op) => GRID_OPS[d].includes(op);

const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
const pickN = (rng: Rng, from: number[], n: number) => rng.shuffle(from).slice(0, n);

export function cellAnswer(op: Op, a: number, b: number): number {
  switch (op) {
    case 'add':
      return a + b;
    case 'subtract':
      return a - b;
    case 'multiply':
      return a * b;
    case 'divide':
      return a / b;
  }
}

/** 正しい こたえの 表（行 → 列） */
export const gridAnswers = (p: GridPuzzle): number[][] => p.left.map((a) => p.top.map((b) => cellAnswer(p.op, a, b)));

export function generateGrid(rng: Rng, d: Difficulty, op: Op): GridPuzzle {
  if (!isGridOpAllowed(d, op)) throw new Error(`grid: ${op} is not available on ${d}`);
  const n = GRID_SIZE[d];
  let left: number[];
  let top: number[];
  if (d === 'easy') {
    // こたえが 10 いない：1〜5 ＋ 1〜5
    left = pickN(rng, range(1, 5), n);
    top = pickN(rng, range(1, 5), n);
  } else if (d === 'normal') {
    if (op === 'add') {
      // こたえは 20 いない
      left = pickN(rng, range(1, 10), n);
      top = pickN(rng, range(1, 10), n);
    } else {
      // 11〜20 − 1〜9（こたえは 2〜19）
      left = pickN(rng, range(11, 20), n);
      top = pickN(rng, range(1, 9), n);
    }
  } else if (d === 'hard') {
    if (op === 'add') {
      left = pickN(rng, range(1, 19), n);
      top = rng.shuffle(range(0, 9));
    } else if (op === 'subtract') {
      left = rng.shuffle(range(10, 19));
      top = rng.shuffle(range(0, 9));
    } else {
      // 九九（0〜9 × 0〜9）
      left = rng.shuffle(range(0, 9));
      top = rng.shuffle(range(0, 9));
    }
  } else {
    if (op === 'add') {
      left = pickN(rng, range(10, 99), n);
      top = pickN(rng, range(1, 19), n);
    } else if (op === 'subtract') {
      left = pickN(rng, range(50, 99), n);
      top = pickN(rng, range(1, 49), n);
    } else if (op === 'multiply') {
      // 2けた × 1けた
      left = pickN(rng, range(11, 25), n);
      top = rng.shuffle(range(0, 9));
    } else {
      const base = rng.pick(Object.keys(DIVIDE_BASES).map(Number));
      left = rng.shuffle(range(1, 10)).map((m) => base * m);
      top = rng.shuffle(DIVIDE_BASES[base]);
    }
  }
  return { difficulty: d, op, left, top };
}

/** 盤の きまり。合っていれば null */
export function validateGrid(p: GridPuzzle): string | null {
  const n = GRID_SIZE[p.difficulty];
  if (!isGridOpAllowed(p.difficulty, p.op)) return 'op';
  if (p.left.length !== n || p.top.length !== n) return 'size';
  if (new Set(p.left).size !== n || new Set(p.top).size !== n) return 'duplicate';
  if ([...p.left, ...p.top].some((v) => !Number.isInteger(v) || v < 0)) return 'number';
  if (p.op === 'divide' && p.top.some((b) => b === 0)) return 'divide by zero';
  for (const row of gridAnswers(p)) for (const v of row) if (!Number.isInteger(v) || v < 0) return 'answer';
  if (p.difficulty === 'easy' && gridAnswers(p).some((r) => r.some((v) => v > 10))) return 'easy too big';
  if (p.difficulty === 'normal' && gridAnswers(p).some((r) => r.some((v) => v > 20))) return 'normal too big';
  return null;
}

export const gridKey = (p: GridPuzzle) => `${p.difficulty}:${p.op}:${p.left.join(',')}/${p.top.join(',')}`;
export const gridLevelKey = (d: Difficulty, op: Op) => `grid:${d}:${op}`;

/** マスの 入力（行 → 列。未入力は ''） */
export type GridInputs = string[][];
export const emptyInputs = (p: GridPuzzle): GridInputs => p.left.map(() => p.top.map(() => ''));

export interface GridCheck {
  /** マスごとの 結果（正しい・ちがう） */
  marks: ('ok' | 'ng')[][];
  correct: number;
  total: number;
  allCorrect: boolean;
}

/** こたえあわせ：数として 読めて、正しい こたえと ぴったり 同じなら 正解 */
export function checkGrid(p: GridPuzzle, inputs: GridInputs): GridCheck {
  const ans = gridAnswers(p);
  let correct = 0;
  const marks = ans.map((row, r) =>
    row.map((v, c) => {
      const raw = inputs[r]?.[c] ?? '';
      const ok = /^\d+$/.test(raw) && Number(raw) === v;
      if (ok) correct++;
      return ok ? ('ok' as const) : ('ng' as const);
    }),
  );
  const total = ans.length * (ans[0]?.length ?? 0);
  return { marks, correct, total, allCorrect: correct === total };
}

export const filledCount = (inputs: GridInputs) => inputs.reduce((s, row) => s + row.filter((v) => v !== '').length, 0);

/** つぎの 未入力マス（行 → 列 の じゅん。なければ null） */
export function nextEmpty(inputs: GridInputs, from: [number, number]): [number, number] | null {
  const n = inputs.length;
  const m = inputs[0]?.length ?? 0;
  const start = from[0] * m + from[1];
  for (let k = 1; k <= n * m; k++) {
    const i = (start + k) % (n * m);
    const r = Math.floor(i / m);
    const c = i % m;
    if (inputs[r][c] === '') return [r, c];
  }
  return null;
}

export const GRID_DIFF_LABEL: Record<Difficulty, string> = { easy: '3×3', normal: '5×5', hard: '10×10', challenge: '10×10' };

/** 完了した 盤の まとめ（セッションの summary に 入れる） */
export interface GridSummary {
  difficulty: Difficulty;
  op: Op;
  cells: number;
  correct: number;
  /** はじめての こたえあわせで 正しかった マス */
  firstCorrect: number;
  /** なおした かいすう（こたえあわせの あとに まちがいを なおして もう一度 こたえあわせ した 回数） */
  fixes: number;
  /** タイマーを 表示して いたか（表示した ときだけ 時間を 比べる） */
  timerOn: boolean;
  /** 一時停止・画面を かくした 時間を のぞいた 時間（ミリ秒） */
  activeMs: number;
  /** はじめての こたえあわせで ぜんぶ 正しかった */
  perfect: boolean;
}

/** 自己ベスト：同じ 条件（難しさ・演算）で、タイマー表示あり・はじめで ぜんぶ 正しかった 記録の いちばん 短い 時間 */
export function bestGridTime(summaries: readonly GridSummary[], d: Difficulty, op: Op): number | null {
  const xs = summaries.filter((s) => s.difficulty === d && s.op === op && s.timerOn && s.perfect && s.activeMs > 0).map((s) => s.activeMs);
  return xs.length ? Math.min(...xs) : null;
}
