import type { Difficulty } from '../types';
import { evaluateLinear, type AddSubOp } from '../expr';
import type { GameLogic } from './types';

/** 03 10をつくれ！：カードを全部1回ずつ使って目標の数をつくる */
export interface Card {
  id: string;
  value: number;
}

export interface Make10Puzzle {
  cards: Card[];
  target: number;
  ops: AddSubOp[];
}

/** 並べたカードID と、その間の演算子 */
export interface Make10Answer {
  order: string[];
  ops: AddSubOp[];
}

const RULES: Record<Difficulty, { counts: number[]; ops: AddSubOp[]; targets: number[]; maxCard: number }> = {
  easy: { counts: [3], ops: ['+'], targets: [10], maxCard: 9 },
  normal: { counts: [3, 4], ops: ['+', '-'], targets: [10], maxCard: 9 },
  hard: { counts: [4, 5], ops: ['+', '-'], targets: [10], maxCard: 9 },
  challenge: { counts: [4, 5], ops: ['+', '-'], targets: [20, 50], maxCard: 20 },
};

function permutations<T>(xs: T[]): T[][] {
  if (xs.length <= 1) return [xs];
  return xs.flatMap((x, i) => permutations([...xs.slice(0, i), ...xs.slice(i + 1)]).map((rest) => [x, ...rest]));
}

/** すべての並べ方・演算子を試して解を探す（途中結果は 0 以上） */
export function solveMake10(p: Make10Puzzle, limit = Infinity): Make10Answer[] {
  const out: Make10Answer[] = [];
  const n = p.cards.length;
  const opCombos: AddSubOp[][] = [[]];
  for (let i = 0; i < n - 1; i++) {
    const next: AddSubOp[][] = [];
    for (const c of opCombos) for (const o of p.ops) next.push([...c, o]);
    opCombos.splice(0, opCombos.length, ...next);
  }
  for (const perm of permutations(p.cards)) {
    for (const ops of opCombos) {
      const v = evaluateLinear({ nums: perm.map((c) => c.value), ops });
      if (v && v.value === p.target && v.minIntermediate >= 0) {
        out.push({ order: perm.map((c) => c.id), ops });
        if (out.length >= limit) return out;
      }
    }
  }
  return out;
}

export const make10: GameLogic<Make10Puzzle, Make10Answer> = {
  id: 'make10',
  generatorVersion: 1,
  create(rng, d) {
    const r = RULES[d];
    const n = rng.pick(r.counts);
    const target = rng.pick(r.targets);
    let values: number[];
    if (!r.ops.includes('-')) {
      // たし算だけ：目標を n 個の正の数に分ける
      values = [];
      let rest = target;
      for (let i = 0; i < n - 1; i++) {
        const v = rng.int(1, Math.min(r.maxCard, rest - (n - 1 - i)));
        values.push(v);
        rest -= v;
      }
      if (rest < 1 || rest > r.maxCard) return null;
      values.push(rest);
    } else {
      values = Array.from({ length: n }, () => rng.int(1, r.maxCard));
    }
    const cards = rng.shuffle(values).map((value, i) => ({ id: `c${i}`, value }));
    const p = { cards, target, ops: r.ops };
    return solveMake10(p, 1).length > 0 ? p : null;
  },
  validate(p, d) {
    const r = RULES[d];
    if (!r.counts.includes(p.cards.length)) return 'count';
    if (!r.targets.includes(p.target)) return 'target';
    if (new Set(p.cards.map((c) => c.id)).size !== p.cards.length) return 'duplicate id';
    if (p.cards.some((c) => !Number.isInteger(c.value) || c.value < 1 || c.value > r.maxCard)) return 'card value';
    if (p.ops.join() !== r.ops.join()) return 'ops';
    if (solveMake10(p, 1).length === 0) return 'unsolvable';
    return null;
  },
  fallback(d) {
    const sets: Record<Difficulty, [number, number[]][]> = {
      easy: [[10, [2, 3, 5]], [10, [1, 4, 5]], [10, [6, 3, 1]]],
      normal: [[10, [8, 4, 2]], [10, [7, 5, 2, 4]], [10, [9, 3, 2]]],
      hard: [[10, [9, 6, 3, 2]], [10, [8, 7, 5, 3, 1]], [10, [6, 6, 4, 2]]],
      challenge: [[20, [12, 9, 5, 4]], [50, [20, 18, 9, 3]], [20, [12, 7, 5, 3, 3]]],
    };
    return sets[d].map(([target, vals]) => ({ target, ops: RULES[d].ops, cards: vals.map((value, i) => ({ id: `c${i}`, value })) }));
  },
  judge(p, a) {
    const ids = p.cards.map((c) => c.id);
    if (a.order.length !== ids.length) return { correct: false, message: 'カードを ぜんぶ つかってね' };
    if (new Set(a.order).size !== a.order.length || !a.order.every((id) => ids.includes(id)))
      return { correct: false, message: 'カードは 1まいずつ つかってね' };
    if (a.ops.length !== a.order.length - 1 || a.ops.some((o) => !p.ops.includes(o))) return { correct: false, message: 'その きごうは つかえないよ' };
    const byId = new Map(p.cards.map((c) => [c.id, c.value]));
    const v = evaluateLinear({ nums: a.order.map((id) => byId.get(id)!), ops: a.ops });
    if (!v) return { correct: false };
    if (v.minIntermediate < 0) return { correct: false, message: 'とちゅうで 0 より ちいさく なっちゃうよ。じゅんばんを かえてみよう' };
    if (v.value !== p.target) return { correct: false, message: `いまは ${v.value}。${p.target} に するには？` };
    return { correct: true };
  },
  hints(p) {
    const sol = solveMake10(p, 1)[0];
    const byId = new Map(p.cards.map((c) => [c.id, c.value]));
    const vals = sol.order.map((id) => byId.get(id)!);
    const sym = (o: AddSubOp) => (o === '+' ? '+' : '−');
    const partial = vals.slice(0, -1).map((v, i) => (i === 0 ? `${v}` : ` ${sym(sol.ops[i - 1])} ${v}`)).join('');
    return [
      `${vals[0]} と ${vals[1]} を くみあわせると どうなる？`,
      `${vals[0]} ${sym(sol.ops[0])} ${vals[1]} から はじめると いいよ`,
      `${partial} ${sym(sol.ops[sol.ops.length - 1])} □ = ${p.target}`,
    ];
  },
  key: (p) => `${p.target}/${p.cards.map((c) => c.value).sort((a, b) => a - b).join(',')}`,
};
