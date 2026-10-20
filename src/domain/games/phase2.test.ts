import { describe, expect, it } from 'vitest';
import { createRng } from '../random';
import { DIFFICULTIES } from '../types';
import { generatePuzzle } from './types';
import { CATEGORY_LABEL, GAMES, GAME_BY_ID } from './registry';
import { emptyCells, RULES, SYMBOL_NAME, symbolMemory, symbolMismatches, type Cell, type SymbolMemoryPuzzle } from './symbolMemory';
import { cluesOf, countSolutions, lineClue, lineSolvable, solveLine } from './nonogramSolver';
import { NONOGRAM_TEMPLATES } from './nonogramTemplates';
import { blackOf, buildNonogram, emptyNonogram, NONO_SIZE, nonogram, nextDeduction, type NonoCell, type NonogramPuzzle } from './nonogram';
import { checkInput, LIGHT_ROUNDS, LIGHT_RULES, lightSequence, playbackSchedule, roundLength, roundSequence, type LightSequencePuzzle } from './lightSequence';

const gen = <P,>(logic: Parameters<typeof generatePuzzle>[0], seed: number, d: (typeof DIFFICULTIES)[number]) => generatePuzzle(logic, createRng(seed), d).puzzle as P;

describe('20 symbol-memory', () => {
  it('levels follow the table (grid, kinds, filled cells, preview time)', () => {
    for (const d of DIFFICULTIES)
      for (let s = 1; s <= 500; s++) {
        const p = gen<SymbolMemoryPuzzle>(symbolMemory, s, d);
        const r = RULES[d];
        expect(p.size).toBe(r.size);
        expect(p.symbols.length).toBeGreaterThanOrEqual(r.kinds[0]);
        expect(p.symbols.length).toBeLessThanOrEqual(r.kinds[1]);
        const filled = p.cells.filter((c) => c !== null).length;
        expect(filled).toBeGreaterThanOrEqual(r.filled[0]);
        expect(filled).toBeLessThanOrEqual(r.filled[1]);
        expect(p.showMs).toBe({ easy: null, normal: null, hard: 8000, challenge: 6000 }[d]);
        for (const sym of p.symbols) expect(p.cells).toContain(sym); // パレットの記号は どれも使われる
      }
  });

  it('only an exact copy (blanks included) is correct', () => {
    for (const d of DIFFICULTIES)
      for (let s = 1; s <= 300; s++) {
        const p = gen<SymbolMemoryPuzzle>(symbolMemory, s, d);
        expect(symbolMemory.judge(p, { cells: [...p.cells], reshows: 0 }).correct).toBe(true);
        expect(symbolMemory.judge(p, { cells: emptyCells(p), reshows: 0 }).correct).toBe(false);
        // 空白のマスに 記号を足すと まちがい
        const blank = p.cells.indexOf(null);
        const extra: Cell[] = [...p.cells];
        extra[blank] = p.symbols[0];
        expect(symbolMismatches(p, extra)).toEqual([blank]);
        expect(symbolMemory.judge(p, { cells: extra, reshows: 0 }).correct).toBe(false);
        // 記号を べつの記号に すると まちがい
        const i = p.cells.findIndex((c) => c !== null);
        const swapped: Cell[] = [...p.cells];
        swapped[i] = p.symbols.find((x) => x !== p.cells[i]) ?? null;
        expect(symbolMemory.judge(p, { cells: swapped, reshows: 2 }).correct).toBe(false);
        // もういちど みた回数は 正誤に 関係しない（記録として のこる）
        expect(symbolMemory.judge(p, { cells: [...p.cells], reshows: 3 }).correct).toBe(true);
      }
  });

  it('hints point at a cell but never say which symbol goes there', () => {
    for (let s = 1; s <= 200; s++) {
      const p = gen<SymbolMemoryPuzzle>(symbolMemory, s, 'challenge');
      const h = symbolMemory.hints(p, emptyCells(p));
      for (const name of Object.values(SYMBOL_NAME)) for (const line of h) expect(line).not.toContain(name);
      expect(h[2]).toMatch(/うえから \d+ばんめ、ひだりから \d+ばんめ/);
    }
  });
});

