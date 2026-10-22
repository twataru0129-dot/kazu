import { describe, expect, it } from 'vitest';
import { createRng } from '../random';
import { DIFFICULTIES, type Difficulty } from '../types';
import { generatePuzzle } from './types';
import { CATEGORY_LABEL, GAMES, GAME_BY_ID } from './registry';
import {
  bestGridTime,
  cellAnswer,
  checkGrid,
  DIVIDE_BASES,
  emptyInputs,
  filledCount,
  generateGrid,
  GRID_OPS,
  GRID_SIZE,
  gridAnswers,
  gridKey,
  isGridOpAllowed,
  nextEmpty,
  validateGrid,
  type GridPuzzle,
  type GridSummary,
} from '../arithmetic/gridCalc';
import { statsByLevel } from '../tests/stats';
import {
  choiceText,
  clockAnswer,
  clockMaster,
  displayHour,
  durationText,
  fun,
  hourAngle,
  minuteAngle,
  questionText,
  timeText,
  toTime,
  wrap,
  type ClockPuzzle,
  type ClockQuestion,
} from './clockMaster';
import { cellOf, checkTap, HUNT_ROUNDS, HUNT_SIZE, huntTargets, numberHunt, type NumberHuntPuzzle } from './numberHunt';
import type { StoredAttempt } from '../../persistence/types';

const gen = <P,>(logic: Parameters<typeof generatePuzzle>[0], seed: number, d: Difficulty) => generatePuzzle(logic, createRng(seed), d).puzzle as P;

