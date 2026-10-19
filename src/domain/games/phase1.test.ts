import { describe, expect, it } from 'vitest';
import { createRng } from '../random';
import { DIFFICULTIES } from '../types';
import { generatePuzzle } from './types';
import { equationText, fill, holds, isDigitPuzzle, missing, missingSolution, solutions, type MissingPuzzle } from './missing';
import { emptyTriangleBoard, nextTriState, tapsNeeded, triangle, triangleMismatches, TRI_STATES, type TrianglePuzzle } from './triangle';
import { GAMES } from './registry';
import { isCountedRoute, isPlayStartRoute } from '../parental/playtime';
import { dots, dotsDiff, segSet, sortSegs, splitSeg, toggleLine, type DotsPuzzle, type Seg } from './dots';

const gen = <P,>(logic: Parameters<typeof generatePuzzle>[0], seed: number, d: (typeof DIFFICULTIES)[number]) => generatePuzzle(logic, createRng(seed), d).puzzle as P;

describe('17 missing-number', () => {
  it('every generated puzzle has exactly one answer, the stored one, and the equation really holds', () => {
    for (const d of DIFFICULTIES)
      for (let s = 1; s <= 500; s++) {
        const p = gen<MissingPuzzle>(missing, s, d);
        expect(holds(p.op, p.a, p.b, p.c)).toBe(true);
        const sols = solutions(p, 3);
        expect(sols, equationText(p)).toEqual([missingSolution(p)]);
        expect(missing.judge(p, missingSolution(p)).correct).toBe(true);
        // ほかの値は すべて まちがい（1つずらして確かめる）
        const wrong = missingSolution(p).map((v, i) => (i === 0 ? (v + 1) % (p.blanks[0].digit === undefined ? 1000 : 10) : v));
        expect(missing.judge(p, wrong).correct).toBe(false);
      }
  });

  it('levels use the promised operations and blank shapes', () => {
    const seen = new Set<string>();
    for (const d of DIFFICULTIES)
      for (let s = 1; s <= 500; s++) {
        const p = gen<MissingPuzzle>(missing, s, d);
        seen.add(`${d}:${p.op}:${isDigitPuzzle(p) ? 'digit' : 'whole'}`);
        if (d === 'easy') expect(p.op).toBe('add');
        if (d !== 'challenge') expect(p.blanks).toHaveLength(1);
        expect(Math.max(p.a, p.b, p.c)).toBeLessThanOrEqual({ easy: 10, normal: 20, hard: 100, challenge: 199 }[d]);
      }
    for (const k of ['normal:subtract:whole', 'hard:multiply:whole', 'challenge:divide:whole', 'challenge:add:digit', 'challenge:subtract:digit']) expect(seen).toContain(k);
  });

  it('rejects empty, partial and out-of-range input; ambiguous puzzles fail validation', () => {
    const p: MissingPuzzle = { a: 4, b: 3, c: 7, op: 'add', blanks: [{ term: 1 }] };
    expect(missing.validate(p, 'easy')).toBeNull();
    expect(missing.judge(p, [null]).correct).toBe(false);
    expect(missing.judge(p, []).correct).toBe(false);
    expect(missing.judge(p, [3]).correct).toBe(true);
    expect(missing.judge(p, [4]).message).toContain('4 + 4 は 7 に ならない');
    const two: MissingPuzzle = { a: 45, b: 36, c: 81, op: 'add', blanks: [{ term: 0, digit: 1 }, { term: 1, digit: 0 }] };
    expect(missing.validate(two, 'challenge')).toBeNull();
    expect(missing.judge(two, [5, null]).correct).toBe(false);
    expect(missing.judge(two, [5, 12]).correct).toBe(false); // 1けたで ない
    expect(missing.judge(two, [5, 3]).correct).toBe(true);
    expect(fill(two, [5, 3])).toEqual([45, 36, 81]);
    // 一の位どうしは くりあがりの有無で決まらない → 2通りある
    const amb: MissingPuzzle = { a: 45, b: 36, c: 81, op: 'add', blanks: [{ term: 0, digit: 1 }, { term: 2, digit: 1 }] };
    expect(missing.validate(amb, 'challenge')).toMatch(/not unique/);
    // 0 × □ は どんな かずでも なりたつ
    expect(missing.validate({ a: 0, b: 5, c: 0, op: 'multiply', blanks: [{ term: 1 }] }, 'hard')).not.toBeNull();
  });
});

