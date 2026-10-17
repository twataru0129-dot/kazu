import type { Difficulty } from '../types';
import { isPosInt, type GameLogic } from './types';

/** 04 計算のくふう：199+48 → 200+47 のように、きりのよい数にして計算する */
export interface KufuuPuzzle {
  a: number;
  b: number;
  /** きりのよい数の単位（10 または 100） */
  unit: number;
  /** a が近い きりのよい数（a = round - gap） */
  round: number;
  gap: number;
  /** 1回の移動で動かせる量 */
  steps: number[];
}

/** 変形後の式と最終の答え */
export interface KufuuAnswer {
  left: number;
  right: number;
  result: number | null;
}

const isRound = (n: number, unit: number) => n > 0 && n % unit === 0;

export function transformOk(p: KufuuPuzzle, left: number, right: number): { equal: boolean; round: boolean } {
  return {
    equal: isPosInt(left) && isPosInt(right) && left + right === p.a + p.b,
    round: isRound(left, p.unit) || isRound(right, p.unit),
  };
}

export const kufuu: GameLogic<KufuuPuzzle, KufuuAnswer> = {
  id: 'kufuu',
  generatorVersion: 1,
  create(rng, d) {
    let unit: number;
    let round: number;
    let gap: number;
    let b: number;
    switch (d) {
      case 'easy':
        unit = 10;
        round = 10;
        gap = rng.int(1, 2);
        b = rng.int(gap + 2, 9);
        break;
      case 'normal':
        unit = 10;
        round = rng.int(2, 9) * 10;
        gap = 1;
        b = rng.int(12, 68);
        break;
      case 'hard':
        unit = 100;
        round = rng.int(1, 5) * 100;
        gap = 1;
        b = rng.int(12, 89);
        break;
      case 'challenge':
        unit = rng.pick([10, 100]);
        gap = rng.pick(unit === 10 ? [2, 3] : [2, 5, 10]);
        round = unit === 10 ? rng.int(2, 9) * 10 : rng.int(1, 5) * 100;
        b = rng.int(gap + 11, 95);
        break;
    }
    const a = round - gap;
    if (b % unit === 0) return null; // 最初から きりのよい数なら工夫の必要がない
    const steps = d === 'challenge' && gap >= 5 ? [1, 5] : [1];
    return { a, b, unit, round, gap, steps };
  },
  validate(p, d) {
    if (!isPosInt(p.a) || !isPosInt(p.b)) return 'positive';
    if (p.a + p.gap !== p.round || !isRound(p.round, p.unit)) return 'round';
    if (p.b < p.gap + 1) return 'b too small';
    if (isRound(p.a, p.unit) || isRound(p.b, p.unit)) return 'already round';
    if (d === 'easy' && (p.unit !== 10 || p.round !== 10)) return 'easy';
    if ((d === 'normal' || d === 'hard') && p.gap !== 1) return 'gap';
    if (d === 'hard' && p.unit !== 100) return 'hard unit';
    return null;
  },
  fallback(d) {
    const bank: Record<Difficulty, [number, number, number, number][]> = {
      easy: [[9, 6, 10, 10], [8, 5, 10, 10], [9, 4, 10, 10]],
      normal: [[19, 23, 10, 20], [49, 36, 10, 50], [29, 15, 10, 30]],
      hard: [[199, 48, 100, 200], [99, 37, 100, 100], [299, 25, 100, 300]],
      challenge: [[195, 38, 100, 200], [98, 47, 100, 100], [57, 26, 10, 60]],
    };
    return bank[d].map(([a, b, unit, round]) => {
      const gap = round - a;
      return { a, b, unit, round, gap, steps: d === 'challenge' && gap >= 5 ? [1, 5] : [1] };
    });
  },
  judge(p, ans) {
    const t = transformOk(p, ans.left, ans.right);
    if (!t.equal) return { correct: false, message: 'もとの しきと おなじ こたえに なるように うごかそう' };
    if (!t.round) return { correct: false, message: `どちらかを きりのよい かず（${p.unit} の まとまり）に しよう` };
    if (ans.result === null) return { correct: false, message: 'さいごに こたえを いれよう' };
    if (ans.result !== p.a + p.b) return { correct: false, message: `${ans.left} + ${ans.right} を もういちど けいさんしてみよう` };
    return { correct: true, solutionKey: `${Math.min(ans.left, ans.right)}+${Math.max(ans.left, ans.right)}` };
  },
  hints(p) {
    return [
      `${p.a} に いくつ たすと ${p.round} に なる？`,
      `その ${p.gap} は ${p.b} から もらおう`,
      `${p.b} から ${p.gap} へらすと？ ${p.round} + □`,
    ];
  },
  key: (p) => `${p.a}+${p.b}`,
};
