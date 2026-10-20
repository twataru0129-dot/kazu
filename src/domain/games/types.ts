import type { Rng } from '../random';
import type { Difficulty } from '../types';

export type GameId =
  | 'decompose'
  | 'pittari'
  | 'make10'
  | 'kufuu'
  | 'balance'
  | 'sequence'
  | 'machine'
  | 'flash'
  | 'numberline'
  | 'coins'
  | 'shopping'
  | 'sudoku'
  | 'maze'
  | 'shapes'
  | 'mirror'
  | 'pattern'
  | 'missing-number'
  | 'triangle-pattern'
  | 'dot-connect'
  | 'symbol-memory'
  | 'nonogram'
  | 'light-sequence'
  | 'net-quiz'
  | 'shuffle-cups'
  | 'vanishing-path';

export type GameCategory = 'make' | 'compare' | 'life' | 'puzzle' | 'memory';

export interface Judgement {
  correct: boolean;
  /** 子ども向けの短いフィードバック（責めない言い方） */
  message?: string;
  /** 多解ゲームで「同じ発見」かどうかを見分けるキー */
  solutionKey?: string;
}

/**
 * 1つのゲームの数学的ロジック。UI から独立した純粋関数の集まり。
 * 正誤判定の「真実のソース」はここ。UI は答えを別に計算しない。
 */
export interface GameLogic<P, A> {
  id: GameId;
  generatorVersion: number;
  /** 乱数から候補を1つ作る（失敗してよい：null） */
  /** recent：このセッションで直前に出した問題（新しいものが最後）。出題の偏りを防ぐのに使ってよい */
  create(rng: Rng, d: Difficulty, recent?: readonly P[]): P | null;
  /** 出題条件を満たすか。満たせば null、だめなら理由 */
  validate(p: P, d: Difficulty): string | null;
  /** 検証済みの予備問題（生成に失敗したときに使う） */
  fallback(d: Difficulty): P[];
  judge(p: P, answer: A): Judgement;
  /** 3段階ヒント。盤面型ゲームは進行状況 progress を見てヒントを変える */
  hints(p: P, progress?: unknown): [string, string, string];
  /** 同じ問題かどうかのキー */
  key(p: P): string;
}

export const MAX_GENERATE_TRIES = 200;

export interface Generated<P> {
  puzzle: P;
  fromFallback: boolean;
}

/** 生成 → 検証 → だめなら再生成、上限に達したら検証済み予備問題へ */
export function generatePuzzle<P, A>(
  logic: GameLogic<P, A>,
  rng: Rng,
  d: Difficulty,
  avoidKeys: ReadonlySet<string> = new Set(),
  recent: readonly P[] = [],
): Generated<P> {
  for (let i = 0; i < MAX_GENERATE_TRIES; i++) {
    const p = logic.create(rng, d, recent);
    if (p && logic.validate(p, d) === null && !avoidKeys.has(logic.key(p))) return { puzzle: p, fromFallback: false };
  }
  const bank = logic.fallback(d).filter((p) => logic.validate(p, d) === null);
  if (bank.length === 0) throw new Error(`no fallback puzzle for ${logic.id}/${d}`);
  const fresh = bank.filter((p) => !avoidKeys.has(logic.key(p)));
  return { puzzle: rng.pick(fresh.length ? fresh : bank), fromFallback: true };
}

export const sum = (xs: readonly number[]) => xs.reduce((s, x) => s + x, 0);
export const isPosInt = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n) && n > 0;
export const isNonNegInt = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n) && n >= 0;
