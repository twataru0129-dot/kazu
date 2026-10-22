import { createRng, type Rng } from '../random';
import type { Difficulty } from '../types';
import type { GameLogic } from './types';

/**
 * 28 ピザで分数パズル：等分した ピザの ピースを えらんで、指定された 量を つくる。
 *
 * 分数は { n, d } の 整数で もつ（小数に しない）。等しいかは 交差乗算 a·d = c·b で きめる。
 * 足し算・引き算は 通分して 整数で 計算し、最大公約数で 約分する。
 * 判定は「えらんだ ピースの 数 ÷ 分けた 数」が 目標と 同じ 量か。どの ピースを えらんでも 量が 同じなら 正解。
 */
export interface Frac {
  n: number;
  d: number;
}

export type PizzaPuzzle =
  /** target の 量を、slices 等分の ピザで つくる */
  | { kind: 'make'; target: Frac; slices: number }
  /** 左の ピザ（left.d 等分の うち left.n きれ）と 同じ 量を、slices 等分の ピザで つくる */
  | { kind: 'equal'; left: Frac; slices: number }
  /** a ± b の こたえを、slices 等分の ピザで つくる */
  | { kind: 'op'; a: Frac; b: Frac; op: '+' | '-'; slices: number };

export interface PizzaAnswer {
  /** えらんだ ピースの 番号（0 から、時計まわり） */
  selected: number[];
}

export const gcd = (a: number, b: number): number => (b === 0 ? Math.abs(a) : gcd(b, a % b));
export const lcm = (a: number, b: number) => (a / gcd(a, b)) * b;
export const reduce = (f: Frac): Frac => {
  const g = gcd(f.n, f.d) || 1;
  return { n: f.n / g, d: f.d / g };
};
/** a/b と c/d が 同じ 量か（交差乗算。小数を つかわない） */
export const fracEq = (x: Frac, y: Frac) => x.n * y.d === y.n * x.d;
export const fracAdd = (x: Frac, y: Frac): Frac => reduce({ n: x.n * y.d + y.n * x.d, d: x.d * y.d });
export const fracSub = (x: Frac, y: Frac): Frac => reduce({ n: x.n * y.d - y.n * x.d, d: x.d * y.d });
export const isValidFrac = (f: Frac) => Number.isInteger(f.n) && Number.isInteger(f.d) && f.d > 0 && f.n >= 0 && f.n <= f.d;

/** めあての 量 */
export function pizzaTarget(p: PizzaPuzzle): Frac {
  if (p.kind === 'make') return reduce(p.target);
  if (p.kind === 'equal') return reduce(p.left);
  return p.op === '+' ? fracAdd(p.a, p.b) : fracSub(p.a, p.b);
}

/** めあての 量を つくるのに いる ピースの 数（整数で 表せない ときは null） */
export function slicesNeeded(p: PizzaPuzzle): number | null {
  const t = pizzaTarget(p);
  const x = t.n * p.slices;
  return x % t.d === 0 ? x / t.d : null;
}

/** こどもむけの 言いかた：はんぶん・4ぶんの1・ぜんぶ */
export function fracWords(f: Frac): string {
  if (f.n === 0) return 'なし';
  if (f.n === f.d) return 'ぜんぶ';
  if (f.n * 2 === f.d) return 'はんぶん';
  return `${f.d}ぶんの${f.n}`;
}

const pick = <T,>(rng: Rng, xs: readonly T[]) => rng.pick(xs);
const range = (n: number) => Array.from({ length: n }, (_, i) => i);

function build(rng: Rng, d: Difficulty): PizzaPuzzle | null {
  if (d === 'easy') {
    const slices = pick(rng, [2, 4, 8, 4, 8]);
    // 分子 1 を おおめに
    const den = pick(rng, [2, 4, 4, 8].filter((x) => slices % x === 0));
    const num = rng.chance(0.6) ? 1 : rng.int(1, den - 1);
    return { kind: 'make', target: { n: num, d: den }, slices };
  }
  if (d === 'normal') {
    const den = pick(rng, [3, 4, 6, 8, 12, 3, 6]);
    const slices = pick(rng, [3, 4, 6, 8, 12].filter((x) => x % den === 0));
    // 2/3・3/4・5/6 のように 約分できない 形で だす
    const num = pick(rng, range(den).filter((x) => x > 0 && gcd(x, den) === 1));
    return { kind: 'make', target: { n: num, d: den }, slices };
  }
  if (d === 'hard') {
    const ld = pick(rng, [2, 3, 4, 6]);
    const ln = rng.int(1, ld - 1);
    const slices = pick(rng, [2, 3, 4, 6, 8, 12].filter((x) => x !== ld && (ln * x) % ld === 0));
    if (slices === undefined) return null;
    return { kind: 'equal', left: { n: ln, d: ld }, slices };
  }
  const da = pick(rng, [2, 3, 4, 6, 12]);
  const db = pick(rng, [2, 3, 4, 6, 12]);
  const slices = lcm(da, db);
  if (slices > 12) return null;
  const a = { n: rng.int(1, da - 1), d: da };
  const b = { n: rng.int(1, db - 1), d: db };
  const op: '+' | '-' = rng.chance(0.55) ? '+' : '-';
  return { kind: 'op', a, b, op, slices };
}

