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
import {
  allTopsVisible,
  BLOCK_LEVELS,
  blockBuilder,
  dataToView,
  emptyHeights,
  isSymmetric,
  topVisible,
  viewHeights,
  viewToData,
  wrongCells,
  type BlockPuzzle,
} from './blockBuilder';
import {
  blankCount,
  easiestLine,
  isMagic,
  LO_SHU,
  lineStatus,
  MAGIC4_TEMPLATES,
  MAGIC_LEVELS,
  magicLines,
  magicSolution,
  magicSquare,
  magicSum,
  solveMagic,
  symmetries,
  type MagicPuzzle,
} from './magicSquare';

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

describe('29 ブロック建築パズル：生成（4レベル × 500シード）', () => {
  for (const d of DIFFICULTIES) {
    it(`${d}：大きさ・高さの はんい、宙に うかない 整数、複数の 列、ぜんぶ 同じ 高さで ない`, () => {
      const conf = BLOCK_LEVELS[d];
      let fallbacks = 0;
      const keys = new Set<string>();
      each<BlockPuzzle>(blockBuilder, d, (p, fb) => {
        if (fb) fallbacks++;
        expect(blockBuilder.validate(p, d)).toBeNull();
        expect(p.size).toBe(conf.size);
        expect(p.maxH).toBe(conf.maxH);
        expect(p.showNumbers).toBe(d === 'easy');
        expect(p.heights).toHaveLength(p.size);
        const flat = p.heights.flat();
        expect(flat).toHaveLength(p.size * p.size);
        for (const v of flat) {
          expect(Number.isInteger(v)).toBe(true);
          expect(v).toBeGreaterThanOrEqual(0);
          expect(v).toBeLessThanOrEqual(p.maxH);
        }
        expect(flat.filter((v) => v > 0).length).toBeGreaterThan(1);
        expect(new Set(flat).size).toBeGreaterThan(1);
        expect(allTopsVisible(p.heights)).toBe(true);
        if (d === 'hard' || d === 'challenge') expect(isSymmetric(p.heights)).toBe(false);
        keys.add(blockBuilder.key(p));
        expect(blockBuilder.judge(p, { heights: p.heights.map((r) => [...r]) }).correct).toBe(true);
      });
      expect(fallbacks).toBe(0);
      expect(keys.size).toBeGreaterThan(d === 'easy' ? 40 : 400);
    });
  }
  it('むずかしい ほど ブロックが おおい（へいきん）', () => {
    const avg = (d: Difficulty) => {
      let t = 0;
      each<BlockPuzzle>(blockBuilder, d, (p) => (t += p.heights.flat().reduce((a, b) => a + b, 0)));
      return t / SEEDS;
    };
    const [e, n, h, c] = DIFFICULTIES.map(avg);
    expect(e).toBeLessThan(n);
    expect(n).toBeLessThan(h);
    expect(h).toBeLessThan(c);
  });
});

