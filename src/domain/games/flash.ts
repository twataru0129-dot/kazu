import type { Difficulty } from '../types';
import { sum, type GameLogic } from './types';

/** 08 フラッシュ計算：順に表示される数の合計を答える */
export interface FlashPuzzle {
  numbers: number[];
  /** 既定の1つあたりの表示時間（ミリ秒）。画面で変更できる */
  defaultShowMs: number;
}

export type FlashSpeed = 'slow' | 'normal' | 'fast';
export const SPEED_MS: Record<FlashSpeed, number> = { slow: 1400, normal: 900, fast: 550 };

const RULES: Record<Difficulty, { counts: [number, number]; lo: number; hi: number; ms: number }> = {
  easy: { counts: [2, 3], lo: 1, hi: 9, ms: 1400 },
  normal: { counts: [4, 5], lo: 1, hi: 9, ms: 1100 },
  hard: { counts: [4, 6], lo: 10, hi: 99, ms: 1100 },
  challenge: { counts: [6, 8], lo: 1, hi: 99, ms: 700 },
};

export const flash: GameLogic<FlashPuzzle, number | null> = {
  id: 'flash',
  generatorVersion: 1,
  create(rng, d) {
    const r = RULES[d];
    const n = rng.int(r.counts[0], r.counts[1]);
    const numbers: number[] = [];
    for (let i = 0; i < n; i++) {
      let x = rng.int(r.lo, r.hi);
      // となりが同じ数だと、表示が変わったことが分からないので避ける
      for (let t = 0; t < 10 && i > 0 && x === numbers[i - 1]; t++) x = rng.int(r.lo, r.hi);
      numbers.push(x);
    }
    return { numbers, defaultShowMs: r.ms };
  },
  validate(p, d) {
    const r = RULES[d];
    const n = p.numbers.length;
    if (n < r.counts[0] || n > r.counts[1]) return 'count';
    if (p.numbers.some((x) => !Number.isInteger(x) || x < r.lo || x > r.hi)) return 'range';
    if (p.numbers.some((x, i) => i > 0 && x === p.numbers[i - 1])) return 'adjacent duplicate';
    const ds = p.numbers.slice(1).map((x, i) => x - p.numbers[i]);
    if (n >= 3 && ds.every((x) => x === ds[0])) return 'monotone';
    if (sum(p.numbers) > 600) return 'sum too large';
    return null;
  },
  fallback(d) {
    const bank: Record<Difficulty, number[][]> = {
      easy: [[3, 5], [2, 6, 1], [4, 1, 3]],
      normal: [[3, 5, 2, 7], [6, 1, 4, 2, 5], [8, 3, 5, 1]],
      hard: [[12, 35, 20, 41], [57, 13, 28, 34, 11], [40, 25, 16, 33]],
      challenge: [[12, 7, 35, 4, 20, 9], [5, 41, 13, 8, 26, 3, 17], [30, 6, 18, 2, 44, 11, 9, 25]],
    };
    return bank[d].map((numbers) => ({ numbers, defaultShowMs: RULES[d].ms }));
  },
  judge(p, a) {
    if (a === null) return { correct: false, message: 'こたえを いれてね' };
    return a === sum(p.numbers) ? { correct: true } : { correct: false, message: 'もういちど みても いいよ' };
  },
  hints(p) {
    const half = Math.ceil(p.numbers.length / 2);
    return [
      '「もういちど みる」で なんかいでも みられるよ',
      `はじめの ${half}こ を たすと ${sum(p.numbers.slice(0, half))}`,
      `でてきた かず：${p.numbers.join('、')}`,
    ];
  },
  key: (p) => p.numbers.join(','),
};
