import type { Difficulty } from '../types';
import type { GameLogic } from './types';

/** 16 なにがはいる？：形と色の並びの規則を読む */
export type ShapeKind = 'circle' | 'triangle' | 'square' | 'star' | 'heart' | 'diamond';
export type ColorKind = 'red' | 'blue' | 'yellow' | 'green';
export const SHAPE_KINDS: ShapeKind[] = ['circle', 'triangle', 'square', 'star', 'heart', 'diamond'];
export const COLOR_KINDS: ColorKind[] = ['red', 'blue', 'yellow', 'green'];

export interface Token {
  shape: ShapeKind;
  color: ColorKind;
}

export interface PatternPuzzle {
  sequence: Token[];
  hidden: number;
  options: Token[];
  /** 形のくりかえしの単位（例 "AAB"）と色の単位（二重規則のとき） */
  shapeUnit: string;
  colorUnit: string;
}

export const tokenKey = (t: Token) => `${t.shape}/${t.color}`;
export const sameToken = (a: Token, b: Token) => a.shape === b.shape && a.color === b.color;

const UNITS: Record<Difficulty, string[]> = {
  easy: ['AB'],
  normal: ['AAB', 'ABC'],
  hard: ['ABB', 'ABBA', 'AABB', 'ABCB'],
  challenge: ['AB', 'ABC', 'AAB'],
};

/** 見えている値から、周期1〜maxP のどの解釈でも □ の値が同じになるか調べる */
export function predictAttr<T>(values: (T | null)[], hidden: number, maxP = Math.min(5, Math.floor(values.length / 2))): T[] {
  const preds = new Set<T>();
  let anyPeriod = false;
  for (let p = 1; p <= maxP; p++) {
    let ok = true;
    for (let i = 0; i + p < values.length && ok; i++) {
      const a = values[i];
      const b = values[i + p];
      if (a !== null && b !== null && a !== b) ok = false;
    }
    if (!ok) continue;
    anyPeriod = true;
    // 同じ位置（周期で割った余りが同じ）の見えている値
    const same = values.filter((v, i) => v !== null && i % p === hidden % p) as T[];
    if (same.length === 0) return []; // この周期では決まらない → あいまい
    preds.add(same[0]);
  }
  return anyPeriod ? [...preds] : [];
}

function seqFromUnit<T>(unit: string, map: Record<string, T>, length: number): T[] {
  return Array.from({ length }, (_, i) => map[unit[i % unit.length]]);
}