describe('21 nonogram', () => {
  it('clues: runs of black, empty line = []', () => {
    expect(lineClue([0, 1, 1, 0, 1])).toEqual([2, 1]);
    expect(lineClue([0, 0, 0])).toEqual([]);
    expect(lineClue([1, 1, 1])).toEqual([3]);
    const { rows, cols } = cluesOf([
      [1, 0, 0],
      [0, 0, 0],
      [1, 1, 0],
    ]);
    expect(rows).toEqual([[1], [], [2]]);
    expect(cols).toEqual([[1, 1], [1], []]);
  });

  it('line solver agrees with brute force on random lines', () => {
    const rng = createRng(7);
    for (let t = 0; t < 400; t++) {
      const n = rng.int(1, 9);
      const truth = Array.from({ length: n }, () => (rng.chance(0.5) ? 1 : 0));
      const clue = lineClue(truth);
      const cur = truth.map((v) => (rng.chance(0.3) ? v : -1));
      // 全部の置き方を数えて、どの置き方でも同じマスを求める
      const all: number[][] = [];
      for (let m = 0; m < 1 << n; m++) {
        const line = Array.from({ length: n }, (_, i) => (m >> i) & 1);
        if (lineClue(line).join() === clue.join() && line.every((v, i) => cur[i] === -1 || cur[i] === v)) all.push(line);
      }
      const expected = cur.map((v, i) => (v !== -1 ? v : all.every((l) => l[i] === 1) ? 1 : all.every((l) => l[i] === 0) ? 0 : -1));
      expect(solveLine(clue, cur)).toEqual(expected);
    }
    expect(solveLine([3], [-1, 0, -1, -1])).toBeNull(); // 3つ ならべる場所がない
  });

  it('rejects puzzles with two answers or none', () => {
    // 2×2 の ななめ：行も列も [1] → 答えが 2つ
    expect(countSolutions([[1], [1]], [[1], [1]]).count).toBe(2);
    // 矛盾：行は 2マス黒なのに 列は 黒なし
    expect(countSolutions([[2], []], [[], []]).count).toBe(0);
    const amb: NonogramPuzzle = { size: 5, templateId: 'x', name: 'x', flipped: false, solution: ['#....', '.#...', '..###', '..###', '..###'], rows: [], cols: [] };
    const c = cluesOf(amb.solution.map((r) => [...r].map((ch) => (ch === '#' ? 1 : 0))));
    expect(nonogram.validate({ ...amb, ...c }, 'easy')).toMatch(/not unique/);
  });

  it('every template (and its mirror image) has exactly one answer, fast; easy/normal need no guessing', () => {
    for (const d of DIFFICULTIES) {
      NONOGRAM_TEMPLATES[d].forEach((t, i) => {
        for (const flipped of [false, true]) {
          const p = buildNonogram(d, i, flipped);
          const t0 = performance.now();
          expect(nonogram.validate(p, d), `${d}/${t.id}${flipped ? '/f' : ''}`).toBeNull();
          expect(performance.now() - t0).toBeLessThan(200);
          expect(p.size).toBe(NONO_SIZE[d]);
          if (d === 'easy') expect(Math.max(...p.rows.map((x) => x.length), ...p.cols.map((x) => x.length))).toBeLessThanOrEqual(2);
          if (d === 'easy' || d === 'normal') expect(lineSolvable(p.rows, p.cols)).toBe(true);
        }
      });
      expect(new Set(NONOGRAM_TEMPLATES[d].map((t) => t.id)).size).toBe(NONOGRAM_TEMPLATES[d].length);
      expect(NONOGRAM_TEMPLATES[d].length).toBeGreaterThanOrEqual(6);
    }
  });

  it('judge: only the black cells count; × and blank both mean "not black"', () => {
    for (const d of DIFFICULTIES)
      for (let s = 1; s <= 40; s++) {
        const p = gen<NonogramPuzzle>(nonogram, s, d);
        const sol: NonoCell[][] = p.solution.map((r) => [...r].map((ch) => (ch === '#' ? 1 : 0)));
        expect(nonogram.judge(p, sol).correct).toBe(true);
        // 白のマスを ×に しても しなくても 正解
        const withX = sol.map((r) => r.map((v) => (v === 1 ? 1 : 2))) as NonoCell[][];
        expect(nonogram.judge(p, withX).correct).toBe(true);
        expect(blackOf(withX)).toEqual(blackOf(sol));
        // 黒を1つ ×に すると まちがい
        const bad = sol.map((r) => [...r]);
        const r0 = bad.findIndex((r) => r.includes(1));
        bad[r0][bad[r0].indexOf(1)] = 2;
        expect(nonogram.judge(p, bad).correct).toBe(false);
        expect(nonogram.judge(p, emptyNonogram(p.size)).correct).toBe(false);
      }
  });

  it('hints give one deducible cell at a time, never the whole picture', () => {
    const p = buildNonogram('normal', 0, false);
    let a = emptyNonogram(p.size);
    let steps = 0;
    // ヒント3の マスだけを 1つずつ うめていくと、さいごまで 解ける（推理で 決まる マスしか 出さない）
    for (;;) {
      const nx = nextDeduction(p, a);
      if (!nx) break;
      expect(p.solution[nx.cell[0]][nx.cell[1]] === '#').toBe(nx.black);
      a = a.map((row, r) => row.map((v, c) => (r === nx.cell[0] && c === nx.cell[1] ? (nx.black ? 1 : 2) : v))) as NonoCell[][];
      steps++;
    }
    expect(steps).toBe(p.size * p.size);
    expect(nonogram.judge(p, a).correct).toBe(true);
    // まちがって ぬった マスが あれば、そちらを先に 知らせる
    const wrong = emptyNonogram(p.size);
    const wr = p.solution.findIndex((r) => r.includes('.'));
    wrong[wr][p.solution[wr].indexOf('.')] = 1;
    expect(nonogram.hints(p, wrong)[1]).toContain(`うえから ${wr + 1}ばんめ`);
  });
});