describe('100マス計算', () => {
  it('4段階 × えらべる 演算 × 500シード：マス数・演算・こたえは 整数で 0いじょう・割り算は 割りきれる', () => {
    for (const d of DIFFICULTIES)
      for (const op of GRID_OPS[d]) {
        const keys = new Set<string>();
        for (let s = 1; s <= 500; s++) {
          const p = generateGrid(createRng(s), d, op);
          expect(validateGrid(p), `${d}/${op}/${s}`).toBeNull();
          expect(p.left).toHaveLength(GRID_SIZE[d]);
          expect(p.top).toHaveLength(GRID_SIZE[d]);
          const ans = gridAnswers(p);
          expect(ans.flat()).toHaveLength(GRID_SIZE[d] ** 2);
          ans.forEach((row, r) =>
            row.forEach((v, c) => {
              const a = p.left[r];
              const b = p.top[c];
              // どの マスも「左 ○ 上」
              const want = op === 'add' ? a + b : op === 'subtract' ? a - b : op === 'multiply' ? a * b : a / b;
              expect(v).toBe(want);
              expect(Number.isInteger(v)).toBe(true);
              expect(v).toBeGreaterThanOrEqual(0);
              if (op === 'divide') {
                expect(b).not.toBe(0);
                expect(a % b).toBe(0);
              }
            }),
          );
          if (d === 'easy') expect(Math.max(...ans.flat())).toBeLessThanOrEqual(10);
          if (d === 'normal') expect(Math.max(...ans.flat())).toBeLessThanOrEqual(20);
          // おなじ シードなら おなじ 盤
          expect(generateGrid(createRng(s), d, op)).toEqual(p);
          keys.add(gridKey(p));
        }
        // 毎回 ちがう 盤（ならびを シャッフル）
        expect(keys.size).toBeGreaterThan(d === 'easy' ? 300 : 450);
      }
  });

  it('えらべない 演算は つくらない。割り算の 約数は どれも 10こで 公倍数を わりきる', () => {
    expect(GRID_OPS).toEqual({ easy: ['add'], normal: ['add', 'subtract'], hard: ['add', 'subtract', 'multiply'], challenge: ['add', 'subtract', 'multiply', 'divide'] });
    expect(isGridOpAllowed('easy', 'subtract')).toBe(false);
    expect(() => generateGrid(createRng(1), 'hard', 'divide')).toThrow();
    for (const [base, ds] of Object.entries(DIVIDE_BASES)) {
      expect(ds).toHaveLength(10);
      expect(new Set(ds).size).toBe(10);
      for (const x of ds) expect(Number(base) % x).toBe(0);
    }
    expect(validateGrid({ difficulty: 'challenge', op: 'divide', left: [60, 120, 180, 240, 300, 360, 420, 480, 540, 600], top: [0, 3, 4, 5, 6, 10, 12, 15, 20, 30] })).toBe('divide by zero');
    expect(validateGrid({ difficulty: 'normal', op: 'subtract', left: [1, 12, 13, 14, 15], top: [2, 3, 4, 5, 6] })).toBe('answer'); // マイナス
  });

  it('こたえあわせ：100マス ぜんぶ 照合。まちがいを なおして もういちど 採点', () => {
    const p = generateGrid(createRng(7), 'hard', 'multiply');
    const ans = gridAnswers(p);
    const inputs = ans.map((row) => row.map(String));
    expect(filledCount(inputs)).toBe(100);
    expect(checkGrid(p, inputs)).toMatchObject({ correct: 100, total: 100, allCorrect: true });
    const wrong = inputs.map((r) => [...r]);
    wrong[3][7] = String(ans[3][7] + 1);
    wrong[9][0] = '';
    const res = checkGrid(p, wrong);
    expect(res.correct).toBe(98);
    expect(res.allCorrect).toBe(false);
    expect(res.marks[3][7]).toBe('ng');
    expect(res.marks[9][0]).toBe('ng');
    expect(res.marks[0][0]).toBe('ok');
    wrong[3][7] = String(ans[3][7]);
    wrong[9][0] = String(ans[9][0]);
    expect(checkGrid(p, wrong).allCorrect).toBe(true);
    // 数として 読めない 入力は まちがい
    const odd = inputs.map((r) => [...r]);
    odd[0][0] = `0${ans[0][0]}x`;
    expect(checkGrid(p, odd).marks[0][0]).toBe('ng');
  });

  it('つぎの マス：行 → 列の じゅんに 未入力を さがす。さいごまで いったら さいしょへ', () => {
    const p: GridPuzzle = { difficulty: 'easy', op: 'add', left: [1, 2, 3], top: [1, 2, 3] };
    const inputs = emptyInputs(p);
    expect(nextEmpty(inputs, [0, 0])).toEqual([0, 1]);
    inputs[0][1] = '3';
    expect(nextEmpty(inputs, [0, 0])).toEqual([0, 2]);
    expect(nextEmpty(inputs, [2, 2])).toEqual([0, 0]);
    const full = gridAnswers(p).map((r) => r.map(String));
    expect(nextEmpty(full, [1, 1])).toBeNull();
    expect(cellAnswer('subtract', 9, 4)).toBe(5);
  });

  it('自己ベスト：同じ 条件・タイマー表示あり・はじめて ぜんぶ 正しい 記録だけ', () => {
    const base: GridSummary = { difficulty: 'normal', op: 'add', cells: 25, correct: 25, firstCorrect: 25, fixes: 0, timerOn: true, activeMs: 90_000, perfect: true };
    const xs: GridSummary[] = [
      base,
      { ...base, activeMs: 60_000, perfect: false, firstCorrect: 24, fixes: 1 }, // なおした → ベストに しない
      { ...base, activeMs: 50_000, timerOn: false }, // タイマーなし
      { ...base, activeMs: 40_000, op: 'subtract' }, // ちがう 条件
      { ...base, activeMs: 80_000 },
    ];
    expect(bestGridTime(xs, 'normal', 'add')).toBe(80_000);
    expect(bestGridTime(xs, 'normal', 'subtract')).toBe(40_000);
    expect(bestGridTime(xs, 'hard', 'add')).toBeNull();
  });

  it('ふつうの 計算の 統計に まざらない', () => {
    const a = (over: Partial<StoredAttempt>): StoredAttempt => ({ id: Math.random().toString(), profileId: 'p', sessionId: 's', mode: 'calculation', op: 'add', difficulty: 'easy', levelKey: 'add:d1:none', questionKey: 'k', generatorVersion: 1, questionSnapshot: null, answerSnapshot: null, firstTryCorrect: true, finalCorrect: true, retryCount: 0, hintsUsed: 0, answeredAt: '2026-01-01', ...over });
    const list = [a({}), a({ firstTryCorrect: false }), a({ gameId: 'grid-calc', levelKey: 'grid:easy:add', firstTryCorrect: false })];
    const s = statsByLevel(list, [], ['calculation']);
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({ levelKey: 'add:d1:none', n: 2, firstCorrect: 1 });
  });
});

