import { createRng, type Rng } from '../random';
import type { Difficulty } from '../types';
import type { GameLogic } from './types';

/**
 * 24 シャッフルカップ：ボールの はいった カップを 見せてから ふせ、2こずつ いれかえる。さいごに ボールの カップを タップ。
 *
 * - カップには ID（0..cups-1）が あり、はじめは カップ i が 場所 i に ある。ボールは カップに はいったまま うごく。
 * - いれかえは「2つの カップ ID」の ならび。画面の うごきも 判定も、この ならびから 場所を 計算する
 *   （画面の ならび順から 正解を 逆に 推しはからない）。
 * - こたえは えらんだ カップの ID。ボールの はいった カップ ID と 同じなら 正解。
 * - 1回の あそびは 5ラウンド。5つとも 問題を 作るときに きめて 問題の中に 持つ（見なおし・再開で かわらない）。
 *
 * 記録（1つの attempt）：まちがえたら その時点で submit（不正解・同じラウンドを やりなおす）、
 * 5ラウンド すべて できたら submit（正解）。ラウンドごとの 記録は 答えの中に 入れる。
 */
export const CUP_ROUNDS = 5;

export interface CupRound {
  /** ボールが はいった カップ ID（[あか] または [あか, あお]） */
  balls: number[];
  /** いれかえる 2つの カップ ID */
  swaps: [number, number][];
}

export interface ShuffleCupsPuzzle {
  cups: number;
  /** 1回の いれかえの 時間（ミリ秒） */
  swapMs: number;
  rounds: CupRound[];
}

export interface CupRoundRecord {
  /** さいしょの こたえが あっていたか（まだ こたえて いなければ undefined） */
  firstTry?: boolean;
  /** 「みる」「もういちど みる」を 押した回数 */
  views: number;
  /** まちがえた 回数 */
  wrong: number;
  /** おいかけた ボールの 数 */
  balls: number;
  cleared: boolean;
}

export interface ShuffleCupsAnswer {
  /** ラウンドごとに さいごに えらんだ カップ ID（ボールの じゅん） */
  picks: number[][];
  rounds: CupRoundRecord[];
}

export const CUP_RULES: Record<Difficulty, { cups: number; swaps: number; swapMs: number; balls: number; minMoves: number }> = {
  easy: { cups: 3, swaps: 2, swapMs: 1200, balls: 1, minMoves: 1 },
  normal: { cups: 3, swaps: 4, swapMs: 1000, balls: 1, minMoves: 2 },
  hard: { cups: 4, swaps: 6, swapMs: 850, balls: 1, minMoves: 3 },
  challenge: { cups: 6, swaps: 9, swapMs: 700, balls: 2, minMoves: 3 },
};

export const BALL_NAME = ['あか', 'あお'] as const;

/** いれかえを k 回 したあとの ならび：場所 → カップ ID */
export function arrangementAfter(cups: number, swaps: readonly (readonly [number, number])[], k = swaps.length): number[] {
  const at = Array.from({ length: cups }, (_, i) => i);
  for (let s = 0; s < k; s++) {
    const [a, b] = swaps[s];
    const pa = at.indexOf(a);
    const pb = at.indexOf(b);
    at[pa] = b;
    at[pb] = a;
  }
  return at;
}

/** カップ ID → いまの 場所 */
export const positionOf = (arr: readonly number[], cup: number) => arr.indexOf(cup);

/** ボールの はいった カップが うごいた 回数 */
export const movesOf = (r: CupRound, ball: number) => r.swaps.filter(([a, b]) => a === r.balls[ball] || b === r.balls[ball]).length;

function roundProblem(r: CupRound, cups: number, rule: (typeof CUP_RULES)[Difficulty]): string | null {
  if (!Array.isArray(r.balls) || r.balls.length !== rule.balls) return 'balls';
  if (r.balls.some((b) => !Number.isInteger(b) || b < 0 || b >= cups) || new Set(r.balls).size !== r.balls.length) return 'ball cup';
  if (!Array.isArray(r.swaps) || r.swaps.length !== rule.swaps) return 'swaps';
  for (let i = 0; i < r.swaps.length; i++) {
    const [a, b] = r.swaps[i];
    if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b < 0 || a >= cups || b >= cups || a === b) return 'swap ids';
    // すぐ もとに もどる（同じ いれかえを つづけて する）のは さける
    if (i > 0) {
      const [c, d] = r.swaps[i - 1];
      if ((a === c && b === d) || (a === d && b === c)) return 'undo swap';
    }
  }
  const end = arrangementAfter(cups, r.swaps);
  for (let k = 0; k < r.balls.length; k++) {
    if (movesOf(r, k) < rule.minMoves) return 'ball barely moves';
    // さいごに はじめと 同じ 場所に もどるだけ、には しない
    if (positionOf(end, r.balls[k]) === r.balls[k]) return 'ball back home';
  }
  return null;
}