export const pizzaFractions: GameLogic<PizzaPuzzle, PizzaAnswer> = {
  id: 'pizza-fractions',
  generatorVersion: 1,
  create: (rng, d) => build(rng, d),
  validate(p, d) {
    if (!Number.isInteger(p.slices) || p.slices < 2 || p.slices > 12) return 'slices';
    const allowed: Record<Difficulty, number[]> = { easy: [2, 4, 8], normal: [3, 4, 6, 8, 12], hard: [2, 3, 4, 6, 8, 12], challenge: [2, 3, 4, 6, 12] };
    if (!allowed[d].includes(p.slices)) return 'slices not allowed';
    if (p.kind === 'make') {
      if (d !== 'easy' && d !== 'normal') return 'kind';
      if (!isValidFrac(p.target) || p.target.n === 0 || p.target.n === p.target.d) return 'target';
    } else if (p.kind === 'equal') {
      if (d !== 'hard') return 'kind';
      if (!isValidFrac(p.left) || p.left.n === 0 || p.left.n === p.left.d || p.left.d === p.slices) return 'left';
    } else {
      if (d !== 'challenge') return 'kind';
      if (!isValidFrac(p.a) || !isValidFrac(p.b) || p.a.n === 0 || p.b.n === 0) return 'operands';
      if (p.slices % p.a.d !== 0 || p.slices % p.b.d !== 0) return 'common slices';
      const t = pizzaTarget(p);
      if (t.n <= 0 || t.n > t.d) return 'result out of 0..1'; // マイナス・1を こえる・0 は だめ
    }
    const need = slicesNeeded(p);
    if (need === null || need < 1 || need > p.slices) return 'not representable';
    return null;
  },
  fallback(d) {
    const out: PizzaPuzzle[] = [];
    for (let seed = 1; seed < 300 && out.length < 6; seed++) {
      const p = build(createRng(seed), d);
      if (p && pizzaFractions.validate(p, d) === null) out.push(p);
    }
    return out;
  },
  judge(p, a) {
    const sel = a?.selected;
    if (!Array.isArray(sel) || sel.length === 0) return { correct: false, message: 'ピースを えらんでね' };
    if (new Set(sel).size !== sel.length || sel.some((i) => !Number.isInteger(i) || i < 0 || i >= p.slices)) return { correct: false, message: 'ピースを えらびなおしてね' };
    const got: Frac = { n: sel.length, d: p.slices };
    const want = pizzaTarget(p);
    if (fracEq(got, want)) return { correct: true };
    return { correct: false, message: got.n * want.d > want.n * got.d ? 'すこし おおいよ。1きれ へらして みよう' : 'すこし たりないよ。もう すこし えらんで みよう' };
  },
  hints(p) {
    const t = pizzaTarget(p);
    if (p.kind === 'make')
      return [
        `したの かず（${p.target.d}）は「${p.target.d}つに わけた」、うえの かず（${p.target.n}）は「そのうち ${p.target.n}つぶん」だよ`,
        `この ピザは ${p.slices}きれ。${p.target.d}つに わけた 1つぶんは ${p.slices / p.target.d}きれ だよ`,
        `${p.target.n}/${p.target.d} = ${p.target.n} × ${p.slices / p.target.d} / ${p.slices}。${p.slices}きれの うち いくつ？`,
      ];
    if (p.kind === 'equal')
      return [
        'ひだりの ピザと おなじ おおきさに なるように えらぼう',
        `ひだりは ${p.left.d}きれの うち ${p.left.n}きれ。みぎは ${p.slices}きれ に わけて あるよ`,
        `${p.left.n}/${p.left.d} = ${t.n}/${t.d} = □/${p.slices}。${p.slices} ÷ ${t.d} = ${p.slices / t.d}きれ が ${t.n}つぶん`,
      ];
    return [
      `${p.a.n}/${p.a.d} と ${p.b.n}/${p.b.d} を おなじ わけかた（${p.slices}きれ）で かんがえよう`,
      `${p.a.n}/${p.a.d} = ${(p.a.n * p.slices) / p.a.d}/${p.slices}、${p.b.n}/${p.b.d} = ${(p.b.n * p.slices) / p.b.d}/${p.slices}`,
      `${(p.a.n * p.slices) / p.a.d} ${p.op === '+' ? '＋' : '−'} ${(p.b.n * p.slices) / p.b.d} = ? きれ。こたえは ${t.n}/${t.d} と おなじ おおきさ`,
    ];
  },
  key: (p) => (p.kind === 'make' ? `m${p.target.n}/${p.target.d}@${p.slices}` : p.kind === 'equal' ? `e${p.left.n}/${p.left.d}@${p.slices}` : `o${p.a.n}/${p.a.d}${p.op}${p.b.n}/${p.b.d}@${p.slices}`),
};