describe('26 とけいマスター', () => {
  it('針の 角度：12じが 0度。長針 6度/分、短針 30度/じ ＋ 0.5度/分（3じ30ぷんは 3と4の あいだ）', () => {
    expect([hourAngle(0), minuteAngle(0)]).toEqual([0, 0]);
    expect([hourAngle(toTime(3, 0)), minuteAngle(toTime(3, 0))]).toEqual([90, 0]);
    expect([hourAngle(toTime(3, 30)), minuteAngle(toTime(3, 30))]).toEqual([105, 180]);
    expect([hourAngle(toTime(12, 59)), minuteAngle(toTime(12, 59))]).toEqual([29.5, 354]);
    expect([hourAngle(toTime(11, 59)), minuteAngle(toTime(11, 59))]).toEqual([359.5, 354]);
    expect(hourAngle(toTime(6, 1))).toBe(180.5);
  });

  it('じこくの 文字：12じ・0ぷん・30ぷん・59ふん、ふん／ぷん の 読みかた', () => {
    expect(timeText(0)).toBe('12じ');
    expect(displayHour(0)).toBe(12);
    expect(timeText(toTime(12, 0))).toBe('12じ');
    expect(timeText(toTime(7, 30), { half: true })).toBe('7じはん');
    expect(timeText(toTime(7, 30))).toBe('7じ30ぷん');
    expect(timeText(toTime(3, 15))).toBe('3じ15ふん');
    expect(timeText(toTime(8, 45))).toBe('8じ45ふん');
    expect(timeText(toTime(10, 59))).toBe('10じ59ふん');
    expect(timeText(toTime(1, 1))).toBe('1じ1ぷん');
    expect(['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'].map((m) => fun(Number(m)))).toEqual(['ぷん', 'ふん', 'ぷん', 'ぷん', 'ふん', 'ぷん', 'ふん', 'ぷん', 'ふん', 'ぷん']);
    expect(durationText(40)).toBe('40ぷん');
    expect(durationText(80)).toBe('1じかん20ぷん');
    expect(durationText(60)).toBe('1じかん');
  });

  it('時間の 計算：くりあがり・くりさがり・あいだの 時間', () => {
    const q = (x: ClockQuestion) => ({ ...x, difficulty: 'challenge' }) as ClockPuzzle;
    expect(timeText(clockAnswer(q({ kind: 'after', start: toTime(3, 20), delta: 25, story: null })))).toBe('3じ45ふん');
    expect(timeText(clockAnswer(q({ kind: 'before', start: toTime(6, 15), delta: 40, story: null })))).toBe('5じ35ふん');
    expect(clockAnswer(q({ kind: 'between', start: toTime(10, 50), end: toTime(11, 30), story: null }))).toBe(40);
    expect(timeText(clockAnswer(q({ kind: 'after', start: toTime(9, 45), delta: 80, story: null })))).toBe('11じ5ふん');
    expect(timeText(clockAnswer(q({ kind: 'before', start: toTime(2, 5), delta: 10, story: null })))).toBe('1じ55ふん');
    expect(wrap(toTime(11, 50) + 20)).toBe(toTime(12, 10));
    // 12じを またぐ 問題は 出さない（ごぜん・ごごが かわる）
    expect(clockMaster.validate(q({ kind: 'after', start: toTime(11, 50), delta: 20, story: null }), 'challenge')).toBe('crosses 12');
    expect(clockMaster.validate(q({ kind: 'before', start: toTime(1, 10), delta: 20, story: null }), 'challenge')).toBe('crosses 12');
    expect(questionText(q({ kind: 'after', start: toTime(3, 20), delta: 25, story: null }))).toBe('3じ20ぷんの 25ふん あとは なんじ なんぷん？');
  });

  it('4段階 × 500シード：検証ずみ・答えは 判定と 一致・選択肢は 正解が 1つだけで 文字も ちがう', () => {
    const kinds = new Map<string, number>();
    for (const d of DIFFICULTIES)
      for (let s = 1; s <= 500; s++) {
        const res = generatePuzzle(clockMaster, createRng(s), d);
        expect(res.fromFallback).toBe(false);
        const p = res.puzzle as ClockPuzzle;
        expect(clockMaster.validate(p, d)).toBeNull();
        kinds.set(`${d}:${p.kind}${p.kind === 'read' && p.choices ? '-choice' : ''}`, (kinds.get(`${d}:${p.kind}`) ?? 0) + 1);
        const want = clockAnswer(p);
        expect(clockMaster.judge(p, want).correct).toBe(true);
        expect(clockMaster.judge(p, null).correct).toBe(false);
        if (p.kind === 'read' && p.choices) {
          expect(p.choices.filter((c) => clockMaster.judge(p, c).correct)).toEqual([p.time]);
          expect(new Set(p.choices.map((c) => choiceText(p, c))).size).toBe(p.choices.length);
        }
        if (d === 'easy') expect(p.kind === 'read' && [0, 30].includes(p.time % 60)).toBe(true);
        if (d === 'normal' && (p.kind === 'read' || p.kind === 'set')) expect(p.time % 5).toBe(0);
        if (p.kind === 'set') expect(clockMaster.judge(p, p.start).correct).toBe(false);
        if (p.kind !== 'between') expect(clockMaster.judge(p, wrap(want + 1)).correct).toBe(false);
        else expect(clockMaster.judge(p, want + 5).correct).toBe(false);
        expect(gen<ClockPuzzle>(clockMaster, s, d)).toEqual(p);
      }
    for (const k of ['easy:read-choice', 'normal:read-choice', 'normal:set', 'hard:read', 'hard:set', 'challenge:after', 'challenge:before', 'challenge:between']) expect(kinds.get(k), k).toBeGreaterThan(0);
    expect([...kinds.keys()].some((k) => k.startsWith('easy:set'))).toBe(false); // かんたんは 針を うごかさない
  });

  it('ヒントは 3つ。まちがいの メッセージは どこが ちがうかを いう', () => {
    const p: ClockPuzzle = { difficulty: 'hard', kind: 'read', time: toTime(4, 20) };
    expect(clockMaster.hints(p)).toHaveLength(3);
    expect(clockMaster.hints(p)[0]).toBe('みじかい はりは なんじを あらわすよ');
    expect(clockMaster.judge(p, toTime(5, 20)).message).toContain('ふんは あってる');
    expect(clockMaster.judge(p, toTime(4, 25)).message).toContain('じは あってる');
  });
});

