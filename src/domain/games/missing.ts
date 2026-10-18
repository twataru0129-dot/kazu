import { createRng } from '../random';
import type { Difficulty, Op } from '../types';
import { OP_SYMBOL } from '../types';
import type { GameLogic } from './types';

/**
 * 17 むしくい算：a ○ b = c の □ を うめる。
 * - □ は「かず まるごと」（かんたん〜むずかしい・チャレンジの わりざん）か、
 *   「1けたの すうじ」（チャレンジの 2つの □）のどちらか
 * - 答えが1つに決まることを、とりうる値をすべて試して確かめる（solutions）
 */
export interface MissingBlank {
  /** 0=a, 1=b, 2=c */
  term: 0 | 1 | 2;
  /** あれば その かずの 左から何けた目（0始まり）だけが □。なければ かず まるごと */
  digit?: number;
}

export interface MissingPuzzle {
  a: number;
  b: number;
  c: number;
  op: Op;
  blanks: MissingBlank[];
}

/** blanks と同じ順番で、□ に入れた かず */
export type MissingAnswer = (number | null)[];

/** かず まるごとの □ で試す上限 */
const WHOLE_MAX = 999;

const OPS: Record<Difficulty, Op[]> = {
  easy: ['add'],
  normal: ['add', 'subtract'],
  hard: ['add', 'subtract', 'multiply'],
  challenge: ['add', 'subtract', 'divide'],
};

const MAX_VALUE: Record<Difficulty, number> = { easy: 10, normal: 20, hard: 100, challenge: 199 };

export function holds(op: Op, a: number, b: number, c: number): boolean {
  if (![a, b, c].every((n) => Number.isInteger(n) && n >= 0)) return false;
  switch (op) {
    case 'add':
      return a + b === c;
    case 'subtract':
      return a - b === c;
    case 'multiply':
      return a * b === c;
    case 'divide':
      return b !== 0 && a === b * c;
  }
}

const termValue = (p: MissingPuzzle, t: 0 | 1 | 2) => [p.a, p.b, p.c][t];

/** □ の候補（1けたの □ は 0〜9。ただし 2けた以上の かずの いちばん上は 1〜9） */
function domain(p: MissingPuzzle, b: MissingBlank): number[] {
  if (b.digit === undefined) return Array.from({ length: WHOLE_MAX + 1 }, (_, i) => i);
  const len = String(termValue(p, b.term)).length;
  const from = b.digit === 0 && len > 1 ? 1 : 0;
  return Array.from({ length: 10 - from }, (_, i) => i + from);
}

/** □ に値を入れたときの a, b, c */
export function fill(p: MissingPuzzle, values: readonly number[]): [number, number, number] {
  const t = [String(p.a), String(p.b), String(p.c)].map((s) => s.split(''));
  const whole: (number | null)[] = [null, null, null];
  p.blanks.forEach((b, i) => {
    if (b.digit === undefined) whole[b.term] = values[i];
    else t[b.term][b.digit] = String(values[i]);
  });
  return [0, 1, 2].map((k) => whole[k] ?? Number(t[k].join(''))) as [number, number, number];
}

/** 式を満たす □ の入れ方をすべて（limit 個まで）集める */
export function solutions(p: MissingPuzzle, limit = 2): number[][] {
  const doms = p.blanks.map((b) => domain(p, b));
  const out: number[][] = [];
  const cur: number[] = [];
  const rec = (i: number) => {
    if (out.length >= limit) return;
    if (i === doms.length) {
      const [a, b, c] = fill(p, cur);
      if (holds(p.op, a, b, c)) out.push([...cur]);
      return;
    }
    for (const v of doms[i]) {
      cur.push(v);
      rec(i + 1);
      cur.pop();
      if (out.length >= limit) return;
    }
  };
  rec(0);
  return out;
}

/** 正解（□ の順） */
export function missingSolution(p: MissingPuzzle): number[] {
  return p.blanks.map((b) => (b.digit === undefined ? termValue(p, b.term) : Number(String(termValue(p, b.term))[b.digit])));
}

/** 画面用：各項を「すうじ」と「□」の並びにする。□ には blanks の番号を入れる */
export type TermPart = { kind: 'num'; text: string } | { kind: 'blank'; index: number; digit: boolean };
export function termParts(p: MissingPuzzle, term: 0 | 1 | 2): TermPart[] {
  const s = String(termValue(p, term));
  const whole = p.blanks.findIndex((b) => b.term === term && b.digit === undefined);
  if (whole >= 0) return [{ kind: 'blank', index: whole, digit: false }];
  const parts: TermPart[] = [];
  s.split('').forEach((ch, k) => {
    const bi = p.blanks.findIndex((b) => b.term === term && b.digit === k);
    if (bi >= 0) parts.push({ kind: 'blank', index: bi, digit: true });
    else {
      const last = parts.at(-1);
      if (last?.kind === 'num') last.text += ch;
      else parts.push({ kind: 'num', text: ch });
    }
  });
  return parts;
}

