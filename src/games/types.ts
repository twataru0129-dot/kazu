import type { ReactNode } from 'react';
import type { Judgement } from '../domain/games/types';
import type { Difficulty } from '../domain/types';

/** 各ゲーム画面が受け取るもの。正誤は submit（＝ドメインの judge）だけが決める。 */
export interface GameViewProps<P, A, D = unknown> {
  puzzle: P;
  difficulty: Difficulty;
  submit(answer: A): Judgement;
  solved: boolean;
  /** 多解ゲーム：見つけた答え（順番違いは1つとして数える） */
  found: { key: string; answer: A }[];
  hintLevel: number;
  /** 盤面型ゲームの途中状態（再開用） */
  draft?: D;
  saveDraft(state: D): void;
  /** ヒントを盤面に合わせるための進行状況 */
  reportProgress(progress: unknown): void;
  /** フィードバックとヒントの表示（入力欄の近くに置く） */
  status: ReactNode;
}
