import { describe, expect, it } from 'vitest';
import { appendDigit, keyToDigit, normalizeDigits, parseAnswer } from './input';

describe('input normalisation', () => {
  it('handles full-width digits, spaces, empty and huge values', () => {
    expect(normalizeDigits('１２３')).toBe('123');
    expect(parseAnswer('１２ ３')).toBe(123);
    expect(parseAnswer('')).toBeNull();
    expect(parseAnswer('abc')).toBeNull();
    expect(parseAnswer('-5')).toBeNull();
    expect(parseAnswer('1234567')).toBeNull();
    expect(keyToDigit('７')).toBe('7');
    expect(keyToDigit('a')).toBeNull();
    expect(appendDigit('0', '5')).toBe('5');
    expect(appendDigit('123456', '7')).toBe('123456');
  });
});
