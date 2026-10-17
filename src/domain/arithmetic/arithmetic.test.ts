import { describe, expect, it } from 'vitest';
import { createRng } from '../random';
import type { Op } from '../types';
import { explain } from './explain';
import { generateProblem, generateProblemSet, hasBorrowSub, hasCarryAdd, validateProblem, type ArithSettings, type Carry, type Digits } from './problems';

const base: ArithSettings = { ops: ['add'], digits: 1, carry: 'mixed', mul: 'kuku', div: 'kuku' };

describe('carry helpers', () => {
  it('detects carries and borrows by column', () => {
    expect(hasCarryAdd(7, 5)).toBe(true);
    expect(hasCarryAdd(23, 45)).toBe(false);
    expect(hasCarryAdd(150, 148)).toBe(false);
    expect(hasCarryAdd(155, 148)).toBe(true);
    expect(hasBorrowSub(13, 5)).toBe(true);
    expect(hasBorrowSub(58, 23)).toBe(false);
    expect(hasBorrowSub(300, 1)).toBe(true);
  });
});

describe('add/subtract generation honours digits and carry settings', () => {
  const ops: Op[] = ['add', 'subtract'];
  const digits: Digits[] = [1, 2, 3];
  const carries: Carry[] = ['none', 'with', 'mixed'];
  for (const op of ops)
    for (const dg of digits)
      for (const c of carries)
        it(`${op} d${dg} ${c}`, () => {
          const s = { ...base, ops: [op], digits: dg, carry: c };
          let withCarry = 0;
          for (let seed = 1; seed <= 500; seed++) {
            const p = generateProblem(createRng(seed), op, s);
            expect(validateProblem(p, s)).toBeNull();
            expect(p.answer).toBeGreaterThanOrEqual(0);
            if (c === 'none') expect(p.carry).toBe(false);
            if (c === 'with') expect(p.carry).toBe(true);
            if (p.carry) withCarry++;
            if (op === 'subtract') expect(p.a).toBeGreaterThanOrEqual(p.b);
            const ex = explain(p);
            expect(ex.length).toBeGreaterThan(0);
          }
          if (c === 'mixed') {
            expect(withCarry).toBeGreaterThan(100);
            expect(withCarry).toBeLessThan(400);
          }
        });
});

describe('multiply/divide', () => {
  it.each(['kuku', '2x1'] as const)('multiply %s', (mul) => {
    const s = { ...base, ops: ['multiply' as Op], mul };
    for (let seed = 1; seed <= 500; seed++) {
      const p = generateProblem(createRng(seed), 'multiply', s);
      expect(validateProblem(p, s)).toBeNull();
      expect(p.a * p.b).toBe(p.answer);
      explain(p);
    }
  });
  it.each(['kuku', '2digit'] as const)('divide %s: no zero division, integer quotient', (div) => {
    const s = { ...base, ops: ['divide' as Op], div };
    for (let seed = 1; seed <= 500; seed++) {
      const p = generateProblem(createRng(seed), 'divide', s);
      expect(p.b).not.toBe(0);
      expect(p.a % p.b).toBe(0);
      expect(p.a / p.b).toBe(p.answer);
      expect(validateProblem(p, s)).toBeNull();
      explain(p);
    }
  });
});

describe('problem sets', () => {
  it('distributes ops evenly and avoids repeats within 20', () => {
    const s: ArithSettings = { ...base, ops: ['add', 'subtract', 'multiply', 'divide'], digits: 2 };
    const set = generateProblemSet(createRng(9), s, 20);
    for (const op of s.ops) expect(set.filter((p) => p.op === op)).toHaveLength(5);
    expect(new Set(set.map((p) => p.key)).size).toBe(20);
  });
  it('small pools still produce valid problems (fallback)', () => {
    const s: ArithSettings = { ...base, ops: ['add'], digits: 1, carry: 'none' };
    const set = generateProblemSet(createRng(1), s, 60);
    for (const p of set) expect(validateProblem(p, s)).toBeNull();
  });
});