describe('27 数字をさがせ！', () => {
  it('4段階 × 500シード：数字の かさなり・ぬけ なし、5ラウンド べつべつの ならび', () => {
    const rules = new Set<string>();
    for (const d of DIFFICULTIES)
      for (let s = 1; s <= 500; s++) {
        const res = generatePuzzle(numberHunt, createRng(s), d);
        expect(res.fromFallback).toBe(false);
        const p = res.puzzle as NumberHuntPuzzle;
        expect(numberHunt.validate(p, d)).toBeNull();
        expect(p.size).toBe(HUNT_SIZE[d]);
        expect(p.rounds).toHaveLength(HUNT_ROUNDS);
        for (const r of p.rounds) expect([...r].sort((a, b) => a - b)).toEqual(Array.from({ length: p.size ** 2 }, (_, i) => i + 1));
        expect(new Set(p.rounds.map((r) => r.join())).size).toBe(HUNT_ROUNDS);
        if (d !== 'challenge') expect(p.rule).toBe('all');
        else rules.add(p.rule);
        expect(numberHunt.judge(p, { found: p.rounds.map(() => huntTargets(p)), rounds: [], timerOn: false, timeMs: 0 }).correct).toBe(true);
        expect(gen<NumberHuntPuzzle>(numberHunt, s, d)).toEqual(p);
      }
    expect([...rules].sort()).toEqual(['all', 'even', 'mult3']);
  });

  it('ルールの 対象：ぜんぶ 36こ、2の倍数 18こ、3の倍数 12こ（ちいさい じゅん）', () => {
    expect(huntTargets({ size: 6, rule: 'all' })).toHaveLength(36);
    expect(huntTargets({ size: 6, rule: 'even' })).toEqual([2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30, 32, 34, 36]);
    expect(huntTargets({ size: 6, rule: 'mult3' })).toEqual([3, 6, 9, 12, 15, 18, 21, 24, 27, 30, 33, 36]);
    expect(huntTargets({ size: 3, rule: 'all' })).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it('じゅんばん判定：まちがえても すすまない。さいごで done', () => {
    const p = gen<NumberHuntPuzzle>(numberHunt, 3, 'easy');
    expect(checkTap(p, 0, 1)).toBe('next');
    expect(checkTap(p, 0, 2)).toBe('wrong');
    expect(checkTap(p, 3, 4)).toBe('next');
    expect(checkTap(p, 8, 9)).toBe('done');
    const m3: NumberHuntPuzzle = { ...gen<NumberHuntPuzzle>(numberHunt, 3, 'challenge'), rule: 'mult3' };
    expect(checkTap(m3, 0, 1)).toBe('wrong');
    expect(checkTap(m3, 0, 3)).toBe('next');
    expect(checkTap(m3, 11, 36)).toBe('done');
    // とちゅうまで・じゅんばん ちがい は 不正解
    const t = huntTargets(p);
    expect(numberHunt.judge(p, { found: [t, t, t, t], rounds: [], timerOn: false, timeMs: 0 }).correct).toBe(false);
    expect(numberHunt.judge(p, { found: [t, t, t, t, [...t].reverse()], rounds: [], timerOn: false, timeMs: 0 }).correct).toBe(false);
  });

  it('ヒント3つ：つぎの 数字・その 行か 列・（画面で マスを ひからせる）', () => {
    const p = gen<NumberHuntPuzzle>(numberHunt, 5, 'normal');
    const [r, c] = cellOf(p, 2, 5);
    const h = numberHunt.hints(p, { round: 2, index: 4 });
    expect(h[0]).toBe('つぎに さがすのは「5」だよ');
    expect(h[1]).toBe(`ひだりから ${c + 1}ばんめの たての れつに あるよ`);
    const h2 = numberHunt.hints(p, { round: 2, index: 5 });
    expect(h2[1]).toBe(`うえから ${cellOf(p, 2, 6)[0] + 1}ばんめの よこの れつに あるよ`);
    expect(r).toBeGreaterThanOrEqual(0);
  });
});

describe('registry: 27 games', () => {
  it('26・27 を つづきの 番号で 登録。カテゴリは くらし・きおく', () => {
    expect(GAMES).toHaveLength(27);
    expect(GAMES.map((g) => g.no)).toEqual(Array.from({ length: 27 }, (_, i) => String(i + 1).padStart(2, '0')));
    expect(GAME_BY_ID['clock-master']).toMatchObject({ no: '26', title: 'とけいマスター', category: 'life', kind: 'set' });
    expect(GAME_BY_ID['number-hunt']).toMatchObject({ no: '27', title: '数字をさがせ！', category: 'memory', kind: 'board', resumable: true });
    expect(Object.keys(CATEGORY_LABEL)).toHaveLength(5);
    expect(GAME_BY_ID['clock-master'].logic.generatorVersion).toBe(1);
    expect(GAME_BY_ID['number-hunt'].logic.generatorVersion).toBe(1);
  });
});