describe('29 ブロック建築パズル：判定・向き・ヒント', () => {
  const p: BlockPuzzle = { size: 3, maxH: 3, showNumbers: false, heights: [[0, 1, 2], [1, 3, 0], [2, 0, 1]] };
  it('ぴったり 同じ 表だけ 正解。ちがうと 数を やさしく つたえる', () => {
    expect(blockBuilder.judge(p, { heights: [[0, 1, 2], [1, 3, 0], [2, 0, 1]] }).correct).toBe(true);
    const j = blockBuilder.judge(p, { heights: [[0, 1, 2], [1, 2, 0], [2, 0, 0]] });
    expect(j.correct).toBe(false);
    expect(j.message).toContain('2か所');
    // 合計が 同じでも 置き場所が ちがえば まちがい
    expect(blockBuilder.judge(p, { heights: [[2, 1, 0], [0, 3, 1], [1, 0, 2]] }).correct).toBe(false);
    // こわれた こたえ・はんいの そと・小数は 正解に しない
    expect(blockBuilder.judge(p, { heights: [[0, 1, 2], [1, 3, 0]] }).correct).toBe(false);
    expect(blockBuilder.judge(p, { heights: [[0, 1, 2], [1, 4, 0], [2, 0, 1]] }).correct).toBe(false);
    expect(blockBuilder.judge(p, { heights: [[0, 1, 2], [1, 2.5, 0], [2, 0, 1]] }).correct).toBe(false);
    expect(blockBuilder.judge(p, undefined as never).correct).toBe(false);
  });
  it('見る 向きを まわしても データは かわらず、4かい まわすと もとに もどる', () => {
    for (const n of [2, 3, 4])
      for (let r = 0; r < 4; r++) {
        const seen = new Set<string>();
        for (let i = 0; i < n; i++)
          for (let j = 0; j < n; j++) {
            const d = viewToData(n, r, i, j);
            seen.add(`${d.x},${d.y}`);
            expect(dataToView(n, r, d.x, d.y)).toEqual({ i, j });
          }
        expect(seen.size).toBe(n * n);
      }
    const before = JSON.stringify(p.heights);
    const views = [0, 1, 2, 3].map((r) => viewHeights(p.heights, r));
    expect(JSON.stringify(p.heights)).toBe(before);
    expect(views[0]).toEqual(p.heights);
    expect(views[1]).not.toEqual(views[0]);
    // 合計は どの 向きでも 同じ
    for (const v of views) expect(v.flat().reduce((a, b) => a + b, 0)).toBe(10);
  });
  it('手前の 高い 列に かくれた マスは、ほかの 向きなら 見える', () => {
    // まんなか（1,1）の 0 は 手前の 4だんに かくれる
    const h = [[0, 0, 0], [0, 0, 4], [0, 4, 4]];
    expect(topVisible(h, 0, 1, 1)).toBe(false);
    expect([1, 2, 3].some((r) => topVisible(h, r, 1, 1))).toBe(true);
    // まわりを ぜんぶ たかく かこむと どの 向きでも 見えない → 出題しない
    const boxed = [[4, 4, 4], [4, 0, 4], [4, 4, 4]];
    expect(allTopsVisible(boxed)).toBe(false);
    expect(blockBuilder.validate({ size: 3, maxH: 4, showNumbers: false, heights: boxed }, 'hard')).not.toBeNull();
  });
  it('対称・ぜんぶ同じ・1列だけ は はじく', () => {
    expect(isSymmetric([[1, 2, 1], [2, 3, 2], [1, 2, 1]])).toBe(true);
    expect(isSymmetric([[0, 1, 2], [1, 3, 0], [2, 0, 1]])).toBe(true); // ななめに うらがえすと 同じ
    expect(isSymmetric([[0, 1, 2], [1, 3, 0], [2, 4, 1]])).toBe(false);
    expect(blockBuilder.validate({ size: 3, maxH: 4, showNumbers: false, heights: [[1, 2, 1], [2, 4, 2], [1, 2, 1]] }, 'hard')).toBe('symmetric');
    expect(blockBuilder.validate({ size: 2, maxH: 2, showNumbers: true, heights: [[2, 2], [2, 2]] }, 'easy')).not.toBeNull();
    expect(blockBuilder.validate({ size: 2, maxH: 2, showNumbers: true, heights: [[2, 0], [0, 0]] }, 'easy')).not.toBeNull();
    expect(blockBuilder.validate({ size: 2, maxH: 2, showNumbers: true, heights: [[3, 0], [1, 0]] }, 'easy')).not.toBeNull();
  });
  it('ヒント：1 向きの アドバイス、2 ちがう 1か所、3 えらんだ マスの ただしい だん', () => {
    const cur = [[0, 1, 2], [1, 3, 0], [2, 0, 0]];
    const h = blockBuilder.hints(p, { heights: cur, sel: { x: 1, y: 1 } });
    expect(h[0]).toContain('まわす');
    expect(h[0]).toContain('3だん');
    expect(wrongCells(p, cur)).toEqual([{ x: 2, y: 2 }]);
    expect(h[1]).toContain('まえから 1れつめ・ひだりから 3ばんめ');
    expect(h[2]).toContain('3だん');
    expect(blockBuilder.hints(p, { heights: p.heights, sel: null })[1]).toContain('ぜんぶ あって いる');
    expect(blockBuilder.hints(p, undefined)[2]).toContain('マスを えらぶ');
    expect(wrongCells(p, emptyHeights(3))).toHaveLength(6);
  });
  it('登録：29 ・パズル・盤面型で つづきから', () => {
    expect(GAME_BY_ID['block-builder']).toMatchObject({ no: '29', title: 'ブロック建築パズル', category: 'puzzle', kind: 'board', resumable: true });
  });
});

