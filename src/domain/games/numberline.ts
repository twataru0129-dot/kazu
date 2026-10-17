import type { Difficulty } from '../types';
import type { GameLogic } from './types';

/** 09 すうじの位置：数直線の目盛りに数を置く */
export interface NumberLinePuzzle {
  min: number;
  max: number;
  /** 目盛りの間隔 */
  step: number;
  /** ラベルを付ける間隔 */
  labelEvery: number;
  target: number;
}

export const tickCount = (p: Pick<NumberLinePuzzle, 'min' | 'max' | 'step'>) => Math.round((p.max - p.min) / p.step) + 1;
export const tickValue = (p: Pick<NumberLinePuzzle, 'min' | 'step'>, index: number) => p.min + index * p.step;
export const isLabeled = (p: NumberLinePuzzle, v: number) => (v - p.min) % p.labelEvery === 0 || v === p.max;

/** 0〜1 の位置（画面上の割合）を最も近い目盛りの値にスナップする */
export function snapRatio(p: NumberLinePuzzle, ratio: number): number {
  const r = Math.min(1, Math.max(0, ratio));
  const idx = Math.round((r * (p.max - p.min)) / p.step);
  return tickValue(p, Math.min(tickCount(p) - 1, Math.max(0, idx)));
}

export const ratioOf = (p: NumberLinePuzzle, v: number) => (v - p.min) / (p.max - p.min);

const VARIANTS: Record<Difficulty, Omit<NumberLinePuzzle, 'target'>[]> = {
  easy: [{ min: 0, max: 10, step: 1, labelEvery: 5 }],
  normal: [
    { min: 0, max: 20, step: 2, labelEvery: 10 },
    { min: 0, max: 20, step: 1, labelEvery: 10 },
  ],
  hard: [
    { min: 0, max: 100, step: 10, labelEvery: 50 },
    { min: 0, max: 100, step: 5, labelEvery: 50 },
  ],
  challenge: [
    { min: 100, max: 1000, step: 50, labelEvery: 300 },
    { min: 100, max: 500, step: 10, labelEvery: 100 },
  ],
};

export const numberline: GameLogic<NumberLinePuzzle, number | null> = {
  id: 'numberline',
  generatorVersion: 1,
  create(rng, d) {
    const v = rng.pick(VARIANTS[d]);
    const candidates: number[] = [];
    for (let i = 0; i < tickCount(v); i++) {
      const t = tickValue(v, i);
      if (!isLabeled({ ...v, target: 0 }, t)) candidates.push(t);
    }
    return { ...v, target: rng.pick(candidates) };
  },
  validate(p, d) {
    if (!VARIANTS[d].some((v) => v.min === p.min && v.max === p.max && v.step === p.step && v.labelEvery === p.labelEvery)) return 'variant';
    if ((p.max - p.min) % p.step !== 0) return 'step';
    if ((p.target - p.min) % p.step !== 0 || p.target < p.min || p.target > p.max) return 'target not on tick';
    if (isLabeled(p, p.target)) return 'target labeled';
    // 値→割合→スナップで元の値に戻ること（表示と判定の整合）
    if (snapRatio(p, ratioOf(p, p.target)) !== p.target) return 'snap mismatch';
    return null;
  },
  fallback(d) {
    const targets: Record<Difficulty, number> = { easy: 7, normal: 14, hard: 30, challenge: 250 };
    return [{ ...VARIANTS[d][0], target: targets[d] }];
  },
  judge(p, a) {
    if (a === null) return { correct: false, message: 'めもりを タップして マーカーを おこう' };
    if (a === p.target) return { correct: true };
    return { correct: false, message: `そこは ${a}。${p.target} は ${a < p.target ? 'もっと みぎ' : 'もっと ひだり'} だよ` };
  },
  hints(p) {
    const lowerLabel = p.min + Math.floor((p.target - p.min) / p.labelEvery) * p.labelEvery;
    const upperLabel = Math.min(p.max, lowerLabel + p.labelEvery);
    const k = (p.target - lowerLabel) / p.step;
    return [
      `${lowerLabel} は どこかな？`,
      `${p.target} は ${lowerLabel} と ${upperLabel} の あいだ だよ`,
      `${lowerLabel} から めもりを ${k}こ すすもう（1めもり ${p.step}）`,
    ];
  },
  key: (p) => `${p.min}-${p.max}/${p.step}/${p.target}`,
};
