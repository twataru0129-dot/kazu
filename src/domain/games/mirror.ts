import { createRng } from '../random';
import type { Difficulty } from '../types';
import type { GameLogic } from './types';

/** 15 かがみのかたち：たての中心線で左右対称になるように右半分を塗る */
export interface MirrorPuzzle {
  size: number; // 全体の一辺（偶数）
  colors: number; // 1 または 2
  /** 左半分：size 行 × size/2 列。0=空、1..colors=色 */
  left: number[][];
}

/** 右半分：size 行 × size/2 列（中心線の右から順） */
export type MirrorAnswer = number[][];

const SIZE: Record<Difficulty, number> = { easy: 4, normal: 6, hard: 8, challenge: 10 };

export function mirrorSolution(p: MirrorPuzzle): number[][] {
  const half = p.size / 2;
  return p.left.map((row) => Array.from({ length: half }, (_, j) => row[half - 1 - j]));
}

export function emptyRight(p: MirrorPuzzle): number[][] {
  return Array.from({ length: p.size }, () => Array(p.size / 2).fill(0));
}

/** 正解と違う右側のマス [row, col(右半分内)] */
export function mismatches(p: MirrorPuzzle, right: number[][]): [number, number][] {
  const sol = mirrorSolution(p);
  const out: [number, number][] = [];
  sol.forEach((row, r) => row.forEach((v, c) => (right[r]?.[c] ?? 0) !== v && out.push([r, c])));
  return out;
}

export const mirror: GameLogic<MirrorPuzzle, MirrorAnswer> = {
  id: 'mirror',
  generatorVersion: 1,
  create(rng, d) {
    const size = SIZE[d];
    const half = size / 2;
    const colors = d === 'challenge' ? 2 : 1;
    const density = d === 'easy' ? 0.45 : 0.4;
    // かたまりのある模様にするため、ランダムに点を置いてから少し広げる
    const left = Array.from({ length: size }, () => Array(half).fill(0));
    const seeds = Math.max(2, Math.round(size * 0.6));
    for (let s = 0; s < seeds; s++) {
      let r = rng.int(0, size - 1);
      let c = rng.int(0, half - 1);
      const color = rng.int(1, colors);
      const len = rng.int(1, Math.max(2, size));
      for (let k = 0; k < len; k++) {
        left[r][c] = color;
        if (rng.chance(0.5)) r = Math.min(size - 1, Math.max(0, r + rng.pick([-1, 1])));
        else c = Math.min(half - 1, Math.max(0, c + rng.pick([-1, 1])));
      }
    }
    const filled = left.flat().filter((v) => v > 0).length;
    if (Math.abs(filled / (size * half) - density) > 0.2) return null;
    return { size, colors, left };
  },
  validate(p, d) {
    if (p.size !== SIZE[d] || p.size % 2 !== 0) return 'size';
    const half = p.size / 2;
    if (p.left.length !== p.size || p.left.some((r) => r.length !== half)) return 'shape';
    if (p.left.flat().some((v) => !Number.isInteger(v) || v < 0 || v > p.colors)) return 'values';
    const ratio = p.left.flat().filter((v) => v > 0).length / (p.size * half);
    if (ratio < 0.2 || ratio > 0.65) return 'density';
    if (p.colors === 2 && !(p.left.flat().includes(1) && p.left.flat().includes(2))) return 'needs both colors';
    // 中心線に接する列に少なくとも1マスあると、対称の意味が分かりやすい
    if (!p.left.some((row) => row[half - 1] > 0)) return 'no cell at axis';
    return null;
  },
  fallback(d) {
    // 固定シードで作り、検証を通ったものだけを予備にする
    const out: MirrorPuzzle[] = [];
    for (let seed = 1; seed < 400 && out.length < 3; seed++) {
      const p = mirror.create(createRng(seed), d);
      if (p && mirror.validate(p, d) === null) out.push(p);
    }
    return out;
  },
  judge(p, a) {
    const m = mismatches(p, a);
    if (m.length === 0) return { correct: true };
    return { correct: false, message: `ちがう マスが ${m.length}こ あるよ` };
  },
  hints(p, progress) {
    const right = (progress as number[][] | undefined) ?? emptyRight(p);
    const m = mismatches(p, right);
    if (m.length === 0) return ['ぴったり だね！', 'こたえあわせ してみよう', 'こたえあわせ してみよう'];
    const [r, c] = m[0];
    return [`うえから ${r + 1}ばんめの ぎょうを みよう`, `ちゅうしんせんから ${c + 1}マスめ を くらべよう`, 'ひかっている 2つの マスを おなじに しよう'];
  },
  key: (p) => p.left.map((r) => r.join('')).join('/'),
};