describe('22 light-sequence', () => {
  const V1: LightSequencePuzzle = { buttons: 4, startLen: 2, sequence: [0, 2, 1, 3, 0, 2], onMs: 1000, gapMs: 300 };

  it('4 levels × 500 seeds: valid v2 puzzles, 5 independent rounds with the promised lengths', () => {
    let sharedHead = 0;
    let total = 0;
    for (const d of DIFFICULTIES)
      for (let s = 1; s <= 500; s++) {
        const res = generatePuzzle(lightSequence, createRng(s), d);
        expect(res.fromFallback).toBe(false);
        const p = res.puzzle as LightSequencePuzzle;
        const r = LIGHT_RULES[d];
        expect(lightSequence.validate(p, d)).toBeNull();
        expect(p.sequence).toBeUndefined();
        expect(p.buttons).toBe(r.buttons);
        expect(p.rounds).toHaveLength(LIGHT_ROUNDS);
        for (let k = 0; k < LIGHT_ROUNDS; k++) {
          const cur = roundSequence(p, k);
          expect(cur).toHaveLength(r.startLen + k);
          expect(roundLength(p, k)).toBe(r.startLen + k);
          expect(cur.every((b) => b >= 0 && b < r.buttons)).toBe(true);
          if (!r.allowRepeat) for (let i = 1; i < cur.length; i++) expect(cur[i]).not.toBe(cur[i - 1]);
          for (let i = 2; i < cur.length; i++) expect(cur[i] === cur[i - 1] && cur[i] === cur[i - 2]).toBe(false);
          if (k > 0) {
            const prev = roundSequence(p, k - 1);
            // まえのラウンド ＋ 1こ ではない
            expect(cur.slice(0, prev.length)).not.toEqual(prev);
            for (let j = 0; j < k; j++) {
              total++;
              if (cur[0] === p.rounds![j][0] && cur[1] === p.rounds![j][1]) sharedHead++;
            }
          }
        }
      }
    // 先頭の 2こも ほとんど それまでの ラウンドと ちがう
    expect(sharedHead / total).toBeLessThan(0.01);
    // むずかしい以上では 同じボタンが つづく 出題も ある
    let repeats = 0;
    for (let s = 1; s <= 200; s++) {
      const p = gen<LightSequencePuzzle>(lightSequence, s, 'hard');
      if (p.rounds!.some((seq) => seq.some((b, i) => i > 0 && b === seq[i - 1]))) repeats++;
    }
    expect(repeats).toBeGreaterThan(0);
  });

  it('the same seed gives the same 5 rounds; different seeds differ', () => {
    for (const d of DIFFICULTIES)
      for (let s = 1; s <= 50; s++) {
        const a = gen<LightSequencePuzzle>(lightSequence, s, d);
        const b = gen<LightSequencePuzzle>(lightSequence, s, d);
        expect(b.rounds).toEqual(a.rounds);
        expect(lightSequence.key(b)).toBe(lightSequence.key(a));
      }
    const keys = new Set(Array.from({ length: 50 }, (_, s) => lightSequence.key(gen<LightSequencePuzzle>(lightSequence, s + 1, 'normal'))));
    expect(keys.size).toBeGreaterThan(45);
  });

  it('validate rejects a round that is just the previous round plus one, and v1 puzzles for new play', () => {
    const p = gen<LightSequencePuzzle>(lightSequence, 4, 'easy');
    const grown = { ...p, rounds: p.rounds!.map((x) => [...x]) };
    const used = new Set(grown.rounds[0]);
    grown.rounds[1] = [...grown.rounds[0], [0, 1, 2, 3].find((b) => !used.has(b))!];
    expect(lightSequence.validate(grown, 'easy')).toMatch(/round 2: extends previous round/);
    const short = { ...p, rounds: p.rounds!.slice(0, 4) };
    expect(lightSequence.validate(short, 'easy')).toBe('rounds');
    expect(lightSequence.validate(V1, 'easy')).toBe('rounds');
    expect(lightSequence.generatorVersion).toBe(2);
  });

  it('input check and playback use each round its own order', () => {
    const p: LightSequencePuzzle = { buttons: 4, startLen: 2, rounds: [[0, 2], [3, 1, 0], [1, 3, 2, 0], [2, 0, 3, 1, 2], [3, 0, 1, 2, 3, 1]], onMs: 1000, gapMs: 300 };
    expect(lightSequence.validate(p, 'easy')).toBeNull();
    expect(checkInput(p, 0, [0])).toBe('ok');
    expect(checkInput(p, 0, [0, 2])).toBe('done');
    expect(checkInput(p, 0, [2])).toBe('wrong');
    // まえのラウンドの順番で おしても まちがい
    expect(checkInput(p, 1, [0, 2])).toBe('wrong');
    expect(checkInput(p, 1, [3, 1])).toBe('ok');
    expect(checkInput(p, 1, [3, 1, 0])).toBe('done');
    expect(checkInput(p, 1, [3, 1, 0, 2])).toBe('wrong');
    for (let k = 0; k < LIGHT_ROUNDS; k++) {
      const sched = playbackSchedule(p, k);
      expect(sched.map((x) => x.button)).toEqual(p.rounds![k]);
      for (let i = 1; i < sched.length; i++) expect(sched[i].at - sched[i - 1].at).toBe(p.onMs + p.gapMs);
    }
    // 何回 よんでも 同じ（見なおし・やりなおしで かわらない）
    expect(playbackSchedule(p, 2)).toEqual(playbackSchedule(p, 2));
    expect(roundSequence(p, 2)).toEqual([1, 3, 2, 0]);
  });

  it('judge needs all 5 rounds in order; per-round records ride along', () => {
    const p = gen<LightSequencePuzzle>(lightSequence, 3, 'normal');
    const inputs = Array.from({ length: LIGHT_ROUNDS }, (_, k) => roundSequence(p, k));
    const rounds = inputs.map((x) => ({ length: x.length, views: 1, retries: 0, cleared: true }));
    expect(lightSequence.judge(p, { inputs, rounds, best: inputs.at(-1)!.length }).correct).toBe(true);
    expect(lightSequence.judge(p, { inputs: inputs.slice(0, 4), rounds, best: 6 }).correct).toBe(false); // 4ラウンドだけ
    const wrong = inputs.map((x) => [...x]);
    wrong[2][1] = (wrong[2][1] + 1) % p.buttons;
    expect(lightSequence.judge(p, { inputs: wrong, rounds, best: 5 }).correct).toBe(false);
    // まえのラウンドに 1こ 足した順番（むかしの きまり）では 正解に ならない
    const grown = inputs.map((x, k) => (k === 0 ? x : [...inputs[k - 1], x.at(-1)!]));
    expect(lightSequence.judge(p, { inputs: grown, rounds, best: 7 }).correct).toBe(false);
  });

  it('hints: say it aloud, it is a new order every round, then the next button only', () => {
    const p = gen<LightSequencePuzzle>(lightSequence, 9, 'challenge');
    const seq = roundSequence(p, 1);
    const h = lightSequence.hints(p, { round: 1, input: [seq[0], seq[1]] });
    expect(h[0]).toBe('ひかった ボタンの マークを こえに だして おぼえよう');
    expect(h[1]).toBe('まえとは ちがう じゅんばんだよ。はじめから おぼえよう');
    expect(h[2]).toBe('3ばんめに おす ボタンが ひかるよ');
    expect(h.join('')).not.toMatch(/ふえる|おなじ じゅんばん/);
  });

  it('v1 puzzles (one shared sequence) still play: prefix rounds, judge, key', () => {
    expect(roundSequence(V1, 0)).toEqual([0, 2]);
    expect(roundSequence(V1, 4)).toEqual([0, 2, 1, 3, 0, 2]);
    expect(checkInput(V1, 2, [0, 2, 1, 3])).toBe('done');
    expect(playbackSchedule(V1, 1).map((x) => x.button)).toEqual([0, 2, 1]);
    const inputs = Array.from({ length: LIGHT_ROUNDS }, (_, k) => roundSequence(V1, k));
    expect(lightSequence.judge(V1, { inputs, rounds: [], best: 6 }).correct).toBe(true);
    expect(lightSequence.judge(V1, { inputs: inputs.slice(0, 3), rounds: [], best: 4 }).message).toBe('4こ まで できたよ');
    expect(lightSequence.key(V1)).toBe('4:021302');
    expect(lightSequence.hints(V1, { round: 2, input: [0] })[2]).toBe('2ばんめに おす ボタンが ひかるよ');
  });
});

