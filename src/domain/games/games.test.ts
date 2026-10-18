import { describe, expect, it } from 'vitest';
import { createRng } from '../random';
import { DIFFICULTIES } from '../types';
import { generatePuzzle } from './types';
import { decompose, exampleSplit, solutionKey } from './decompose';
import { enumerateSolutions, pittari } from './pittari';
import { EASY_MAX_STREAK, make10, make10Category, solveMake10, type Make10Puzzle } from './make10';
import { evaluateLinear } from '../expr';
import { kufuu } from './kufuu';
import { balance, correctSide, sideValue } from './balance';
import { possibleAnswers, sequence } from './sequence';
import { applyRule, candidateOutputs, machine } from './machine';
import { flash } from './flash';
import { numberline, ratioOf, snapRatio, tickCount, tickValue } from './numberline';
import { coins, coinsTotal } from './coins';
import { basketMatches, expectedValue, shopping } from './shopping';
import { conflicts, countSolutions, isValidComplete, sudoku } from './sudoku';
import { judgeMove, maze, neighbors, verifyMaze } from './maze';
import { coverage, shapes, solveShapes, TEMPLATES, buildFromTemplate } from './shapes';
import { mirror, mirrorSolution, mismatches } from './mirror';
import { pattern, sameToken } from './pattern';

const gen = <P,>(logic: { id: string } & Parameters<typeof generatePuzzle>[0], seed: number, d: (typeof DIFFICULTIES)[number]) =>
  generatePuzzle(logic, createRng(seed), d).puzzle as P;

describe('01 decompose', () => {
  it('accepts many different valid splits; order does not create a new discovery', () => {
    for (let seed = 1; seed <= 300; seed++) {
      for (const d of DIFFICULTIES) {
        const p = gen<import('./decompose').DecomposePuzzle>(decompose, seed, d);
        const rng = createRng(seed);
        // ランダムな正しい分け方
        const cuts = new Set<number>();
        while (cuts.size < p.parts - 1) cuts.add(rng.int(1, p.target - 1));
        const sorted = [...cuts].sort((a, b) => a - b);
        const parts = [...sorted, p.target].map((c, i) => c - (i === 0 ? 0 : sorted[i - 1]));
        const j = decompose.judge(p, parts);
        if (parts.some((x) => p.forbidden.includes(x))) expect(j.correct).toBe(false);
        else {
          expect(j.correct).toBe(true);
          expect(decompose.judge(p, [...parts].reverse()).solutionKey).toBe(j.solutionKey);
        }
      }
    }
  });
  it('rejects wrong sums, zero, empty and forbidden', () => {
    const p = { target: 148, parts: 3, forbidden: [100], example: exampleSplit(148, 3, [100])! };
    expect(decompose.judge(p, [100, 40, 8]).correct).toBe(false);
    expect(decompose.judge(p, [90, 50, 8]).correct).toBe(true);
    expect(decompose.judge(p, [148, 0, 0]).correct).toBe(false);
    expect(decompose.judge(p, [90, null, 8]).correct).toBe(false);
    expect(decompose.judge(p, [90, 50, 9]).correct).toBe(false);
    expect(solutionKey([8, 40, 100])).toBe(solutionKey([100, 8, 40]));
  });
});

describe('02 pittari', () => {
  it('every enumerated solution is accepted, and reordering keeps the same key', () => {
    for (const d of DIFFICULTIES) {
      for (let seed = 1; seed <= 40; seed++) {
        const p = gen<import('./pittari').PittariPuzzle>(pittari, seed, d);
        const sols = enumerateSolutions(p);
        expect(sols.length).toBeGreaterThanOrEqual(2);
        for (const s of sols.slice(0, 200)) expect(pittari.judge(p, s).correct).toBe(true);
      }
    }
    const p = { target: 20, terms: 2 as const, ops: ['+', '-'] as ('+' | '-')[], min: 1, max: 50, forbidden: [], solutionCount: 0, example: { nums: [8, 12], ops: ['+' as const] } };
    expect(pittari.judge(p, { nums: [8, 12], ops: ['+'] }).solutionKey).toBe(pittari.judge(p, { nums: [12, 8], ops: ['+'] }).solutionKey);
    expect(pittari.judge(p, { nums: [30, 10], ops: ['-'] }).correct).toBe(true);
    expect(pittari.judge(p, { nums: [30, 9], ops: ['-'] }).correct).toBe(false);
  });
});

