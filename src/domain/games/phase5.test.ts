import { describe, expect, it } from 'vitest';
import { createRng } from '../random';
import { DIFFICULTIES, type Difficulty } from '../types';
import { generatePuzzle } from './types';
import { GAME_BY_ID } from './registry';
import {
  fracAdd,
  fracEq,
  fracSub,
  fracWords,
  gcd,
  isValidFrac,
  lcm,
  pizzaFractions,
  pizzaTarget,
  reduce,
  slicesNeeded,
  type PizzaPuzzle,
} from './pizzaFractions';

const SEEDS = 500;
const each = <P,>(logic: Parameters<typeof generatePuzzle>[0], d: Difficulty, fn: (p: P, fallback: boolean) => void) => {
  for (let seed = 1; seed <= SEEDS; seed++) {
    const r = generatePuzzle(logic, createRng(seed), d);
    fn(r.puzzle as P, r.fromFallback);
  }
};
const range = (n: number) => Array.from({ length: n }, (_, i) => i);

describe('28 ピザで分数パズル：分数の 整数計算', () => {
  it('交差乗算で 等しさを きめる：1/2 = 2/4 = 4/8、1/3 ≠ 1/2', () => {
    expect(fracEq({ n: 1, d: 2 }, { n: 2, d: 4 })).toBe(true);
    expect(fracEq({ n: 2, d: 4 }, { n: 4, d: 8 })).toBe(true);
    expect(fracEq({ n: 1, d: 2 }, { n: 4, d: 8 })).toBe(true);
    expect(fracEq({ n: 2, d: 3 }, { n: 8, d: 12 })).toBe(true);
    expect(fracEq({ n: 1, d: 3 }, { n: 1, d: 2 })).toBe(false);
    expect(fracEq({ n: 3, d: 4 }, { n: 5, d: 6 })).toBe(false);
  });
  it('たしざん・ひきざんは 約分した 整数の 分数', () => {
    expect(fracAdd({ n: 1, d: 3 }, { n: 1, d: 6 })).toEqual({ n: 1, d: 2 });
    expect(fracSub({ n: 3, d: 4 }, { n: 1, d: 3 })).toEqual({ n: 5, d: 12 });
    expect(fracAdd({ n: 1, d: 4 }, { n: 1, d: 4 })).toEqual({ n: 1, d: 2 });
    expect(fracAdd({ n: 1, d: 2 }, { n: 1, d: 2 })).toEqual({ n: 1, d: 1 });
    expect(reduce({ n: 6, d: 8 })).toEqual({ n: 3, d: 4 });
    expect(gcd(12, 8)).toBe(4);
    expect(lcm(4, 6)).toBe(12);
  });
  it('分母 0・マイナス・分母より 大きい 分子は 不正', () => {
    expect(isValidFrac({ n: 1, d: 0 })).toBe(false);
    expect(isValidFrac({ n: -1, d: 4 })).toBe(false);
    expect(isValidFrac({ n: 5, d: 4 })).toBe(false);
    expect(isValidFrac({ n: 1.5, d: 4 })).toBe(false);
    expect(isValidFrac({ n: 3, d: 4 })).toBe(true);
  });
  it('こどもむけの ことば', () => {
    expect(fracWords({ n: 1, d: 2 })).toBe('はんぶん');
    expect(fracWords({ n: 2, d: 4 })).toBe('はんぶん');
    expect(fracWords({ n: 1, d: 4 })).toBe('4ぶんの1');
    expect(fracWords({ n: 4, d: 4 })).toBe('ぜんぶ');
  });
});

