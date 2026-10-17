import { describe, expect, it } from 'vitest';
import { keepMath } from './text';

describe('keepMath', () => {
  it('keeps equations on one line but leaves word spaces', () => {
    expect(keepMath('これを かけざんで「2 × 3 = 6」と かくよ。')).toBe('これを かけざんで「2 × 3 = 6」と かくよ。');
    expect(keepMath('10 − 5 を さきに')).toBe('10 − 5 を さきに');
    expect(keepMath('まず 3 + 4 = □')).toBe('まず 3 + 4 = □');
  });
});
