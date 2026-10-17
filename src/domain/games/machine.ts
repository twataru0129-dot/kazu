import type { Difficulty } from '../types';
import type { GameLogic } from './types';

/** 07 ふしぎな数字マシン：入力→出力の例から きまりを見つける */
export type MachineRule = { mul: number; add: number }; // f(x) = x*mul + add

export interface MachinePuzzle {
  rule: MachineRule;
  examples: { input: number; output: number }[];
  query: number;
}

export const applyRule = (r: MachineRule, x: number) => x * r.mul + r.add;

export function describeRule(r: MachineRule): string {
  if (r.mul === 1) return r.add >= 0 ? `+${r.add}` : `−${-r.add}`;
  if (r.add === 0) return `×${r.mul}`;
  return `×${r.mul} ${r.add >= 0 ? '+' : '−'} ${Math.abs(r.add)}`;
}

/**
 * 許可したルール集合（たし算・ひき算・かけ算・かけて足す）のうち、
 * 例をすべて満たすものを総当たりで探し、query の答えの候補を返す。
 */
export function candidateOutputs(p: Pick<MachinePuzzle, 'examples' | 'query'>): number[] {
  const out = new Set<number>();
  for (let mul = 1; mul <= 9; mul++) {
    for (let add = -50; add <= 50; add++) {
      if (p.examples.every((e) => applyRule({ mul, add }, e.input) === e.output)) out.add(applyRule({ mul, add }, p.query));
    }
  }
  return [...out];
}

export const machine: GameLogic<MachinePuzzle, number | null> = {
  id: 'machine',
  generatorVersion: 1,
  create(rng, d) {
    let rule: MachineRule;
    let maxIn = 10;
    switch (d) {
      case 'easy':
        rule = { mul: 1, add: rng.int(1, 5) };
        break;
      case 'normal':
        rule = rng.chance(0.6) ? { mul: 1, add: rng.int(6, 20) } : { mul: 1, add: -rng.int(1, 9) };
        maxIn = 20;
        break;
      case 'hard':
        rule = { mul: rng.int(2, 5), add: 0 };
        break;
      case 'challenge':
        rule = { mul: rng.int(2, 4), add: rng.pick([-3, -2, -1, 1, 2, 3, 4, 5]) };
        break;
    }
    const minIn = rule.add < 0 ? Math.ceil(-rule.add / rule.mul) + 1 : 1;
    if (minIn + 4 > maxIn) return null;
    const inputs = rng.shuffle(Array.from({ length: maxIn - minIn + 1 }, (_, i) => minIn + i)).slice(0, 4);
    const [q, ...ex] = inputs;
    const examples = ex.sort((a, b) => a - b).map((input) => ({ input, output: applyRule(rule, input) }));
    return { rule, examples, query: q };
  },
  validate(p, d) {
    if (p.examples.length !== 3) return 'examples';
    const inputs = [...p.examples.map((e) => e.input), p.query];
    if (new Set(inputs).size !== 4) return 'distinct inputs';
    if (p.examples.some((e) => applyRule(p.rule, e.input) !== e.output)) return 'example mismatch';
    const outs = [...p.examples.map((e) => e.output), applyRule(p.rule, p.query)];
    if (outs.some((o) => !Number.isInteger(o) || o < 0 || o > 200)) return 'output range';
    const c = candidateOutputs(p);
    if (c.length !== 1 || c[0] !== applyRule(p.rule, p.query)) return 'ambiguous';
    if (d === 'easy' && (p.rule.mul !== 1 || p.rule.add < 1 || p.rule.add > 5)) return 'easy rule';
    if (d === 'hard' && p.rule.add !== 0) return 'hard rule';
    return null;
  },
  fallback(d) {
    const bank: Record<Difficulty, [MachineRule, number[], number][]> = {
      easy: [[{ mul: 1, add: 5 }, [3, 5, 10], 7], [{ mul: 1, add: 2 }, [1, 4, 6], 8]],
      normal: [[{ mul: 1, add: 10 }, [2, 5, 9], 7], [{ mul: 1, add: -3 }, [5, 8, 12], 10]],
      hard: [[{ mul: 2, add: 0 }, [2, 3, 5], 6], [{ mul: 3, add: 0 }, [1, 4, 6], 5]],
      challenge: [[{ mul: 2, add: 1 }, [1, 3, 5], 4], [{ mul: 3, add: -1 }, [2, 4, 6], 5]],
    };
    return bank[d].map(([rule, ins, query]) => ({ rule, query, examples: ins.map((input) => ({ input, output: applyRule(rule, input) })) }));
  },
  judge(p, a) {
    if (a === null) return { correct: false, message: 'かずを いれてね' };
    return a === applyRule(p.rule, p.query) ? { correct: true } : { correct: false, message: 'ほかの れいでも おなじ きまりに なっているか みてみよう' };
  },
  hints(p) {
    const e = p.examples[0];
    const ex2 = p.examples[1];
    const r = p.rule;
    const h2 =
      r.mul === 1
        ? `${e.input}→${e.output} は ${describeRule(r)}、${ex2.input}→${ex2.output} も ${describeRule(r)}`
        : r.add === 0
          ? `${e.input}→${e.output} は ${e.input} の ${r.mul}ばい`
          : `まず ${r.mul}ばいして、そのあと ${r.add > 0 ? `${r.add} たす` : `${-r.add} ひく`}`;
    const h3 = r.mul === 1 ? `${p.query} ${r.add >= 0 ? '+' : '−'} ${Math.abs(r.add)} = □` : r.add === 0 ? `${p.query} × ${r.mul} = □` : `${p.query} × ${r.mul} ${r.add > 0 ? '+' : '−'} ${Math.abs(r.add)} = □`;
    return ['はいった かずと でてきた かずの ちがいを みよう', h2, h3];
  },
  key: (p) => `${describeRule(p.rule)}/${p.examples.map((e) => e.input).join(',')}/${p.query}`,
};
