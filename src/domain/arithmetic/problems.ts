import type { Rng } from '../random';
import type { Difficulty, Op } from '../types';

export type Digits = 1 | 2 | 3;
export type Carry = 'none' | 'with' | 'mixed';
export type MulLevel = 'kuku' | '2x1';
export type DivLevel = 'kuku' | '2digit';

export interface ArithSettings {
  ops: Op[];
  digits: Digits;
  carry: Carry;
  mul: MulLevel;
  div: DivLevel;
}

export interface ArithProblem {
  op: Op;
  a: number;
  b: number;
  answer: number;
  /** 繰り上がり（たし算）／繰り下がり（ひき算）があるか */
  carry: boolean;
  /** 同じ問題か判定するキー */
  key: string;
  /** 記録・集計用の難易度キー（例 add:d2:with） */
  levelKey: string;
}

export const ARITH_GENERATOR_VERSION = 1;

export const DEFAULT_ARITH_SETTINGS: ArithSettings = {
  ops: ['add'],
  digits: 1,
  carry: 'mixed',
  mul: 'kuku',
  div: 'kuku',
};

/** たし算で、どこかの位で繰り上がりがあるか */
export function hasCarryAdd(a: number, b: number): boolean {
  let c = 0;
  while (a > 0 || b > 0) {
    const s = (a % 10) + (b % 10) + c;
    if (s >= 10) return true;
    c = 0;
    a = Math.floor(a / 10);
    b = Math.floor(b / 10);
  }
  return false;
}

/** ひき算（a>=b）で、どこかの位で繰り下がりがあるか */
export function hasBorrowSub(a: number, b: number): boolean {
  let borrow = 0;
  while (a > 0 || b > 0) {
    const d = (a % 10) - borrow - (b % 10);
    if (d < 0) return true;
    borrow = 0;
    a = Math.floor(a / 10);
    b = Math.floor(b / 10);
  }
  return false;
}

export function digitCount(n: number): number {
  return Math.abs(n).toString().length;
}

const range = (d: Digits): [number, number] => (d === 1 ? [1, 9] : d === 2 ? [10, 99] : [100, 999]);

export function levelKeyFor(op: Op, s: Pick<ArithSettings, 'digits' | 'mul' | 'div'>, carry: boolean | 'mixed'): string {
  if (op === 'multiply') return `multiply:${s.mul}`;
  if (op === 'divide') return `divide:${s.div}`;
  return `${op}:d${s.digits}:${carry === 'mixed' ? 'mixed' : carry ? 'with' : 'none'}`;
}

export function difficultyOf(p: Pick<ArithProblem, 'op' | 'levelKey'>): Difficulty {
  if (p.op === 'multiply' || p.op === 'divide') return p.levelKey.endsWith('kuku') ? 'normal' : 'hard';
  if (p.levelKey.includes(':d1:')) return 'easy';
  if (p.levelKey.includes(':d2:')) return 'normal';
  return 'hard';
}

export function levelLabel(levelKey: string): string {
  const [op, a, b] = levelKey.split(':');
  if (op === 'multiply') return a === 'kuku' ? 'くく' : '2けた×1けた';
  if (op === 'divide') return a === 'kuku' ? 'くくの わりざん' : '2けた÷1けた';
  const carryWord = op === 'add' ? 'くりあがり' : 'くりさがり';
  const c = b === 'with' ? `${carryWord}あり` : b === 'none' ? `${carryWord}なし` : 'まぜる';
  return `${a.slice(1)}けた・${c}`;
}

function make(op: Op, a: number, b: number, settings: ArithSettings, carryWanted: boolean | 'mixed'): ArithProblem {
  const answer = op === 'add' ? a + b : op === 'subtract' ? a - b : op === 'multiply' ? a * b : a / b;
  const carry = op === 'add' ? hasCarryAdd(a, b) : op === 'subtract' ? hasBorrowSub(a, b) : false;
  return { op, a, b, answer, carry, key: `${op}:${a}:${b}`, levelKey: levelKeyFor(op, settings, carryWanted) };
}

/** 1問ぶんの候補を作る（条件を満たすとは限らない） */
function candidate(rng: Rng, op: Op, s: ArithSettings, wantCarry: boolean): ArithProblem {
  const [lo, hi] = range(s.digits);
  switch (op) {
    case 'add':
      return make(op, rng.int(lo, hi), rng.int(lo, hi), s, wantCarry);
    case 'subtract': {
      if (s.digits === 1 && wantCarry) {
        // 1けたの繰り下がり：11〜18 − 1けた（例 13−5）
        const a = rng.int(11, 18);
        return make(op, a, rng.int(2, 9), s, wantCarry);
      }
      const x = rng.int(lo, hi);
      const y = rng.int(lo, hi);
      return make(op, Math.max(x, y), Math.min(x, y), s, wantCarry);
    }
    case 'multiply':
      return s.mul === 'kuku' ? make(op, rng.int(1, 9), rng.int(1, 9), s, false) : make(op, rng.int(10, 99), rng.int(2, 9), s, false);
    case 'divide': {
      if (s.div === 'kuku') {
        const d = rng.int(2, 9);
        const q = rng.int(1, 9);
        return make(op, d * q, d, s, false);
      }
      const d = rng.int(2, 9);
      const q = rng.int(10, Math.floor(99 / d));
      return make(op, d * q, d, s, false);
    }
  }
}