describe('28 ピザで分数パズル：生成（4レベル × 500シード）', () => {
  const allowed: Record<Difficulty, number[]> = { easy: [2, 4, 8], normal: [3, 4, 6, 8, 12], hard: [2, 3, 4, 6, 8, 12], challenge: [2, 3, 4, 6, 12] };
  for (const d of DIFFICULTIES) {
    it(`${d}：検証を 通り、こたえの ピース数が 1〜分けた数 の 整数`, () => {
      let fallbacks = 0;
      const keys = new Set<string>();
      each<PizzaPuzzle>(pizzaFractions, d, (p, fb) => {
        if (fb) fallbacks++;
        expect(pizzaFractions.validate(p, d)).toBeNull();
        expect(allowed[d]).toContain(p.slices);
        expect(p.slices).toBeLessThanOrEqual(12);
        const need = slicesNeeded(p);
        expect(need).not.toBeNull();
        expect(Number.isInteger(need)).toBe(true);
        expect(need!).toBeGreaterThanOrEqual(1);
        expect(need!).toBeLessThanOrEqual(p.slices);
        const t = pizzaTarget(p);
        expect(t.d).toBeGreaterThan(0);
        expect(t.n).toBeGreaterThan(0);
        expect(t.n).toBeLessThanOrEqual(t.d);
        keys.add(pizzaFractions.key(p));
        // 正しい 数を えらべば 正解（先頭からでも うしろからでも）
        expect(pizzaFractions.judge(p, { selected: range(need!) }).correct).toBe(true);
        expect(pizzaFractions.judge(p, { selected: range(need!).map((i) => p.slices - 1 - i) }).correct).toBe(true);
        // ひとつ 多い・少ない は まちがい
        if (need! < p.slices) expect(pizzaFractions.judge(p, { selected: range(need! + 1) }).correct).toBe(false);
        if (need! > 1) expect(pizzaFractions.judge(p, { selected: range(need! - 1) }).correct).toBe(false);
      });
      expect(fallbacks).toBe(0);
      expect(keys.size).toBeGreaterThan(d === 'easy' ? 8 : 15);
    });
  }
  it('easy は 分子 1 が おおめ、kind は レベルごとに きまる', () => {
    let one = 0;
    each<PizzaPuzzle>(pizzaFractions, 'easy', (p) => {
      expect(p.kind).toBe('make');
      if (p.kind === 'make' && p.target.n === 1) one++;
    });
    expect(one / SEEDS).toBeGreaterThan(0.5);
    each<PizzaPuzzle>(pizzaFractions, 'normal', (p) => expect(p.kind).toBe('make'));
    each<PizzaPuzzle>(pizzaFractions, 'hard', (p) => {
      expect(p.kind).toBe('equal');
      if (p.kind === 'equal') expect(p.left.d).not.toBe(p.slices);
    });
    let plus = 0;
    let minus = 0;
    each<PizzaPuzzle>(pizzaFractions, 'challenge', (p) => {
      expect(p.kind).toBe('op');
      if (p.kind !== 'op') return;
      // 共通の 分け方
      expect(p.slices % p.a.d).toBe(0);
      expect(p.slices % p.b.d).toBe(0);
      // マイナスに ならない
      const t = p.op === '+' ? fracAdd(p.a, p.b) : fracSub(p.a, p.b);
      expect(t.n).toBeGreaterThan(0);
      if (p.op === '+') plus++;
      else minus++;
    });
    expect(plus).toBeGreaterThan(50);
    expect(minus).toBeGreaterThan(50);
  });
  it('normal は 1/3・2/3・3/4・5/6 のような 分数が でる', () => {
    const seen = new Set<string>();
    each<PizzaPuzzle>(pizzaFractions, 'normal', (p) => {
      if (p.kind === 'make') seen.add(`${p.target.n}/${p.target.d}`);
      if (p.kind === 'make') expect(gcd(p.target.n, p.target.d)).toBe(1);
    });
    for (const f of ['1/3', '2/3', '3/4', '5/6']) expect(seen).toContain(f);
  });
});

