import type { Difficulty } from '../types';
import type { GameLogic } from './types';

/** 06 すうじの法則 */
export type SeqRule =
  | { type: 'arith'; start: number; d: number }
  | { type: 'geo'; start: number; r: number }
  | { type: 'alt'; start: number; d1: number; d2: number };

export interface SequencePuzzle {
  values: number[];
  hidden: number;
  rule: SeqRule;
  /** 子どもに示す規則の前提 */
  premise: string;
}

export function expand(rule: SeqRule, length: number): number[] {
  const out = [rule.start];
  for (let i = 1; i < length; i++) {
    const prev = out[i - 1];
    if (rule.type === 'arith') out.push(prev + rule.d);
    else if (rule.type === 'geo') out.push(prev * rule.r);
    else out.push(prev + (i % 2 === 1 ? rule.d1 : rule.d2));
  }
  return out;
}

const diffs = (v: number[]) => v.slice(1).map((x, i) => x - v[i]);

/** 許可している規則の種類のどれかで、この完全な列を説明できるか */
function fitsAnyFamily(seq: number[]): boolean {
  const ds = diffs(seq);
  if (ds.every((d) => d === ds[0]) && ds[0] !== 0) return true;
  if (seq.every((x) => x > 0)) {
    const r = seq[1] / seq[0];
    if (Number.isInteger(r) && r >= 2 && seq.every((x, i) => i === 0 || x === seq[i - 1] * r)) return true;
  }
  const even = ds.filter((_, i) => i % 2 === 0);
  const odd = ds.filter((_, i) => i % 2 === 1);
  if (even.length >= 2 && odd.length >= 2 && even.every((d) => d === even[0]) && odd.every((d) => d === odd[0]) && even[0] !== odd[0]) return true;
  return false;
}

/**
 * 見えている数から □ に入りうる値をすべて集める。
 * 規則の種類（等差・等比・2つの差の交互）すべてについて調べるので、
 * 結果が1つなら「答えが一意」。
 */
export function possibleAnswers(values: number[], hidden: number): number[] {
  const known = values.map((v, i) => (i === hidden ? null : v));
  const knownDiffs: number[] = [];
  for (let i = 0; i + 1 < known.length; i++) if (known[i] !== null && known[i + 1] !== null) knownDiffs.push(known[i + 1]! - known[i]!);
  const cands = new Set<number>();
  const prev = hidden > 0 ? known[hidden - 1] : null;
  const next = hidden + 1 < known.length ? known[hidden + 1] : null;
  for (const d of knownDiffs) {
    if (prev !== null) cands.add(prev + d);
    if (next !== null) cands.add(next - d);
  }
  for (let r = 2; r <= 9; r++) {
    if (prev !== null) cands.add(prev * r);
    if (next !== null && next % r === 0) cands.add(next / r);
  }
  const out: number[] = [];
  for (const x of cands) {
    const seq = known.map((v) => (v === null ? x : v));
    if (fitsAnyFamily(seq)) out.push(x);
  }
  return out.sort((a, b) => a - b);
}

function premiseFor(rule: SeqRule): string {
  if (rule.type === 'arith') return rule.d > 0 ? 'おなじ かずずつ ふえていくよ' : 'おなじ かずずつ へっていくよ';
  if (rule.type === 'geo') return 'まいかい おなじ かずを かけていくよ（×）';
  return '2つの ふえかたが こうごに くりかえすよ';
}