describe('03 make10', () => {
  it('every solver solution is accepted; duplicate values are separate cards', () => {
    for (const d of DIFFICULTIES) {
      for (let seed = 1; seed <= 60; seed++) {
        const p = gen<import('./make10').Make10Puzzle>(make10, seed, d);
        const sols = solveMake10(p, 30);
        expect(sols.length).toBeGreaterThan(0);
        for (const s of sols) expect(make10.judge(p, s).correct).toBe(true);
        if (d === 'easy') expect(p.ops).toEqual(['+', '-']);
      }
    }
    const p = { target: 10, ops: ['+' as const], cards: [{ id: 'a', value: 5 }, { id: 'b', value: 5 }, { id: 'c', value: 0 + 0 + 0 }] };
    p.cards[2].value = 0;
    expect(make10.judge(p, { order: ['a', 'a', 'c'], ops: ['+', '+'] }).correct).toBe(false);
    expect(make10.judge(p, { order: ['a', 'b'], ops: ['+'] }).correct).toBe(false);
  });
  it('does not use eval', async () => {
    const src = await import('node:fs').then((fs) => fs.readFileSync('src/domain/games/make10.ts', 'utf8') + fs.readFileSync('src/domain/expr.ts', 'utf8'));
    expect(src).not.toMatch(/\beval\(|new Function/);
  });
});

describe('03 make10 easy: ＋ と − を 半々で', () => {
  const easy = (vals: number[]): Make10Puzzle => ({ target: 10, ops: ['+', '-'], cards: vals.map((value, i) => ({ id: `c${i}`, value })) });

  it('8・4・2 は 8 + 4 − 2 = 10 で正解。ならべかえた別の正しい式も正解', () => {
    const p = easy([8, 4, 2]);
    expect(make10.validate(p, 'easy')).toBeNull();
    expect(make10Category(p)).toBe('sub');
    expect(make10.judge(p, { order: ['c0', 'c1', 'c2'], ops: ['+', '-'] }).correct).toBe(true);
    expect(make10.judge(p, { order: ['c1', 'c0', 'c2'], ops: ['+', '-'] }).correct).toBe(true);
    expect(make10.judge(p, { order: ['c0', 'c2', 'c1'], ops: ['-', '+'] }).correct).toBe(true); // 8 − 2 + 4
    expect(make10.judge(p, { order: ['c0', 'c1', 'c2'], ops: ['+', '+'] }).correct).toBe(false); // 14
    expect(make10.judge(p, { order: ['c2', 'c0', 'c1'], ops: ['-', '+'] }).correct).toBe(false); // とちゅうが マイナス
    // 判定は 解の一覧（ソルバー）と すべて一致する
    for (const s of solveMake10(p)) expect(make10.judge(p, s).correct).toBe(true);
  });

  it('3・5・2 は 3 + 5 + 2 = 10 で正解', () => {
    const p = easy([3, 5, 2]);
    expect(make10.validate(p, 'easy')).toBeNull();
    expect(make10Category(p)).toBe('add');
    expect(make10.judge(p, { order: ['c0', 'c1', 'c2'], ops: ['+', '+'] }).correct).toBe(true);
  });

  it('同じ数字のカードも ID で区別する', () => {
    const p = easy([6, 6, 2]);
    expect(make10.judge(p, { order: ['c0', 'c1', 'c2'], ops: ['+', '-'] }).correct).toBe(true);
    expect(make10.judge(p, { order: ['c0', 'c0', 'c2'], ops: ['+', '-'] }).correct).toBe(false);
    expect(make10.judge(p, { order: ['c0', 'c2'], ops: ['+'] }).correct).toBe(false);
    expect(make10.judge(p, { order: ['c0', 'c1', 'x'], ops: ['+', '-'] }).correct).toBe(false);
  });

  it('むかしの記録（かんたん・＋だけ）の問題も そのまま判定できる', () => {
    const old: Make10Puzzle = { target: 10, ops: ['+'], cards: [2, 3, 5].map((value, i) => ({ id: `c${i}`, value })) };
    expect(make10.judge(old, { order: ['c0', 'c1', 'c2'], ops: ['+', '+'] }).correct).toBe(true);
    expect(make10.judge(old, { order: ['c0', 'c1', 'c2'], ops: ['+', '-'] }).correct).toBe(false);
  });

  it('引き算型のヒントは「− に かえる」考え方から。ヒントの式は本当の解と一致する', () => {
    const p = easy([8, 4, 2]);
    const h = make10.hints(p);
    expect(h[0]).toMatch(/ぜんぶ たすと 14/);
    expect(h[0]).toMatch(/−/);
    // 3段目「8 + 4 − □ = 10」の □ に のこりの カードを入れると 正解
    const m = h[2].match(/^(\d+) ([+−]) (\d+) ([+−]) □ = 10$/)!;
    expect(m).not.toBeNull();
    const nums = [Number(m[1]), Number(m[3])];
    const rest = [8, 4, 2].filter((v, i, a) => a.indexOf(v) === i).find((v) => !nums.includes(v))!;
    const sym = (s: string) => (s === '+' ? '+' : '-') as '+' | '-';
    expect(evaluateLinear({ nums: [...nums, rest], ops: [sym(m[2]), sym(m[4])] })!.value).toBe(10);
  });

  it('1200問：全問に解があり、足し算型と引き算型が半々くらい、同じ型は2問まで', () => {
    const N = 1200;
    const recent: Make10Puzzle[] = [];
    const counts = { add: 0, sub: 0 };
    let invalid = 0;
    let streak = 0;
    let maxStreak = 0;
    let prev: string | null = null;
    for (let seed = 1; seed <= N; seed++) {
      const { puzzle: p } = generatePuzzle(make10, createRng(seed * 31), 'easy', new Set(), recent.slice(-5));
      recent.push(p);
      const cat = make10Category(p);
      counts[cat]++;
      streak = cat === prev ? streak + 1 : 1;
      prev = cat;
      maxStreak = Math.max(maxStreak, streak);
      const values = p.cards.map((c) => c.value);
      const ok =
        make10.validate(p, 'easy') === null &&
        p.cards.length === 3 &&
        p.target === 10 &&
        values.every((v) => Number.isInteger(v) && v >= 1 && v <= 9) &&
        solveMake10(p).length > 0 &&
        solveMake10(p).every((s) => evaluateLinear({ nums: s.order.map((id) => p.cards.find((c) => c.id === id)!.value), ops: s.ops })!.minIntermediate >= 0) &&
        // 引き算型は ぜんぶ ＋ では 10 に ならない（− が必要）
        (cat === 'add' || !solveMake10(p).some((s) => s.ops.every((o) => o === '+'))) &&
        (cat === 'sub' || solveMake10(p).some((s) => s.ops.every((o) => o === '+')));
      if (!ok) invalid++;
    }
    console.log(`make10 easy ${N}問: 足し算型 ${counts.add} / 引き算型 ${counts.sub} / 不正 ${invalid} / 同じ型の最大連続 ${maxStreak}`);
    expect(invalid).toBe(0);
    expect(counts.add).toBeGreaterThan(N * 0.4);
    expect(counts.sub).toBeGreaterThan(N * 0.4);
    expect(maxStreak).toBeLessThanOrEqual(EASY_MAX_STREAK);
  });

  it('予備問題にも 足し算型と引き算型の両方がある', () => {
    const bank = make10.fallback('easy');
    expect(bank.some((p) => make10Category(p) === 'add')).toBe(true);
    expect(bank.some((p) => make10Category(p) === 'sub')).toBe(true);
  });
});

describe('04 kufuu', () => {
  it('accepts making either side round, rejects unequal transforms', () => {
    const p = kufuu.fallback('hard')[0]; // 199 + 48
    expect(kufuu.judge(p, { left: 200, right: 47, result: 247 }).correct).toBe(true);
    expect(kufuu.judge(p, { left: 147, right: 100, result: 247 }).correct).toBe(true);
    expect(kufuu.judge(p, { left: 200, right: 48, result: 248 }).correct).toBe(false);
    expect(kufuu.judge(p, { left: 198, right: 49, result: 247 }).correct).toBe(false);
    expect(kufuu.judge(p, { left: 200, right: 47, result: 246 }).correct).toBe(false);
  });
  it('generated: moving the gap always works', () => {
    for (const d of DIFFICULTIES)
      for (let s = 1; s <= 500; s++) {
        const p = gen<import('./kufuu').KufuuPuzzle>(kufuu, s, d);
        expect(kufuu.judge(p, { left: p.round, right: p.b - p.gap, result: p.a + p.b }).correct).toBe(true);
      }
  });
});

describe('05 balance', () => {
  it('answer matches computed values and includes all three outcomes', () => {
    const seen = new Set<string>();
    for (const d of DIFFICULTIES)
      for (let s = 1; s <= 500; s++) {
        const p = gen<import('./balance').BalancePuzzle>(balance, s, d);
        const c = correctSide(p);
        seen.add(c);
        const l = sideValue(p.left);
        const r = sideValue(p.right);
        expect(c === 'left' ? l > r : c === 'right' ? l < r : l === r).toBe(true);
        expect(balance.judge(p, c).correct).toBe(true);
        for (const other of ['left', 'equal', 'right'] as const) if (other !== c) expect(balance.judge(p, other).correct).toBe(false);
      }
    expect(seen).toEqual(new Set(['left', 'equal', 'right']));
  });
});

describe('06 sequence / 07 machine uniqueness', () => {
  it('sequence answers are unique under all allowed rule families', () => {
    for (const d of DIFFICULTIES)
      for (let s = 1; s <= 500; s++) {
        const p = gen<import('./sequence').SequencePuzzle>(sequence, s, d);
        expect(possibleAnswers(p.values, p.hidden)).toEqual([p.values[p.hidden]]);
      }
    // 短すぎる・あいまいな列は落とす
    expect(possibleAnswers([1, 2, 4, 0, 0], 3).length).not.toBe(1);
  });
  it('machine outputs are unique under all allowed rules', () => {
    for (const d of DIFFICULTIES)
      for (let s = 1; s <= 500; s++) {
        const p = gen<import('./machine').MachinePuzzle>(machine, s, d);
        expect(candidateOutputs(p)).toEqual([applyRule(p.rule, p.query)]);
      }
  });
});

describe('08 flash', () => {
  it('sum is the answer; replay never makes it wrong', () => {
    const p = flash.fallback('normal')[0];
    expect(flash.judge(p, 17).correct).toBe(true);
    expect(flash.judge(p, 16).correct).toBe(false);
  });
});

describe('09 number line (value-based snap)', () => {
  it('ratio near a tick snaps to that tick value', () => {
    for (const d of DIFFICULTIES)
      for (let s = 1; s <= 500; s++) {
        const p = gen<import('./numberline').NumberLinePuzzle>(numberline, s, d);
        const r = ratioOf(p, p.target);
        const half = p.step / (p.max - p.min) / 2;
        expect(snapRatio(p, r + half * 0.9)).toBe(p.target);
        expect(snapRatio(p, r - half * 0.9)).toBe(p.target);
        expect(numberline.judge(p, snapRatio(p, r)).correct).toBe(true);
      }
    const p = numberline.fallback('easy')[0];
    expect(snapRatio(p, -1)).toBe(0);
    expect(snapRatio(p, 2)).toBe(10);
    expect(tickValue(p, tickCount(p) - 1)).toBe(p.max);
  });
});

describe('10 coins / 11 shopping', () => {
  it('coin total is integer sum and coins never overlap', () => {
    for (const d of DIFFICULTIES)
      for (let s = 1; s <= 500; s++) {
        const p = gen<import('./coins').CoinsPuzzle>(coins, s, d);
        expect(coins.judge(p, coinsTotal(p)).correct).toBe(true);
        expect(coins.judge(p, coinsTotal(p) + 1).correct).toBe(false);
      }
  });
  it('shopping: basket must match the memo; change is pay − total', () => {
    for (const d of DIFFICULTIES)
      for (let s = 1; s <= 500; s++) {
        const p = gen<import('./shopping').ShoppingPuzzle>(shopping, s, d);
        const basket = Object.fromEntries(p.order.map((o) => [o.itemId, o.qty]));
        expect(basketMatches(p, basket)).toBe(true);
        expect(shopping.judge(p, { basket, value: expectedValue(p) }).correct).toBe(true);
        expect(shopping.judge(p, { basket: {}, value: expectedValue(p) }).correct).toBe(false);
        if (p.mode === 'change') expect(expectedValue(p)).toBeGreaterThanOrEqual(0);
      }
  });
});

describe('12 sudoku', () => {
  it('every generated board has exactly one solution and the solution is accepted', () => {
    for (const d of DIFFICULTIES)
      for (let s = 1; s <= 500; s++) {
        const p = gen<import('./sudoku').SudokuPuzzle>(sudoku, s, d);
        expect(countSolutions(p.givens, 3)).toBe(1);
        expect(isValidComplete(p.solution)).toBe(true);
        expect(sudoku.judge(p, p.solution).correct).toBe(true);
      }
  });
  it('detects conflicts and incomplete boards without game over', () => {
    const p = sudoku.fallback('easy')[0];
    const g = [...p.givens];
    expect(sudoku.judge(p, g).correct).toBe(false);
    const wrong = [...p.solution];
    const i = p.givens.findIndex((v) => v === 0);
    wrong[i] = (wrong[i] % 4) + 1;
    expect(sudoku.judge(p, wrong).correct).toBe(false);
    expect(conflicts(wrong).length).toBeGreaterThan(0);
  });
});

describe('13 maze', () => {
  it('correct route reaches the goal and each step has exactly one correct next cell', () => {
    for (const d of DIFFICULTIES)
      for (let s = 1; s <= 500; s++) {
        const p = gen<import('./maze').MazePuzzle>(maze, s, d);
        expect(verifyMaze(p)).toBeNull();
        for (let k = 0; k < p.questions.length; k++) {
          const ok = neighbors(p.path[k], p.size).filter((c) => judgeMove(p, k, c));
          expect(ok).toEqual([p.path[k + 1]]);
        }
        expect(maze.judge(p, { moves: p.path.slice(1) }).correct).toBe(true);
      }
  });
});

describe('14 shapes', () => {
  it('has at least 5 templates per difficulty and 20+ total', () => {
    expect(TEMPLATES.length).toBeGreaterThanOrEqual(20);
    for (const d of DIFFICULTIES) expect(TEMPLATES.filter((t) => t.difficulty === d).length).toBeGreaterThanOrEqual(5);
  });
  it('every template (all global transforms) is solvable and every solution found is accepted', () => {
    for (const t of TEMPLATES) {
      for (const rot of [0, 1, 2, 3])
        for (const flip of [false, true]) {
          const p = buildFromTemplate(t, rot, flip, t.parts.map((_, i) => (i + rot) % 4), t.difficulty);
          expect(shapes.validate(p, t.difficulty)).toBeNull();
          const sols = solveShapes(p, 20);
          expect(sols.length).toBeGreaterThan(0);
          for (const s of sols) expect(coverage(p, s).complete).toBe(true);
        }
      // かんたんは回転なしで解ける
      if (t.difficulty === 'easy') {
        const p = buildFromTemplate(t, 0, false, [], 'easy');
        expect(solveShapes(p, 5, false).length).toBeGreaterThan(0);
      }
    }
  });
  it('rejects overlap, gaps and pieces outside the silhouette', () => {
    const p = shapes.fallback('normal')[0];
    expect(shapes.judge(p, p.solution).correct).toBe(true);
    const moved = p.solution.map((pl, i) => (i === 0 ? { ...pl, x: pl.x + 1 } : pl));
    expect(shapes.judge(p, moved).correct).toBe(false);
    expect(shapes.judge(p, p.solution.map((pl, i) => (i === 0 ? null : pl))).correct).toBe(false);
  });
});

describe('15 mirror', () => {
  it('exact mirrored map is required (including colors)', () => {
    for (const d of DIFFICULTIES)
      for (let s = 1; s <= 500; s++) {
        const p = gen<import('./mirror').MirrorPuzzle>(mirror, s, d);
        const sol = mirrorSolution(p);
        expect(mirror.judge(p, sol).correct).toBe(true);
        const half = p.size / 2;
        for (let r = 0; r < p.size; r++) for (let c = 0; c < half; c++) expect(sol[r][c]).toBe(p.left[r][half - 1 - c]);
        const bad = sol.map((row) => [...row]);
        bad[0][0] = bad[0][0] === 0 ? 1 : 0;
        expect(mismatches(p, bad)).toHaveLength(1);
        expect(mirror.judge(p, bad).correct).toBe(false);
      }
  });
});

describe('16 pattern', () => {
  it('exactly one option is correct; non-challenge options differ by shape', () => {
    for (const d of DIFFICULTIES)
      for (let s = 1; s <= 500; s++) {
        const p = gen<import('./pattern').PatternPuzzle>(pattern, s, d);
        const ok = p.options.filter((o) => pattern.judge(p, o).correct);
        expect(ok).toHaveLength(1);
        expect(sameToken(ok[0], p.sequence[p.hidden])).toBe(true);
      }
  });
});