export const isDigitPuzzle = (p: MissingPuzzle) => p.blanks.some((b) => b.digit !== undefined);

/** 子どもに示す前提（□ に何が入るか） */
export function missingPremise(p: MissingPuzzle): string {
  return isDigitPuzzle(p) ? '□ には 1けたの すうじ（0〜9）が 1つずつ はいるよ' : '□ に はいる かずを こたえよう';
}

export function equationText(p: MissingPuzzle, shown?: readonly (number | null)[]): string {
  const part = (t: 0 | 1 | 2) =>
    termParts(p, t)
      .map((x) => (x.kind === 'num' ? x.text : String(shown?.[x.index] ?? '□')))
      .join('');
  return `${part(0)} ${OP_SYMBOL[p.op]} ${part(1)} = ${part(2)}`;
}

function wholeBlankPuzzle(op: Op, a: number, b: number, c: number, term: 0 | 1 | 2): MissingPuzzle {
  return { a, b, c, op, blanks: [{ term }] };
}

export const missing: GameLogic<MissingPuzzle, MissingAnswer> = {
  id: 'missing-number',
  generatorVersion: 1,
  create(rng, d) {
    const term = rng.int(0, 2) as 0 | 1 | 2;
    switch (d) {
      case 'easy': {
        const c = rng.int(2, 10);
        const a = rng.int(1, c - 1);
        return wholeBlankPuzzle('add', a, c - a, c, term);
      }
      case 'normal': {
        if (rng.chance(0.5)) {
          const c = rng.int(5, 20);
          const a = rng.int(1, c - 1);
          return wholeBlankPuzzle('add', a, c - a, c, term);
        }
        const a = rng.int(5, 20);
        const b = rng.int(1, a - 1);
        return wholeBlankPuzzle('subtract', a, b, a - b, term);
      }
      case 'hard': {
        const op = rng.pick(OPS.hard);
        if (op === 'multiply') {
          const a = rng.int(2, 9);
          const b = rng.int(2, 9);
          return wholeBlankPuzzle(op, a, b, a * b, term);
        }
        if (op === 'add') {
          const c = rng.int(20, 100);
          const a = rng.int(5, c - 5);
          return wholeBlankPuzzle(op, a, c - a, c, term);
        }
        const a = rng.int(20, 100);
        const b = rng.int(5, a - 5);
        return wholeBlankPuzzle(op, a, b, a - b, term);
      }
      case 'challenge': {
        if (rng.chance(0.4)) {
          const b = rng.int(2, 9);
          const c = rng.int(2, 9);
          return wholeBlankPuzzle('divide', b * c, b, c, term);
        }
        // 2けたの たしざん・ひきざんで、1けたの □ を 2つ
        const op: Op = rng.chance(0.5) ? 'add' : 'subtract';
        let a: number;
        let b: number;
        let c: number;
        if (op === 'add') {
          a = rng.int(10, 99);
          b = rng.int(10, 99);
          c = a + b;
        } else {
          a = rng.int(30, 99);
          b = rng.int(10, a - 10);
          c = a - b;
        }
        const slots: MissingBlank[] = [];
        [a, b, c].forEach((v, t) => String(v).split('').forEach((_, k) => slots.push({ term: t as 0 | 1 | 2, digit: k })));
        const picked = rng.shuffle(slots).slice(0, 2);
        picked.sort((x, y) => x.term - y.term || x.digit! - y.digit!);
        return { a, b, c, op, blanks: picked };
      }
    }
  },
  validate(p, d) {
    if (!OPS[d].includes(p.op)) return 'op';
    if (!holds(p.op, p.a, p.b, p.c)) return 'equation';
    if ([p.a, p.b, p.c].some((v) => v > MAX_VALUE[d])) return 'range';
    const whole = p.blanks.filter((b) => b.digit === undefined).length;
    const digit = p.blanks.length - whole;
    if (p.blanks.length === 0) return 'no blank';
    if (d === 'challenge') {
      const ok = (p.op === 'divide' && whole === 1 && digit === 0) || (p.op !== 'divide' && whole === 0 && digit === 2);
      if (!ok) return 'challenge shape';
    } else if (!(whole === 1 && digit === 0)) return 'blank shape';
    for (const b of p.blanks) {
      if (![0, 1, 2].includes(b.term)) return 'term';
      if (b.digit !== undefined && (b.digit < 0 || b.digit >= String(termValue(p, b.term)).length)) return 'digit';
    }
    const keys = p.blanks.map((b) => `${b.term}:${b.digit ?? '*'}`);
    if (new Set(keys).size !== keys.length) return 'duplicate blank';
    // 0 を たす・ひく・かけるは 5さいには わかりにくいので出さない
    if (p.op !== 'divide' && (p.a === 0 || p.b === 0)) return 'zero';
    const sols = solutions(p, 2);
    if (sols.length !== 1) return `not unique (${sols.length})`;
    if (sols[0].join() !== missingSolution(p).join()) return 'solution mismatch';
    return null;
  },
  fallback(d) {
    const out: MissingPuzzle[] = [];
    for (let seed = 1; seed < 500 && out.length < 4; seed++) {
      const p = missing.create(createRng(seed), d);
      if (p && missing.validate(p, d) === null) out.push(p);
    }
    return out;
  },
  judge(p, a) {
    if (!Array.isArray(a) || a.length !== p.blanks.length || a.some((v) => v === null || v === undefined)) {
      return { correct: false, message: p.blanks.length > 1 ? 'ぜんぶの □ に かずを いれてね' : 'かずを いれてね' };
    }
    const vals = a as number[];
    const doms = p.blanks.map((b) => domain(p, b));
    if (vals.some((v, i) => !doms[i].includes(v))) return { correct: false, message: isDigitPuzzle(p) ? '□ には 1けたの すうじを いれてね' : 'もういちど けいさんしてみよう' };
    const [x, y, z] = fill(p, vals);
    // 答えは1つに決まっているので、式が なりたてば せいかい
    if (holds(p.op, x, y, z)) return { correct: true };
    return { correct: false, message: `${x} ${OP_SYMBOL[p.op]} ${y} は ${z} に ならないね` };
  },
  hints(p) {
    const { a, b, c, op } = p;
    if (isDigitPuzzle(p)) {
      const ones = (n: number) => n % 10;
      const opWord = op === 'add' ? 'たす' : 'ひく';
      return [
        'いちの くらい（みぎはしの けた）から じゅんに かんがえよう',
        `いちの くらいは ${ones(a)} ${OP_SYMBOL[op]} ${ones(b)}。${op === 'add' ? 'くりあがり' : 'くりさがり'}にも きを つけてね`,
        `${a} ${opWord} ${b} を ひっさんで けいさんしてみよう`,
      ];
    }
    const t = p.blanks[0].term;
    const S = OP_SYMBOL;
    if (op === 'add') {
      if (t === 2) return [`${a} と ${b} を あわせると いくつ？`, `${a} から ${b} だけ かぞえよう`, `${a} ${S.add} ${b} = □`];
      const known = t === 0 ? b : a;
      return [`${known} に いくつ たすと ${c} に なるかな？`, `${c} から ${known} を ひいてみよう`, `${c} ${S.subtract} ${known} = □`];
    }
    if (op === 'subtract') {
      if (t === 2) return [`${a} から ${b} を とると のこりは？`, `${a} から ${b} だけ もどって かぞえよう`, `${a} ${S.subtract} ${b} = □`];
      if (t === 0) return [`□ から ${b} を とると ${c} が のこったよ`, `もとの かずは ${c} と ${b} を あわせた かず`, `${c} ${S.add} ${b} = □`];
      return [`${a} から いくつ とると ${c} に なるかな？`, `${a} と ${c} の ちがいを かんがえよう`, `${a} ${S.subtract} ${c} = □`];
    }
    if (op === 'multiply') {
      if (t === 2) return [`${a} が ${b}こ ぶん だよ`, `${a} の だんの くく を おもいだそう`, `${a} ${S.multiply} ${b} = □`];
      const known = t === 0 ? b : a;
      return [`${known} の だんの くく で ${c} に なるのは？`, `${known} を なんかい たすと ${c} かな？`, `${c} ${S.divide} ${known} = □`];
    }
    if (t === 0) return [`${b} ずつ ${c} こに わけると、もとは いくつ？`, `${b} の だんの くく を つかおう`, `${b} ${S.multiply} ${c} = □`];
    if (t === 1) return [`${a} を いくつずつ わけると ${c} こに なるかな？`, `${c} の だんの くく で ${a} に なるのは？`, `${a} ${S.divide} ${c} = □`];
    return [`${a} を ${b} ずつ わけると いくつ ぶん？`, `${b} の だんの くく で ${a} に なるのは？`, `${b} ${S.multiply} □ = ${a}`];
  },
  key: (p) => `${equationText(p)}`,
};
