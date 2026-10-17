import type { Difficulty } from '../types';
import { sum, type GameLogic } from './types';

/** 10 こぜに数え */
export type CoinValue = 1 | 5 | 10 | 50 | 100 | 500;
export const COIN_VALUES: CoinValue[] = [1, 5, 10, 50, 100, 500];

export interface PlacedCoin {
  id: string;
  value: CoinValue;
  /** 机の上のマス位置（マスごとに1枚なので重ならない） */
  col: number;
  row: number;
}

export interface CoinsPuzzle {
  coins: PlacedCoin[];
  cols: number;
  rows: number;
}

const RULES: Record<Difficulty, { kinds: CoinValue[]; count: [number, number]; maxTotal: number }> = {
  easy: { kinds: [1, 10], count: [2, 5], maxTotal: 50 },
  normal: { kinds: [1, 5, 10, 50], count: [3, 6], maxTotal: 200 },
  hard: { kinds: [1, 5, 10, 50, 100, 500], count: [4, 8], maxTotal: 1500 },
  challenge: { kinds: [1, 5, 10, 50, 100, 500], count: [7, 12], maxTotal: 3000 },
};

export const coinsTotal = (p: CoinsPuzzle) => sum(p.coins.map((c) => c.value));

export function layoutCoins(rng: import('../random').Rng, values: CoinValue[]): CoinsPuzzle {
  const cols = values.length <= 4 ? 2 : values.length <= 9 ? 3 : 4;
  const rows = Math.ceil(values.length / cols) + (values.length > 6 ? 0 : 1);
  const cells = rng.shuffle(Array.from({ length: cols * rows }, (_, i) => i)).slice(0, values.length);
  return {
    cols,
    rows,
    coins: values.map((value, i) => ({ id: `k${i}`, value, col: cells[i] % cols, row: Math.floor(cells[i] / cols) })),
  };
}

export const coins: GameLogic<CoinsPuzzle, number | null> = {
  id: 'coins',
  generatorVersion: 1,
  create(rng, d) {
    const r = RULES[d];
    const n = rng.int(r.count[0], r.count[1]);
    const values = Array.from({ length: n }, () => rng.pick(r.kinds));
    if (d !== 'easy' && new Set(values).size < Math.min(3, r.kinds.length)) return null;
    return layoutCoins(rng, values);
  },
  validate(p, d) {
    const r = RULES[d];
    if (p.coins.length < r.count[0] || p.coins.length > r.count[1]) return 'count';
    if (p.coins.some((c) => !r.kinds.includes(c.value))) return 'kind';
    const cells = new Set(p.coins.map((c) => `${c.col},${c.row}`));
    if (cells.size !== p.coins.length) return 'overlap';
    if (p.coins.some((c) => c.col < 0 || c.col >= p.cols || c.row < 0 || c.row >= p.rows)) return 'outside';
    const t = coinsTotal(p);
    if (t < 1 || t > r.maxTotal) return 'total';
    return null;
  },
  fallback(d) {
    const sets: Record<Difficulty, CoinValue[][]> = {
      easy: [[10, 10, 1], [10, 1, 1, 1]],
      normal: [[50, 10, 5, 1], [10, 10, 5, 1, 1]],
      hard: [[100, 50, 10, 10, 5, 1], [500, 100, 10, 1]],
      challenge: [[500, 100, 100, 50, 10, 10, 5, 1, 1], [100, 100, 50, 50, 10, 5, 5, 1, 1, 1]],
    };
    return sets[d].map((values) => ({
      cols: 3,
      rows: Math.ceil(values.length / 3),
      coins: values.map((value, i) => ({ id: `k${i}`, value, col: i % 3, row: Math.floor(i / 3) })),
    }));
  },
  judge(p, a) {
    if (a === null) return { correct: false, message: 'きんがくを いれてね' };
    return a === coinsTotal(p) ? { correct: true } : { correct: false, message: 'おなじ こうかを まとめて かぞえてみよう' };
  },
  hints(p) {
    const counts = new Map<CoinValue, number>();
    for (const c of p.coins) counts.set(c.value, (counts.get(c.value) ?? 0) + 1);
    const sorted = [...counts.entries()].sort((a, b) => b[0] - a[0]);
    const [bigV, bigN] = sorted[0];
    return [
      'おおきい こうかから かぞえよう',
      `${bigV}えんだまが ${bigN}まい で ${bigV * bigN}えん`,
      `${sorted.map(([v, n]) => `${v}えん×${n}`).join('、')} を ぜんぶ たそう`,
    ];
  },
  key: (p) => p.coins.map((c) => c.value).sort((a, b) => a - b).join(','),
};