export const pattern: GameLogic<PatternPuzzle, Token | null> = {
  id: 'pattern',
  generatorVersion: 1,
  create(rng, d) {
    const shapeUnit = rng.pick(UNITS[d]);
    const letters = [...new Set(shapeUnit)];
    const shapes = rng.shuffle(SHAPE_KINDS).slice(0, letters.length);
    const shapeMap = Object.fromEntries(letters.map((l, i) => [l, shapes[i]]));
    let colorUnit = shapeUnit;
    let colorMap: Record<string, ColorKind>;
    if (d === 'challenge') {
      colorUnit = rng.pick(['AB', 'ABC', 'AAB', 'ABB'].filter((u) => u.length !== shapeUnit.length));
      const cl = [...new Set(colorUnit)];
      const cs = rng.shuffle(COLOR_KINDS).slice(0, cl.length);
      colorMap = Object.fromEntries(cl.map((l, i) => [l, cs[i]]));
    } else {
      const cs = rng.shuffle(COLOR_KINDS).slice(0, letters.length);
      colorMap = Object.fromEntries(letters.map((l, i) => [l, cs[i]]));
    }
    const maxUnit = Math.max(shapeUnit.length, colorUnit.length);
    const length = Math.min(10, Math.max(6, maxUnit * 2 + 2));
    const sh = seqFromUnit(shapeUnit, shapeMap, length);
    const co = seqFromUnit(colorUnit, colorMap, length);
    const sequence = sh.map((shape, i) => ({ shape, color: co[i] }));
    const hidden = d === 'hard' ? rng.int(maxUnit, length - 1) : length - 1;
    const answer = sequence[hidden];
    // まちがいの選択肢：列に出てくる別の形・色の組み合わせを優先
    const nOpt = d === 'easy' ? 3 : 4;
    const pool: Token[] = [];
    for (const t of sequence) if (!sameToken(t, answer) && !pool.some((x) => sameToken(x, t))) pool.push(t);
    if (d === 'challenge') {
      pool.push({ shape: answer.shape, color: rng.pick(COLOR_KINDS.filter((c) => c !== answer.color)) });
      pool.push({ shape: rng.pick(SHAPE_KINDS.filter((s) => s !== answer.shape)), color: answer.color });
    }
    for (const s of rng.shuffle(SHAPE_KINDS)) pool.push({ shape: s, color: rng.pick(COLOR_KINDS) });
    const distractors: Token[] = [];
    for (const t of rng.shuffle(pool.slice(0, 6)).concat(pool.slice(6))) {
      if (distractors.length >= nOpt - 1) break;
      if (sameToken(t, answer) || distractors.some((x) => sameToken(x, t))) continue;
      if (d !== 'challenge' && (t.shape === answer.shape || distractors.some((x) => x.shape === t.shape))) continue;
      distractors.push(t);
    }
    const options = rng.shuffle([answer, ...distractors]);
    return { sequence, hidden, options, shapeUnit, colorUnit };
  },
  validate(p, d) {
    if (p.sequence.length < 6 || p.sequence.length > 10) return 'length';
    const maxUnit = Math.max(p.shapeUnit.length, p.colorUnit.length);
    if (p.hidden < maxUnit) return 'hidden too early';
    if (p.sequence.length < maxUnit * 2) return 'not enough repetition';
    const vis = <K extends keyof Token>(k: K) => p.sequence.map((t, i) => (i === p.hidden ? null : t[k]));
    const ps = predictAttr(vis('shape'), p.hidden);
    const pc = predictAttr(vis('color'), p.hidden);
    const ans = p.sequence[p.hidden];
    if (ps.length !== 1 || ps[0] !== ans.shape) return 'shape ambiguous';
    if (pc.length !== 1 || pc[0] !== ans.color) return 'color ambiguous';
    const correctOpts = p.options.filter((o) => sameToken(o, ans));
    if (correctOpts.length !== 1) return 'options';
    if (new Set(p.options.map(tokenKey)).size !== p.options.length) return 'duplicate options';
    if (p.options.length !== (d === 'easy' ? 3 : 4)) return 'option count';
    // 色だけでしか区別できない選択肢は、二重規則（チャレンジ）以外では作らない
    if (d !== 'challenge' && new Set(p.options.map((o) => o.shape)).size !== p.options.length) return 'shape must distinguish';
    return null;
  },
  fallback(d) {
    const T = (shape: ShapeKind, color: ColorKind): Token => ({ shape, color });
    const r = T('triangle', 'red');
    const b = T('circle', 'blue');
    const y = T('star', 'yellow');
    const g = T('square', 'green');
    const bank: Record<Difficulty, PatternPuzzle> = {
      easy: { sequence: [r, b, r, b, r, b], hidden: 5, options: [b, r, y], shapeUnit: 'AB', colorUnit: 'AB' },
      normal: { sequence: [r, r, b, r, r, b, r, r], hidden: 7, options: [r, b, y, g], shapeUnit: 'AAB', colorUnit: 'AAB' },
      hard: { sequence: [r, b, b, r, r, b, b, r, r, b], hidden: 6, options: [b, r, y, g], shapeUnit: 'ABBA', colorUnit: 'ABBA' },
      challenge: {
        sequence: [T('triangle', 'red'), T('circle', 'blue'), T('triangle', 'yellow'), T('circle', 'red'), T('triangle', 'blue'), T('circle', 'yellow'), T('triangle', 'red'), T('circle', 'blue')],
        hidden: 7,
        options: [T('circle', 'blue'), T('circle', 'red'), T('triangle', 'blue'), T('star', 'yellow')],
        shapeUnit: 'AB',
        colorUnit: 'ABC',
      },
    };
    return [bank[d]];
  },
  judge(p, a) {
    if (!a) return { correct: false, message: 'えらんでね' };
    return sameToken(a, p.sequence[p.hidden]) ? { correct: true } : { correct: false, message: 'くりかえしの まとまりを さがしてみよう' };
  },
  hints(p) {
    const dual = p.shapeUnit !== p.colorUnit;
    return [
      'どこかで おなじ ならびが くりかえして いるかな？',
      dual ? `かたちは ${p.shapeUnit.length}こ、いろは ${p.colorUnit.length}こ ずつ くりかえすよ` : `${p.shapeUnit.length}こ ずつの まとまりが くりかえすよ`,
      `？は まとまりの ${(p.hidden % p.shapeUnit.length) + 1}ばんめ。まえの まとまりの おなじ ばしょを みよう`,
    ];
  },
  key: (p) => p.sequence.map(tokenKey).join('|') + `/${p.hidden}`,
};