describe('28 ピザで分数パズル：判定', () => {
  const p: PizzaPuzzle = { kind: 'make', target: { n: 1, d: 2 }, slices: 4 };
  it('どの ピースを えらんでも 量が おなじなら 正解', () => {
    for (const sel of [[0, 1], [2, 3], [0, 3], [1, 2], [0, 2]]) expect(pizzaFractions.judge(p, { selected: sel }).correct).toBe(true);
  });
  it('多い・少ないで ことばを かえる。こわれた こたえは 正解に しない', () => {
    expect(pizzaFractions.judge(p, { selected: [0] })).toMatchObject({ correct: false, message: expect.stringContaining('たりない') });
    expect(pizzaFractions.judge(p, { selected: [0, 1, 2] })).toMatchObject({ correct: false, message: expect.stringContaining('おおい') });
    expect(pizzaFractions.judge(p, { selected: [] }).correct).toBe(false);
    expect(pizzaFractions.judge(p, { selected: [0, 0] }).correct).toBe(false);
    expect(pizzaFractions.judge(p, { selected: [0, 4] }).correct).toBe(false);
    expect(pizzaFractions.judge(p, { selected: [-1, 0] }).correct).toBe(false);
    expect(pizzaFractions.judge(p, undefined as never).correct).toBe(false);
  });
  it('1/3 + 1/6 = 1/2 を 6きれで 3きれ、3/4 − 1/3 = 5/12 を 12きれで 5きれ', () => {
    const add: PizzaPuzzle = { kind: 'op', a: { n: 1, d: 3 }, b: { n: 1, d: 6 }, op: '+', slices: 6 };
    expect(pizzaFractions.validate(add, 'challenge')).toBeNull();
    expect(slicesNeeded(add)).toBe(3);
    expect(pizzaFractions.judge(add, { selected: [1, 3, 5] }).correct).toBe(true);
    const sub: PizzaPuzzle = { kind: 'op', a: { n: 3, d: 4 }, b: { n: 1, d: 3 }, op: '-', slices: 12 };
    expect(pizzaFractions.validate(sub, 'challenge')).toBeNull();
    expect(pizzaFractions.judge(sub, { selected: range(5) }).correct).toBe(true);
    expect(pizzaFractions.judge(sub, { selected: range(6) }).correct).toBe(false);
  });
  it('2/3 と おなじ おおきさを 12きれで つくる（hard）', () => {
    const q: PizzaPuzzle = { kind: 'equal', left: { n: 2, d: 3 }, slices: 12 };
    expect(pizzaFractions.validate(q, 'hard')).toBeNull();
    expect(pizzaFractions.judge(q, { selected: range(8) }).correct).toBe(true);
  });
  it('検証：マイナス・1を こえる・分母 0・あらわせない 量・同じ 分け方 は はじく', () => {
    expect(pizzaFractions.validate({ kind: 'op', a: { n: 1, d: 3 }, b: { n: 1, d: 2 }, op: '-', slices: 6 }, 'challenge')).not.toBeNull();
    expect(pizzaFractions.validate({ kind: 'op', a: { n: 3, d: 4 }, b: { n: 1, d: 2 }, op: '+', slices: 4 }, 'challenge')).not.toBeNull();
    expect(pizzaFractions.validate({ kind: 'make', target: { n: 1, d: 0 }, slices: 4 }, 'easy')).not.toBeNull();
    expect(pizzaFractions.validate({ kind: 'make', target: { n: 1, d: 3 }, slices: 4 }, 'normal')).not.toBeNull();
    expect(pizzaFractions.validate({ kind: 'make', target: { n: 1, d: 2 }, slices: 16 }, 'easy')).not.toBeNull();
    expect(pizzaFractions.validate({ kind: 'equal', left: { n: 1, d: 2 }, slices: 2 }, 'hard')).not.toBeNull();
    expect(pizzaFractions.validate({ kind: 'equal', left: { n: 1, d: 3 }, slices: 4 }, 'hard')).not.toBeNull();
    expect(pizzaFractions.validate({ kind: 'make', target: { n: 1, d: 2 }, slices: 4 }, 'hard')).not.toBeNull();
  });
  it('ヒントは 3だんかい。3つめは しき', () => {
    each<PizzaPuzzle>(pizzaFractions, 'hard', (q) => {
      const h = pizzaFractions.hints(q, undefined);
      expect(h).toHaveLength(3);
      expect(h[2]).toContain('=');
    });
    const h = pizzaFractions.hints({ kind: 'equal', left: { n: 2, d: 4 }, slices: 6 }, undefined);
    expect(h[2]).toContain('2/4 = 1/2 = □/6');
    expect(h[2]).toContain('3きれ');
  });
  it('登録：28 ・つくる・5もん セット', () => {
    expect(GAME_BY_ID['pizza-fractions']).toMatchObject({ no: '28', title: 'ピザで分数パズル', category: 'make', kind: 'set', resumable: false });
    expect(GAME_BY_ID['pizza-fractions'].logic.generatorVersion).toBe(1);
  });
});