/** 問題が設定どおりかを検証する（生成後バリデータ）。問題なければ null。 */
export function validateProblem(p: ArithProblem, s: ArithSettings, wantCarry?: boolean): string | null {
  const isInt = (n: number) => Number.isInteger(n) && n >= 0;
  if (!isInt(p.a) || !isInt(p.b) || !isInt(p.answer)) return 'non-integer or negative';
  const [lo, hi] = range(s.digits);
  switch (p.op) {
    case 'add':
      if (p.a + p.b !== p.answer) return 'wrong sum';
      if (p.a < lo || p.a > hi || p.b < lo || p.b > hi) return 'digits';
      if (p.carry !== hasCarryAdd(p.a, p.b)) return 'carry flag';
      break;
    case 'subtract':
      if (p.a - p.b !== p.answer) return 'wrong diff';
      if (p.a < p.b) return 'negative';
      if (s.digits === 1 && p.carry) {
        if (p.a < 11 || p.a > 18 || p.b < 1 || p.b > 9) return 'digits (1-digit borrow)';
      } else if (p.a < lo || p.a > hi || p.b < lo || p.b > hi) return 'digits';
      if (p.carry !== hasBorrowSub(p.a, p.b)) return 'borrow flag';
      break;
    case 'multiply':
      if (p.a * p.b !== p.answer) return 'wrong product';
      if (s.mul === 'kuku' && (p.a < 1 || p.a > 9 || p.b < 1 || p.b > 9)) return 'kuku range';
      if (s.mul === '2x1' && (p.a < 10 || p.a > 99 || p.b < 2 || p.b > 9)) return '2x1 range';
      break;
    case 'divide':
      if (p.b === 0) return 'zero division';
      if (p.a % p.b !== 0 || p.a / p.b !== p.answer) return 'not divisible';
      if (s.div === 'kuku' && (p.b < 2 || p.b > 9 || p.answer < 1 || p.answer > 9)) return 'kuku div range';
      if (s.div === '2digit' && (p.a < 10 || p.a > 99 || p.b < 2 || p.b > 9 || p.answer < 10)) return '2digit div range';
      break;
  }
  if (wantCarry !== undefined && (p.op === 'add' || p.op === 'subtract') && p.carry !== wantCarry) return 'carry condition';
  return null;
}

/**
 * 設定どおりの問題を1問生成する。recent に入っているキーはなるべく避ける。
 * 乱数で見つからない場合は全探索で必ず条件を満たす問題を返す（フォールバック）。
 */
export function generateProblem(rng: Rng, op: Op, s: ArithSettings, recent: ReadonlySet<string> = new Set()): ArithProblem {
  const wantCarry = s.carry === 'mixed' ? rng.chance(0.5) : s.carry === 'with';
  const carryArg = op === 'add' || op === 'subtract' ? wantCarry : undefined;
  for (let i = 0; i < 300; i++) {
    const p = candidate(rng, op, s, wantCarry);
    if (s.carry === 'mixed') p.levelKey = levelKeyFor(op, s, 'mixed');
    if (validateProblem(p, s, carryArg) === null && !recent.has(p.key)) return p;
  }
  return fallbackProblem(rng, op, s, wantCarry, recent);
}

function fallbackProblem(rng: Rng, op: Op, s: ArithSettings, wantCarry: boolean, recent: ReadonlySet<string>): ArithProblem {
  const all: ArithProblem[] = [];
  const carryArg = op === 'add' || op === 'subtract' ? wantCarry : undefined;
  const push = (a: number, b: number) => {
    const p = make(op, a, b, s, s.carry === 'mixed' ? 'mixed' : wantCarry);
    if (validateProblem(p, s, carryArg) === null) all.push(p);
  };
  const [lo, hi] = range(s.digits);
  const step = s.digits === 3 ? 7 : 1; // 3けたは間引いて列挙
  if (op === 'add' || op === 'subtract') {
    const aLo = op === 'subtract' && s.digits === 1 && wantCarry ? 11 : lo;
    const aHi = op === 'subtract' && s.digits === 1 && wantCarry ? 18 : hi;
    for (let a = aLo; a <= aHi; a += step) for (let b = lo; b <= hi; b += step) push(a, b);
  } else if (op === 'multiply') {
    if (s.mul === 'kuku') for (let a = 1; a <= 9; a++) for (let b = 1; b <= 9; b++) push(a, b);
    else for (let a = 10; a <= 99; a++) for (let b = 2; b <= 9; b++) push(a, b);
  } else {
    for (let d = 2; d <= 9; d++) for (let q = 1; q <= 99; q++) push(d * q, d);
  }
  const fresh = all.filter((p) => !recent.has(p.key));
  const pool = fresh.length > 0 ? fresh : all;
  if (pool.length === 0) throw new Error(`no arithmetic problem for ${op} ${JSON.stringify(s)}`);
  return rng.pick(pool);
}

/** 出題用：複数の演算をなるべく均等に並べて n 問作る */
export function generateProblemSet(rng: Rng, s: ArithSettings, n: number, history: string[] = []): ArithProblem[] {
  if (s.ops.length === 0) throw new Error('ops must not be empty');
  const opsSeq: Op[] = [];
  for (let i = 0; i < n; i++) opsSeq.push(s.ops[i % s.ops.length]);
  const order = rng.shuffle(opsSeq);
  const recentList = [...history];
  const out: ArithProblem[] = [];
  for (const op of order) {
    const p = generateProblem(rng, op, s, new Set(recentList.slice(-20)));
    out.push(p);
    recentList.push(p.key);
  }
  return out;
}

export function formatProblem(p: Pick<ArithProblem, 'op' | 'a' | 'b'>): string {
  const sym = { add: '+', subtract: '−', multiply: '×', divide: '÷' }[p.op];
  return `${p.a} ${sym} ${p.b}`;
}

export function judgeArith(p: ArithProblem, value: number | null): boolean {
  return value !== null && value === p.answer;
}