function makeRound(rng: Rng, rule: (typeof CUP_RULES)[Difficulty]): CupRound | null {
  for (let t = 0; t < 60; t++) {
    const balls = rng.shuffle(Array.from({ length: rule.cups }, (_, i) => i)).slice(0, rule.balls);
    const swaps: [number, number][] = [];
    for (let i = 0; i < rule.swaps; i++) {
      // ボールの カップを よく うごかす（半分くらいは ボールの カップを まぜる）
      let a: number;
      let b: number;
      do {
        a = rng.chance(0.55) ? rng.pick(balls) : rng.int(0, rule.cups - 1);
        b = rng.int(0, rule.cups - 1);
        const prev = swaps.at(-1);
        if (prev && ((prev[0] === a && prev[1] === b) || (prev[0] === b && prev[1] === a))) b = a;
      } while (a === b);
      swaps.push(rng.chance(0.5) ? [a, b] : [b, a]);
    }
    const r = { balls, swaps };
    if (roundProblem(r, rule.cups, rule) === null) return r;
  }
  return null;
}

const roundKey = (r: CupRound) => `${r.balls.join('')}:${r.swaps.map((s) => s.join('')).join('-')}`;

export const shuffleCups: GameLogic<ShuffleCupsPuzzle, ShuffleCupsAnswer> = {
  id: 'shuffle-cups',
  generatorVersion: 1,
  create(rng, d) {
    const rule = CUP_RULES[d];
    const rounds: CupRound[] = [];
    for (let k = 0; k < CUP_ROUNDS; k++) {
      let r: CupRound | null = null;
      for (let t = 0; t < 10 && !r; t++) {
        const c = makeRound(rng, rule);
        if (c && !rounds.some((x) => roundKey(x) === roundKey(c))) r = c;
      }
      if (!r) return null;
      rounds.push(r);
    }
    return { cups: rule.cups, swapMs: rule.swapMs, rounds };
  },
  validate(p, d) {
    const rule = CUP_RULES[d];
    if (p.cups !== rule.cups || p.swapMs !== rule.swapMs) return 'rules';
    if (!Array.isArray(p.rounds) || p.rounds.length !== CUP_ROUNDS) return 'rounds';
    for (let k = 0; k < CUP_ROUNDS; k++) {
      const why = roundProblem(p.rounds[k], p.cups, rule);
      if (why) return `round ${k + 1}: ${why}`;
    }
    if (new Set(p.rounds.map(roundKey)).size !== CUP_ROUNDS) return 'same round twice';
    return null;
  },
  fallback(d) {
    const out: ShuffleCupsPuzzle[] = [];
    for (let seed = 1; seed < 300 && out.length < 3; seed++) {
      const p = shuffleCups.create(createRng(seed), d);
      if (p && shuffleCups.validate(p, d) === null) out.push(p);
    }
    return out;
  },
  judge(p, a) {
    if (!a || !Array.isArray(a.picks)) return { correct: false, message: 'ボールの はいった カップを タップしてね' };
    for (let k = 0; k < CUP_ROUNDS; k++) {
      const pick = a.picks[k];
      const want = p.rounds[k].balls;
      if (!Array.isArray(pick) || pick.length !== want.length) return { correct: false, message: k > 0 ? `${k}ラウンド まで できたよ` : 'ボールの はいった カップを タップしてね' };
      if (pick.some((c, i) => c !== want[i])) {
        const some = want.length > 1 && pick.some((c, i) => c === want[i]);
        return { correct: false, message: some ? 'かたほうは あってるよ！ もういちど みて やってみよう' : 'おしい！ もういちど みて やってみよう' };
      }
    }
    return { correct: true };
  },
  hints: (p) => [
    p.rounds[0].balls.length > 1 ? 'まずは あかの ボールの カップ だけを めで おいかけよう' : 'ボールの はいった カップ だけを めで おいかけよう',
    'カップが いれかわる とき、ボールの カップが うごくか よく みよう',
    'つぎに みる ときは ゆっくり うごくよ。「もういちど みる」を おしてね',
  ],
  key: (p) => `${p.cups}:${p.rounds.map(roundKey).join('/')}`,
};