describe('30 魔法陣パズル：お手本と 解く しくみ', () => {
  it('目標の 合計は 3×3 で 15、4×4 で 34。列は 2n＋2 本', () => {
    expect(magicSum(3)).toBe(15);
    expect(magicSum(4)).toBe(34);
    expect(magicLines(3)).toHaveLength(8);
    expect(magicLines(4)).toHaveLength(10);
  });
  it('洛書の 8とおりは ぜんぶ ちがう 魔方陣', () => {
    const all = symmetries(LO_SHU, 3);
    expect(new Set(all.map((g) => g.join())).size).toBe(8);
    for (const g of all) expect(isMagic(g, 3)).toBe(true);
  });
  it('4×4 の 型は どれも 魔方陣。回転・裏がえし・17−x でも 魔方陣のまま', () => {
    const seen = new Set<string>();
    for (const t of MAGIC4_TEMPLATES) {
      expect(isMagic(t, 4)).toBe(true);
      for (const g of symmetries(t, 4)) {
        expect(isMagic(g, 4)).toBe(true);
        expect(isMagic(g.map((v) => 17 - v), 4)).toBe(true);
        seen.add(g.join());
        seen.add(g.map((v) => 17 - v).join());
      }
    }
    expect(seen.size).toBeGreaterThan(40);
  });
  it('魔方陣で ない ものは はじく（合計ちがい・かさなり・はんいの そと・小数）', () => {
    expect(isMagic([2, 7, 6, 9, 5, 1, 4, 8, 3], 3)).toBe(false);
    expect(isMagic([5, 5, 5, 5, 5, 5, 5, 5, 5], 3)).toBe(false);
    expect(isMagic([2, 7, 6, 9, 5, 1, 4, 3, 8, 1], 3)).toBe(false);
    expect(isMagic([2, 7, 6, 9, 5, 1, 4, 3, 8.5], 3)).toBe(false);
    // 合計 15 でも 1〜9 を 1かいずつ でなければ だめ
    expect(isMagic([0, 10, 5, 10, 5, 0, 5, 0, 10], 3)).toBe(false);
  });
  it('解く：あきが ぜんぶ でも 3×3 の 答えは 8つ。上限で とめる', () => {
    expect(solveMagic(new Array(9).fill(0), 3, 100).count).toBe(8);
    expect(solveMagic(new Array(9).fill(0), 3, 2).count).toBe(2);
    expect(solveMagic([2, 7, 6, 9, 0, 1, 4, 3, 8], 3).count).toBe(1);
    expect(solveMagic([2, 7, 6, 9, 0, 1, 4, 3, 8], 3).first).toEqual(LO_SHU);
    // むじゅんする 問題は 0
    expect(solveMagic([1, 0, 0, 0, 1, 0, 0, 0, 0], 3).count).toBe(0);
    expect(solveMagic([5, 0, 0, 0, 0, 0, 0, 0, 0], 3).count).toBe(0);
  });
});

describe('30 魔法陣パズル：生成（4レベル × 500シード）', () => {
  for (const d of DIFFICULTIES) {
    it(`${d}：大きさ・あきの 数・答えが 1つだけ・はじめの かずと 矛盾しない`, () => {
      const conf = MAGIC_LEVELS[d];
      let fallbacks = 0;
      const keys = new Set<string>();
      each<MagicPuzzle>(magicSquare, d, (p, fb) => {
        if (fb) fallbacks++;
        expect(magicSquare.validate(p, d)).toBeNull();
        expect(p.n).toBe(conf.n);
        const b = blankCount(p);
        expect(b).toBeGreaterThanOrEqual(conf.blanks[0]);
        expect(b).toBeLessThanOrEqual(conf.blanks[1]);
        const r = solveMagic(p.givens, p.n, 2);
        expect(r.aborted).toBe(false);
        expect(r.count).toBe(1);
        const sol = r.first!;
        expect(isMagic(sol, p.n)).toBe(true);
        p.givens.forEach((v, i) => v !== 0 && expect(sol[i]).toBe(v));
        expect(magicSquare.judge(p, { cells: sol }).correct).toBe(true);
        keys.add(magicSquare.key(p));
      });
      expect(fallbacks).toBe(0);
      expect(keys.size).toBeGreaterThan(300);
    });
  }
  it('予備の 問題も 検証を 通る', () => {
    for (const d of DIFFICULTIES) {
      const bank = magicSquare.fallback(d);
      expect(bank.length).toBeGreaterThan(0);
      for (const p of bank) expect(magicSquare.validate(p, d)).toBeNull();
    }
  });
});

