import { createRng } from '../random';
import type { Difficulty } from '../types';
import type { GameLogic } from './types';

/**
 * 18 さんかくもよう：見本と同じになるように、マスをタップして形を変える。
 * マスの状態（タップするたびに この順で かわる）：
 * 0 しろ → 1 ひだりうえ → 2 みぎうえ → 3 みぎした → 4 ひだりした → 5 ぜんぶ → 0 しろ
 */
export const TRI_STATES = 6;
export const TRI_LABEL = ['しろ', 'ひだりうえの さんかく', 'みぎうえの さんかく', 'みぎしたの さんかく', 'ひだりしたの さんかく', 'ぜんぶ ぬる'] as const;

/** 1辺1の正方形の中の塗る形（SVG の points） */
export const TRI_POINTS: (string | null)[] = [null, '0,0 1,0 0,1', '0,0 1,0 1,1', '1,0 1,1 0,1', '0,0 1,1 0,1', '0,0 1,0 1,1 0,1'];

export const nextTriState = (s: number) => (s + 1) % TRI_STATES;

export interface TrianglePuzzle {
  size: number;
  target: number[][];
}

export type TriangleAnswer = number[][];

const RULES: Record<Difficulty, { size: number; states: number[]; minFilled: number; minKinds: number }> = {
  // かんたん：ぜんぶ ぬる と 2しゅるいの さんかくだけ
  easy: { size: 2, states: [0, 1, 3, 5], minFilled: 2, minKinds: 2 },
  normal: { size: 3, states: [0, 1, 2, 3, 4, 5], minFilled: 4, minKinds: 3 },
  hard: { size: 4, states: [0, 1, 2, 3, 4, 5], minFilled: 8, minKinds: 4 },
  challenge: { size: 5, states: [0, 1, 2, 3, 4, 5], minFilled: 14, minKinds: 5 },
};

export function emptyTriangleBoard(size: number): number[][] {
  return Array.from({ length: size }, () => Array(size).fill(0));
}

/** 見本と違うマス [row, col] */
export function triangleMismatches(p: TrianglePuzzle, board: number[][]): [number, number][] {
  const out: [number, number][] = [];
  p.target.forEach((row, r) => row.forEach((v, c) => (board[r]?.[c] ?? 0) !== v && out.push([r, c])));
  return out;
}

/** そのマスを見本と同じにするのに あと何回タップするか */
export const tapsNeeded = (from: number, to: number) => (to - from + TRI_STATES) % TRI_STATES;

export const triangle: GameLogic<TrianglePuzzle, TriangleAnswer> = {
  id: 'triangle-pattern',
  generatorVersion: 1,
  create(rng, d) {
    const { size, states } = RULES[d];
    const filled = states.filter((s) => s !== 0);
    const target = emptyTriangleBoard(size).map((row) => row.map(() => (rng.chance(d === 'challenge' ? 0.8 : 0.7) ? rng.pick(filled) : 0)));
    // むずかしい以上は ときどき 左右対称の もように して、形として見やすくする
    if ((d === 'hard' || d === 'challenge') && rng.chance(0.4)) {
      const mirror = [0, 2, 1, 4, 3, 5];
      for (const row of target) for (let c = 0; c < Math.floor(size / 2); c++) row[size - 1 - c] = mirror[row[c]];
    }
    return { size, target };
  },
  validate(p, d) {
    const rule = RULES[d];
    if (p.size !== rule.size) return 'size';
    if (p.target.length !== p.size || p.target.some((r) => r.length !== p.size)) return 'shape';
    const flat = p.target.flat();
    if (flat.some((v) => !rule.states.includes(v))) return 'state';
    if (flat.filter((v) => v !== 0).length < rule.minFilled) return 'too empty';
    if (new Set(flat.filter((v) => v !== 0)).size < rule.minKinds) return 'too simple';
    if (!flat.some((v) => v >= 1 && v <= 4)) return 'needs a triangle';
    return null;
  },
  fallback(d) {
    const out: TrianglePuzzle[] = [];
    for (let seed = 1; seed < 500 && out.length < 3; seed++) {
      const p = triangle.create(createRng(seed), d);
      if (p && triangle.validate(p, d) === null) out.push(p);
    }
    return out;
  },
  judge(p, a) {
    if (!Array.isArray(a)) return { correct: false, message: 'マスを タップしてね' };
    const m = triangleMismatches(p, a);
    if (m.length === 0) return { correct: true };
    return { correct: false, message: `みほんと ちがう マスが ${m.length}こ あるよ` };
  },
  hints(p, progress) {
    const board = Array.isArray(progress) ? (progress as number[][]) : emptyTriangleBoard(p.size);
    const m = triangleMismatches(p, board);
    if (m.length === 0) return ['ぴったり だね！', 'こたえあわせ してみよう', 'こたえあわせ してみよう'];
    const [r, c] = m[0];
    const want = p.target[r][c];
    const taps = tapsNeeded(board[r]?.[c] ?? 0, want);
    return [
      `うえから ${r + 1}ばんめ、ひだりから ${c + 1}ばんめの マスを みほんと くらべよう`,
      `その マスは「${TRI_LABEL[want]}」だよ`,
      `ひかっている マスを あと ${taps}かい タップしよう`,
    ];
  },
  key: (p) => p.target.map((r) => r.join('')).join('/'),
};
