import { createRng } from '../random';
import type { Difficulty } from '../types';
import type { GameLogic } from './types';

/**
 * 20 きごうを おぼえよう：見本の格子と同じ位置に、同じ記号を置く。
 * 空白のマスも含めて、全マスが一致したら正解。
 * むずかしい・チャレンジは、見本を決まった秒数だけ見てから（消えてから）答える。
 */
export type SymbolId = 'circle' | 'double' | 'cross' | 'triangle' | 'square' | 'diamond' | 'star';
export const SYMBOLS: SymbolId[] = ['circle', 'cross', 'triangle', 'square', 'star', 'diamond', 'double'];
export const SYMBOL_CHAR: Record<SymbolId, string> = { circle: '○', double: '◎', cross: '×', triangle: '△', square: '□', diamond: '◇', star: '☆' };
export const SYMBOL_NAME: Record<SymbolId, string> = { circle: 'まる', double: 'にじゅうまる', cross: 'ばつ', triangle: 'さんかく', square: 'しかく', diamond: 'ひしがた', star: 'ほし' };

export type Cell = SymbolId | null;

export interface SymbolMemoryPuzzle {
  size: number;
  /** パレットに出す記号（この問題で使う記号すべて） */
  symbols: SymbolId[];
  /** 見本：size×size を行ごとに並べたもの。null は空白 */
  cells: Cell[];
  /** 見本を見せる時間（ミリ秒）。null なら いつも見える */
  showMs: number | null;
}

export interface SymbolMemoryAnswer {
  cells: Cell[];
  /** 「もういちど みる」を押した回数（いつも見える難易度では 0） */
  reshows: number;
}

export const RULES: Record<Difficulty, { size: number; kinds: [number, number]; filled: [number, number]; showMs: number | null }> = {
  easy: { size: 2, kinds: [2, 2], filled: [2, 3], showMs: null },
  normal: { size: 3, kinds: [3, 4], filled: [4, 6], showMs: null },
  hard: { size: 4, kinds: [5, 5], filled: [6, 9], showMs: 8000 },
  challenge: { size: 5, kinds: [7, 7], filled: [10, 15], showMs: 6000 },
};

/** まちがいやすい ○ と ◎ は、ほかの記号が足りないときだけ いっしょに使う */
const EASY_FIRST: SymbolId[] = ['circle', 'cross', 'triangle', 'square', 'star', 'diamond', 'double'];

export const emptyCells = (p: Pick<SymbolMemoryPuzzle, 'size'>): Cell[] => Array(p.size * p.size).fill(null);

/** 見本と違うマスの番号（空白どうしは一致） */
export function symbolMismatches(p: SymbolMemoryPuzzle, cells: readonly Cell[]): number[] {
  const out: number[] = [];
  p.cells.forEach((v, i) => (cells[i] ?? null) !== v && out.push(i));
  return out;
}

export const isTimed = (p: SymbolMemoryPuzzle) => p.showMs !== null;

export const symbolMemory: GameLogic<SymbolMemoryPuzzle, SymbolMemoryAnswer> = {
  id: 'symbol-memory',
  generatorVersion: 1,
  create(rng, d) {
    const r = RULES[d];
    const kinds = rng.int(r.kinds[0], r.kinds[1]);
    const pool = d === 'easy' || d === 'normal' ? EASY_FIRST.slice(0, 5) : EASY_FIRST;
    const symbols = rng.shuffle(pool).slice(0, kinds);
    const n = r.size * r.size;
    const filled = rng.int(r.filled[0], Math.min(r.filled[1], n));
    const positions = rng.shuffle(Array.from({ length: n }, (_, i) => i)).slice(0, filled);
    const cells: Cell[] = Array(n).fill(null);
    // どの記号も少なくとも1回は出す
    positions.forEach((pos, k) => (cells[pos] = k < kinds ? symbols[k] : rng.pick(symbols)));
    return { size: r.size, symbols: [...symbols].sort((a, b) => SYMBOLS.indexOf(a) - SYMBOLS.indexOf(b)), cells, showMs: r.showMs };
  },
  validate(p, d) {
    const r = RULES[d];
    if (p.size !== r.size || p.cells.length !== p.size * p.size) return 'size';
    if (p.showMs !== r.showMs) return 'showMs';
    if (new Set(p.symbols).size !== p.symbols.length || p.symbols.some((s) => !SYMBOLS.includes(s))) return 'symbols';
    if (p.symbols.length < r.kinds[0] || p.symbols.length > r.kinds[1]) return 'kinds';
    const filled = p.cells.filter((c) => c !== null);
    if (filled.length < r.filled[0] || filled.length > r.filled[1]) return 'filled';
    if (filled.some((c) => !p.symbols.includes(c!))) return 'unknown symbol';
    if (p.symbols.some((s) => !filled.includes(s))) return 'unused symbol';
    if (filled.length === p.cells.length) return 'no blank';
    return null;
  },
  fallback(d) {
    const out: SymbolMemoryPuzzle[] = [];
    for (let seed = 1; seed < 300 && out.length < 3; seed++) {
      const p = symbolMemory.create(createRng(seed), d);
      if (p && symbolMemory.validate(p, d) === null) out.push(p);
    }
    return out;
  },
  judge(p, a) {
    if (!a || !Array.isArray(a.cells) || a.cells.length !== p.cells.length) return { correct: false, message: 'マスに きごうを おいてね' };
    const m = symbolMismatches(p, a.cells);
    if (m.length === 0) return { correct: true };
    return { correct: false, message: `みほんと ちがう マスが ${m.length}こ あるよ` };
  },
  hints(p, progress) {
    const cells = Array.isArray(progress) ? (progress as Cell[]) : emptyCells(p);
    const total = p.cells.filter((c) => c !== null).length;
    const m = symbolMismatches(p, cells);
    if (m.length === 0) return ['ぴったり だね！', 'こたえあわせ してみよう', 'こたえあわせ してみよう'];
    const i = m[0];
    const r = Math.floor(i / p.size);
    const c = i % p.size;
    const inRow = p.cells.slice(r * p.size, (r + 1) * p.size).filter((x) => x !== null).length;
    // 答えの記号そのものは言わない（自分で思い出す・見て確かめる）
    return [
      `きごうが ある マスは ぜんぶで ${total}こ だよ`,
      `うえから ${r + 1}ばんめの ぎょうには きごうが ${inRow}こ あるよ`,
      `うえから ${r + 1}ばんめ、ひだりから ${c + 1}ばんめの マスを ${cells[i] ? 'みなおそう' : 'わすれていないかな？'}`,
    ];
  },
  key: (p) => `${p.size}:${p.cells.map((c) => (c ? SYMBOL_CHAR[c] : '.')).join('')}`,
};
