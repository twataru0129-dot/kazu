import { describe, expect, it } from 'vitest';
import { createRng } from '../random';
import { DIFFICULTIES } from '../types';
import { GAMES } from './registry';
import { generatePuzzle } from './types';

const CASES = 500;

/** 全ゲーム × 全難易度 × 500 シード：生成した問題が検証を通り、ヒントが作れ、キーが安定している */
describe.each(GAMES.map((g) => [g.no, g] as const))('game %s generation', (_no, game) => {
  it.each(DIFFICULTIES)('%s: 500 seeded puzzles are valid', (d) => {
    let fallbackCount = 0;
    for (let seed = 1; seed <= CASES; seed++) {
      const { puzzle, fromFallback } = generatePuzzle(game.logic, createRng(seed * 7919 + d.length), d);
      if (fromFallback) fallbackCount++;
      const reason = game.logic.validate(puzzle, d);
      if (reason !== null) throw new Error(`${game.id}/${d} seed=${seed}: ${reason}\n${JSON.stringify(puzzle)}`);
      const hints = game.logic.hints(puzzle);
      expect(hints).toHaveLength(3);
      hints.forEach((h: string) => expect(h.length).toBeGreaterThan(0));
      expect(game.logic.key(puzzle)).toBe(game.logic.key(JSON.parse(JSON.stringify(puzzle))));
    }
    // 予備問題に頼りすぎていない（生成器が実際に働いている）
    expect(fallbackCount).toBeLessThan(CASES * 0.05);
  });

  it.each(DIFFICULTIES)('%s: fallback bank is valid', (d) => {
    const bank = game.logic.fallback(d);
    expect(bank.length).toBeGreaterThan(0);
    for (const p of bank) expect(game.logic.validate(p, d), JSON.stringify(p)).toBeNull();
  });

  it('same seed gives the same puzzle', () => {
    const a = generatePuzzle(game.logic, createRng(42), 'normal').puzzle;
    const b = generatePuzzle(game.logic, createRng(42), 'normal').puzzle;
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});