describe('registry: 22 games and the memory category', () => {
  it('20〜22 are registered with stable ids; memory category holds 20 and 22', () => {
    expect(GAMES.map((g) => g.id).slice(19, 22)).toEqual(['symbol-memory', 'nonogram', 'light-sequence']);
    expect(GAME_BY_ID['symbol-memory'].no).toBe('20');
    expect(GAME_BY_ID.nonogram.no).toBe('21');
    expect(GAME_BY_ID['light-sequence'].no).toBe('22');
    expect(CATEGORY_LABEL.memory).toBe('きおく・しゅうちゅう');
    expect(GAMES.filter((g) => g.category === 'memory').map((g) => g.id)).toEqual(['symbol-memory', 'light-sequence', 'shuffle-cups', 'vanishing-path']);
    expect(GAME_BY_ID.nonogram.category).toBe('puzzle');
    for (const id of ['symbol-memory', 'nonogram', 'light-sequence'] as const) {
      expect(GAME_BY_ID[id].kind).toBe('board');
      expect(GAME_BY_ID[id].resumable).toBe(true);
    }
    // 既存の 01〜19 は そのまま
    expect(GAMES.slice(0, 19).map((g) => g.no)).toEqual(Array.from({ length: 19 }, (_, i) => String(i + 1).padStart(2, '0')));
  });
});