describe('30 魔法陣パズル：判定と ヒント', () => {
  const p: MagicPuzzle = { n: 3, givens: [2, 7, 0, 9, 5, 1, 4, 0, 0] };
  const sol = [2, 7, 6, 9, 5, 1, 4, 3, 8];
  it('お手本と くらべず、数学の 条件で 正解に する', () => {
    // あきが 多い 問題で、お手本と ちがう 魔方陣でも 条件を みたせば 正解
    const open: MagicPuzzle = { n: 3, givens: [0, 0, 0, 0, 5, 0, 0, 0, 0] };
    const other = [8, 1, 6, 3, 5, 7, 4, 9, 2];
    expect(isMagic(other, 3)).toBe(true);
    expect(magicSquare.judge(open, { cells: other }).correct).toBe(true);
    expect(magicSquare.judge(open, { cells: [...LO_SHU] }).correct).toBe(true);
    expect(magicSquare.judge(p, { cells: sol }).correct).toBe(true);
  });
  it('うまって いない・おなじ かず・はじめの かずを かえた・合計ちがい は 正解に しない', () => {
    expect(magicSquare.judge(p, { cells: [2, 7, 6, 9, 5, 1, 4, 0, 0] })).toMatchObject({ correct: false, message: expect.stringContaining('のこり 2') });
    expect(magicSquare.judge(p, { cells: [2, 7, 6, 9, 5, 1, 4, 6, 8] })).toMatchObject({ correct: false, message: expect.stringContaining('おなじ かず') });
    expect(magicSquare.judge(p, { cells: [3, 7, 6, 9, 5, 1, 4, 2, 8] })).toMatchObject({ correct: false, message: expect.stringContaining('はじめの かず') });
    expect(magicSquare.judge(p, { cells: [2, 7, 8, 9, 5, 1, 4, 3, 6] })).toMatchObject({ correct: false, message: expect.stringMatching(/もうすこし！ (よこ|たて|ななめ)の ごうけいを みてみよう/) });
    expect(magicSquare.judge(p, { cells: [2, 7, 6, 9, 5, 1, 4, 3, 10] }).correct).toBe(false);
    expect(magicSquare.judge(p, { cells: [2, 7, 6, 9, 5, 1, 4, 3] }).correct).toBe(false);
    expect(magicSquare.judge(p, undefined as never).correct).toBe(false);
  });
  it('列の 合計：うまって いない 列は「とちゅう」で 正解あつかい しない', () => {
    const st = lineStatus(3, [2, 7, 0, 9, 5, 1, 4, 0, 0]);
    expect(st[0]).toMatchObject({ sum: 9, empty: 1, complete: false, ok: false });
    expect(st[1]).toMatchObject({ sum: 15, complete: true, ok: true });
    // 途中で 15 でも complete で なければ ok に しない
    const partial = lineStatus(3, [9, 6, 0, 0, 0, 0, 0, 0, 0]);
    expect(partial[0]).toMatchObject({ sum: 15, complete: false, ok: false });
  });
  it('ヒント：1 目標と 見る せん、2 あきが すくない せん、3 1マスの てがかり', () => {
    const cur = [...p.givens];
    const h = magicSquare.hints(p, cur);
    expect(h[0]).toContain('15');
    const line = easiestLine(p, cur)!;
    expect(line.empty).toBe(1);
    expect(h[1]).toContain('あと 1こ');
    // あきが 1つの せんは ひきざんで きまる
    expect(h[2]).toMatch(/15 − \d+ = \d+/);
    const val = Number(h[2].split('= ').at(-1));
    expect(line.cells.some((i) => cur[i] === 0 && sol[i] === val)).toBe(true);
    expect(magicSolution(p)).toEqual(sol);
    // ぜんぶ うまったら ちがう せんを さがす ヒント
    expect(magicSquare.hints(p, [2, 7, 8, 9, 5, 1, 4, 3, 6])[1]).toContain('ちがう せん');
  });
  it('4×4 の ヒント3は 答えの かずを 1つ おしえる（その マスを えらばせるだけ。かってに いれない）', () => {
    const q = magicSquare.fallback('challenge')[0];
    const h = magicSquare.hints(q, q.givens);
    const sol4 = magicSolution(q)!;
    expect(isMagic(sol4, 4)).toBe(true);
    expect(h[2]).toMatch(/\d/);
  });
  it('登録：30 ・パズル・盤面型で つづきから', () => {
    expect(GAME_BY_ID['magic-square']).toMatchObject({ no: '30', title: '魔法陣パズル', category: 'puzzle', kind: 'board', resumable: true });
  });
});