export const sequence: GameLogic<SequencePuzzle, number | null> = {
  id: 'sequence',
  generatorVersion: 1,
  create(rng, d) {
    let rule: SeqRule;
    let length = rng.int(5, 7);
    switch (d) {
      case 'easy':
        rule = { type: 'arith', start: rng.int(0, 10), d: rng.int(1, 5) };
        length = 5;
        break;
      case 'normal':
        rule = { type: 'arith', start: rng.int(0, 30), d: rng.int(2, 10) };
        break;
      case 'hard': {
        const step = rng.int(2, 25);
        const dec = rng.chance(0.5);
        const start = dec ? rng.int(step * (length - 1) + 10, 999) : rng.int(10, 500);
        rule = { type: 'arith', start, d: dec ? -step : step };
        break;
      }
      case 'challenge':
        if (rng.chance(0.5)) {
          length = rng.int(5, 6);
          rule = { type: 'geo', start: rng.int(1, 5), r: rng.int(2, 3) };
        } else {
          length = rng.int(6, 7);
          const d1 = rng.int(1, 10);
          let d2 = rng.int(1, 10);
          if (d2 === d1) d2 = d1 + 1;
          rule = { type: 'alt', start: rng.int(0, 20), d1, d2 };
        }
        break;
    }
    const values = expand(rule, length);
    const hidden = d === 'easy' ? rng.int(1, length - 1) : rng.int(0, length - 1);
    return { values, hidden, rule, premise: premiseFor(rule) };
  },
  validate(p, d) {
    if (p.values.length < 5 || p.values.length > 7) return 'length';
    if (p.values.some((v) => !Number.isInteger(v) || v < 0 || v > 9999)) return 'value range';
    if (expand(p.rule, p.values.length).join() !== p.values.join()) return 'rule mismatch';
    if (p.hidden < 0 || p.hidden >= p.values.length) return 'hidden';
    const ans = possibleAnswers(p.values, p.hidden);
    if (ans.length !== 1 || ans[0] !== p.values[p.hidden]) return `ambiguous: ${ans.join(',')}`;
    if (d !== 'challenge' && p.rule.type !== 'arith') return 'family';
    if ((d === 'easy' || d === 'normal') && p.rule.type === 'arith' && p.rule.d < 0) return 'decreasing';
    return null;
  },
  fallback(d) {
    const rules: Record<Difficulty, [SeqRule, number, number][]> = {
      easy: [[{ type: 'arith', start: 2, d: 2 }, 5, 2], [{ type: 'arith', start: 1, d: 1 }, 5, 3]],
      normal: [[{ type: 'arith', start: 5, d: 5 }, 6, 3], [{ type: 'arith', start: 3, d: 4 }, 6, 0]],
      hard: [[{ type: 'arith', start: 100, d: -10 }, 6, 2], [{ type: 'arith', start: 120, d: 15 }, 6, 4]],
      challenge: [[{ type: 'geo', start: 1, r: 2 }, 6, 3], [{ type: 'alt', start: 1, d1: 2, d2: 5 }, 7, 4]],
    };
    return rules[d].map(([rule, len, hidden]) => ({ rule, hidden, values: expand(rule, len), premise: premiseFor(rule) }));
  },
  judge(p, a) {
    if (a === null) return { correct: false, message: 'かずを いれてね' };
    return a === p.values[p.hidden] ? { correct: true } : { correct: false, message: 'となりの かずとの ちがいを みてみよう' };
  },
  hints(p) {
    const v = p.values;
    const h = p.hidden;
    // 見えている隣どうしの組を探す
    let i = 0;
    while (i + 1 < v.length && (i === h || i + 1 === h)) i++;
    const a = v[i];
    const b = v[i + 1];
    if (p.rule.type === 'geo') {
      const r = p.rule.r;
      return [`${a} から ${b} は なんばいに なった？`, `まいかい ×${r} だよ`, h > 0 ? `${v[h - 1]} × ${r} = □` : `□ × ${r} = ${v[1]}`];
    }
    if (p.rule.type === 'alt') {
      return [
        'となりどうしの ちがいを じゅんばんに みてみよう',
        `+${p.rule.d1} と +${p.rule.d2} が こうごに でてくるよ`,
        h > 0 ? `${v[h - 1]} + ${h % 2 === 1 ? p.rule.d1 : p.rule.d2} = □` : `□ + ${p.rule.d1} = ${v[1]}`,
      ];
    }
    const dd = p.rule.d;
    const word = dd > 0 ? 'ふえた' : 'へった';
    return [
      `${a} から ${b} は いくつ ${word}？`,
      `まいかい ${Math.abs(dd)} ずつ ${dd > 0 ? 'ふえる' : 'へる'}よ`,
      h > 0 ? `${v[h - 1]} ${dd > 0 ? '+' : '−'} ${Math.abs(dd)} = □` : `□ ${dd > 0 ? '+' : '−'} ${Math.abs(dd)} = ${v[1]}`,
    ];
  },
  key: (p) => `${p.values.join(',')}/${p.hidden}`,
};