describe('18 triangle-pattern', () => {
  it('a tap cycles blank → top-left → top-right → bottom-right → bottom-left → full → blank', () => {
    const seq = [0];
    for (let i = 0; i < TRI_STATES; i++) seq.push(nextTriState(seq.at(-1)!));
    expect(seq).toEqual([0, 1, 2, 3, 4, 5, 0]);
    for (let a = 0; a < TRI_STATES; a++)
      for (let b = 0; b < TRI_STATES; b++) {
        let v = a;
        for (let k = 0; k < tapsNeeded(a, b); k++) v = nextTriState(v);
        expect(v).toBe(b);
      }
  });

  it('only an exact copy of every cell is correct', () => {
    for (const d of DIFFICULTIES)
      for (let s = 1; s <= 500; s++) {
        const p = gen<TrianglePuzzle>(triangle, s, d);
        expect(p.size).toBe({ easy: 2, normal: 3, hard: 4, challenge: 5 }[d]);
        expect(triangle.judge(p, p.target.map((r) => [...r])).correct).toBe(true);
        expect(triangle.judge(p, emptyTriangleBoard(p.size)).correct).toBe(false);
        const r = s % p.size;
        const c = (s * 7) % p.size;
        const bad = p.target.map((row) => [...row]);
        bad[r][c] = nextTriState(bad[r][c]);
        expect(triangleMismatches(p, bad)).toEqual([[r, c]]);
        expect(triangle.judge(p, bad).correct).toBe(false);
      }
  });

  it('hint points at the first different cell and how many taps it needs', () => {
    const p: TrianglePuzzle = { size: 2, target: [[1, 0], [0, 5]] };
    const h = triangle.hints(p, [[1, 0], [0, 3]]);
    expect(h[0]).toContain('うえから 2ばんめ、ひだりから 2ばんめ');
    expect(h[1]).toContain('ぜんぶ ぬる');
    expect(h[2]).toContain('あと 2かい');
  });
});

describe('19 dot-connect', () => {
  it('judging ignores drawing order, direction and how lines are split', () => {
    for (const d of DIFFICULTIES)
      for (let s = 1; s <= 500; s++) {
        const p = gen<DotsPuzzle>(dots, s, d);
        const rng = createRng(s);
        const shuffled = rng.shuffle(p.segments).map((x) => (rng.chance(0.5) ? ([x[2], x[3], x[0], x[1]] as Seg) : x));
        expect(dots.judge(p, shuffled).correct).toBe(true);
        // 重ねて同じ線を書いても同じ図形
        expect(dots.judge(p, [...shuffled, shuffled[0]]).correct).toBe(true);
        // 1本たりない・1本よけい は まちがい
        expect(dots.judge(p, shuffled.slice(1)).correct).toBe(false);
      }
  });

  it('a long straight line equals its unit pieces', () => {
    expect(splitSeg([0, 0, 2, 2])).toEqual([
      [0, 0, 1, 1],
      [1, 1, 2, 2],
    ]);
    expect(sortSegs(splitSeg([2, 0, 0, 0]))).toEqual([
      [0, 0, 1, 0],
      [1, 0, 2, 0],
    ]);
    expect(splitSeg([0, 0, 1, 2])).toEqual([[0, 0, 1, 2]]);
    expect(splitSeg([1, 1, 1, 1])).toEqual([]);
    const p: DotsPuzzle = { size: 3, segments: sortSegs([[0, 0, 2, 0], [2, 0, 2, 2], [2, 2, 0, 2], [0, 2, 0, 0]]) };
    expect(dots.validate(p, 'easy')).toBeNull();
    expect(dots.judge(p, [[0, 0, 2, 0], [2, 2, 2, 0], [0, 2, 2, 2], [0, 0, 0, 2]]).correct).toBe(true);
    expect(dots.judge(p, sortSegs(p.segments)).correct).toBe(true);
    const diff = dotsDiff(p, [[0, 0, 2, 0], [0, 0, 1, 1]]);
    expect(diff.missing).toHaveLength(6);
    expect(diff.extra).toEqual([[0, 0, 1, 1]]);
  });

  it('drawing the same line twice erases it instead of stacking a duplicate', () => {
    let cur: Seg[] = [];
    cur = toggleLine(cur, [0, 0, 2, 0]);
    expect(segSet(cur).size).toBe(2);
    cur = toggleLine(cur, [1, 0, 0, 0]); // 一部だけ同じ → けす（全部ひいてある線）
    expect(segSet(cur).size).toBe(1);
    cur = toggleLine(cur, [0, 0, 2, 0]); // たりない部分だけ たす
    expect(segSet(cur).size).toBe(2);
    cur = toggleLine(cur, [2, 0, 0, 0]);
    expect(cur).toEqual([]);
    expect(toggleLine(cur, [1, 1, 1, 1])).toEqual([]);
  });

  it('easy shapes are closed; harder levels are bigger', () => {
    for (const d of DIFFICULTIES)
      for (let s = 1; s <= 200; s++) {
        const p = gen<DotsPuzzle>(dots, s, d);
        expect(p.size).toBe({ easy: 3, normal: 4, hard: 5, challenge: 6 }[d]);
        expect(dots.validate(p, d)).toBeNull();
      }
  });
});

describe('registry and parental limit', () => {
  it('lists the games with unique ids and consecutive numbers; every game route is counted by the time limit', () => {
    expect(GAMES.length).toBeGreaterThanOrEqual(19);
    expect(new Set(GAMES.map((g) => g.id)).size).toBe(GAMES.length);
    expect(GAMES.map((g) => g.no)).toEqual(Array.from({ length: GAMES.length }, (_, i) => String(i + 1).padStart(2, '0')));
    for (const g of GAMES) {
      expect(isCountedRoute(`/play/${g.id}`)).toBe(true);
      expect(isPlayStartRoute(`/play/${g.id}`)).toBe(true);
    }
  });
});
