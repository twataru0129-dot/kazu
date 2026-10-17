import type { Rng } from '../random';

/** まなびモードの「れんしゅう」問題（純粋関数） */
export type MulPractice =
  | { kind: 'count'; per: number; groups: number; answer: number }
  | { kind: 'expr'; per: number; groups: number; options: string[]; answer: string };

export type DivPractice =
  | { kind: 'share'; total: number; people: number; answer: number } // 等分除：ひとり なんこ？
  | { kind: 'group'; total: number; size: number; answer: number } // 包含除：なんふくろ？
  | { kind: 'inverse'; a: number; b: number; answer: number }; // a × b = c だから c ÷ a = ?

export const LEARNING_VERSION = 1;

export function mulPractice(rng: Rng): MulPractice {
  const per = rng.int(2, 6);
  const groups = rng.int(2, 5);
  if (rng.chance(0.5)) return { kind: 'count', per, groups, answer: per * groups };
  const correct = `${per} × ${groups}`;
  const wrong = [`${per} + ${groups}`, `${per} × ${groups + 1}`, `${per + 1} × ${groups}`];
  return { kind: 'expr', per, groups, options: rng.shuffle([correct, ...wrong.slice(0, 2)]), answer: correct };
}

export function divPractice(rng: Rng): DivPractice {
  const k = rng.int(0, 2);
  const a = rng.int(2, 5);
  const b = rng.int(2, 5);
  if (k === 0) return { kind: 'share', total: a * b, people: a, answer: b };
  if (k === 1) return { kind: 'group', total: a * b, size: a, answer: b };
  return { kind: 'inverse', a, b, answer: b };
}

export function judgeMul(p: MulPractice, a: number | string | null): boolean {
  return a !== null && a === p.answer;
}

export function judgeDiv(p: DivPractice, a: number | null): boolean {
  return a !== null && a === p.answer;
}

/** 等分除：配ったあめが全員おなじか */
export function sharedEqually(counts: number[], total: number): boolean {
  return counts.reduce((s, x) => s + x, 0) === total && counts.every((c) => c === counts[0]);
}
