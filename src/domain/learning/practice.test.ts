import { describe, expect, it } from 'vitest';
import { createRng } from '../random';
import { divPractice, judgeDiv, judgeMul, mulPractice, sharedEqually } from './practice';

describe('learning practice', () => {
  it('multiplication questions are consistent', () => {
    for (let s = 1; s <= 500; s++) {
      const p = mulPractice(createRng(s));
      if (p.kind === 'count') expect(judgeMul(p, p.per * p.groups)).toBe(true);
      else {
        expect(p.options.filter((o) => o === p.answer)).toHaveLength(1);
        expect(new Set(p.options).size).toBe(p.options.length);
      }
    }
  });
  it('division questions divide exactly', () => {
    for (let s = 1; s <= 500; s++) {
      const p = divPractice(createRng(s));
      if (p.kind === 'share') expect(p.total % p.people).toBe(0);
      if (p.kind === 'group') expect(p.total / p.size).toBe(p.answer);
      expect(judgeDiv(p, p.answer)).toBe(true);
    }
  });
  it('detects equal sharing', () => {
    expect(sharedEqually([5, 5], 10)).toBe(true);
    expect(sharedEqually([6, 4], 10)).toBe(false);
    expect(sharedEqually([4, 4], 10)).toBe(false);
  });
});
