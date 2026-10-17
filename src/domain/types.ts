export type Op = 'add' | 'subtract' | 'multiply' | 'divide';
export type Difficulty = 'easy' | 'normal' | 'hard' | 'challenge';
export type Mode = 'calculation' | 'game' | 'test' | 'learning';

export const DIFFICULTIES: readonly Difficulty[] = ['easy', 'normal', 'hard', 'challenge'];
export const DIFFICULTY_LABEL: Record<Difficulty, string> = {
  easy: 'かんたん',
  normal: 'ふつう',
  hard: 'むずかしい',
  challenge: 'チャレンジ',
};
export const OP_SYMBOL: Record<Op, string> = { add: '+', subtract: '−', multiply: '×', divide: '÷' };
export const OP_LABEL: Record<Op, string> = {
  add: 'たしざん',
  subtract: 'ひきざん',
  multiply: 'かけざん',
  divide: 'わりざん',
};
