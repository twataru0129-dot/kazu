import { describe, expect, it } from 'vitest';
import { createRng } from '../random';
import { DIFFICULTIES } from '../types';
import { generatePuzzle } from './types';
import { GAMES, GAME_BY_ID, STANDALONE_GAMES } from './registry';
import { MODES } from '../../config/theme';
import {
  ALL_CODES,
  ask,
  clearInput,
  deckOrder,
  deleteDigit,
  drawSecret,
  isDeck,
  isValidCode,
  judgeGuess,
  MAX_QUESTIONS,
  newGame,
  numberDetective,
  questionsLeft,
  restoreState,
  resultText,
  typeDigit,
  type DetectiveDeck,
  type DetectiveState,
} from './numberDetective';

/** べつの 書きかたの 判定（くらべる ため）：EAT は 同じ 位置、EAT＋BITE は 共通の すうじの 数 */
const naive = (s: string, g: string) => {
  let eat = 0;
  let common = 0;
  for (let i = 0; i < 3; i++) {
    if (s[i] === g[i]) eat++;
    for (let j = 0; j < 3; j++) if (s[i] === g[j]) common++;
  }
  return { eat, bite: common - eat };
};
const typeAll = (s: DetectiveState, g: string) => [...g].reduce(typeDigit, s);
const guess = (s: DetectiveState, g: string) => ask(typeAll(clearInput(s), g));

describe('31 すうじたんてい：720とおりの すうじ', () => {
  it('0〜9 から かさならない 3つの ならびは 720とおり。先頭の 0 も 文字の まま', () => {
    expect(ALL_CODES).toHaveLength(720);
    expect(new Set(ALL_CODES).size).toBe(720);
    for (const c of ALL_CODES) expect(isValidCode(c)).toBe(true);
    expect(ALL_CODES).toContain('052');
    expect(ALL_CODES).toContain('012');
    expect(ALL_CODES).toContain('987');
  });
  it('むこうな すうじ：かさなり・3もじ でない・すうじ以外・数値', () => {
    for (const bad of ['112', '000', '12', '1234', '12a', '', ' 12', 52, null, undefined]) expect(isValidCode(bad)).toBe(false);
  });
});

describe('31 すうじたんてい：EAT・BITE の 判定', () => {
  it.each([
    ['123', 1, 0],
    ['740', 0, 2],
    ['472', 1, 2],
    ['427', 3, 0],
    ['890', 0, 0],
    ['742', 0, 3],
    ['274', 0, 3],
    ['429', 2, 0],
  ])('ひみつ 427・よそう %s → %i EAT %i BITE', (g, eat, bite) => {
    expect(judgeGuess('427', g)).toEqual({ eat, bite });
  });
  it('先頭の 0：052 と 520 は 0 EAT 3 BITE、052 と 052 は 3 EAT', () => {
    expect(judgeGuess('052', '520')).toEqual({ eat: 0, bite: 3 });
    expect(judgeGuess('052', '052')).toEqual({ eat: 3, bite: 0 });
    expect(judgeGuess('052', '019')).toEqual({ eat: 1, bite: 0 });
    expect(judgeGuess('809', '098')).toEqual({ eat: 0, bite: 3 });
  });
  it('かさなる すうじの よそうは 判定しない', () => {
    expect(() => judgeGuess('427', '447')).toThrow();
    expect(() => judgeGuess('442', '427')).toThrow();
  });
  it('720 × 720 の ぜんぶの くみあわせ：べつの 書きかたと 一致・EAT＋BITE は 3まで・3 EAT は 同じ ときだけ・入れかえても 同じ', () => {
    let n = 0;
    for (const s of ALL_CODES)
      for (const g of ALL_CODES) {
        const r = judgeGuess(s, g);
        expect(r).toEqual(naive(s, g));
        expect(r.eat + r.bite).toBeLessThanOrEqual(3);
        expect(r.eat === 3).toBe(s === g);
        if (r.eat === 3) expect(r.bite).toBe(0);
        expect(r.eat === 2 && r.bite === 1).toBe(false); // 2つ 同じ 場所なら のこりの 1つは 場所が ちがえば 入れかえられない
        n++;
      }
    expect(n).toBe(518400);
    // 入れかえても 同じ（ひみつと よそうを 逆にしても 数は かわらない）
    for (let k = 0; k < 2000; k++) {
      const a = ALL_CODES[(k * 37) % 720];
      const b = ALL_CODES[(k * 101 + 7) % 720];
      expect(judgeGuess(a, b)).toEqual(judgeGuess(b, a));
    }
  });
  it('けっかの ことば', () => {
    expect(resultText({ eat: 1, bite: 2 })).toBe('1 EAT！ 2 BITE！');
  });
});

describe('31 すうじたんてい：ゲームの すすみかた', () => {
  it('入力：左から じゅんに 3つまで。おなじ すうじは えらべない。1つ けす・ぜんぶ けす', () => {
    let s = newGame('427');
    s = typeDigit(s, '1');
    s = typeDigit(s, '1');
    expect(s.input).toBe('1');
    s = typeDigit(typeDigit(typeDigit(s, '0'), '5'), '9');
    expect(s.input).toBe('105');
    expect(deleteDigit(s).input).toBe('10');
    expect(clearInput(s).input).toBe('');
    expect(typeDigit(s, 'a')).toBe(s);
  });
  it('1かいめで 正解', () => {
    const r = guess(newGame('052'), '052');
    expect(r.outcome).toBe('asked');
    expect(r.state.status).toBe('cleared');
    expect(r.state.guesses).toEqual([{ guess: '052', eat: 3, bite: 0 }]);
  });
  it('5かいめで 正解・のこりが へる', () => {
    let s = newGame('427');
    for (const g of ['123', '740', '472', '890']) s = guess(s, g).state;
    expect(questionsLeft(s)).toBe(6);
    expect(s.status).toBe('playing');
    s = guess(s, '427').state;
    expect(s.status).toBe('cleared');
    expect(s.guesses).toHaveLength(5);
  });
  it('10かいめで 正解は クリア、10かいめで まちがいは おしまい（11かいめは ない）', () => {
    const wrong = ['012', '013', '014', '015', '016', '018', '019', '023', '024'];
    let s = newGame('987');
    for (const g of wrong) s = guess(s, g).state;
    expect(questionsLeft(s)).toBe(1);
    expect(guess(s, '987').state.status).toBe('cleared');
    const over = guess(s, '025');
    expect(over.state.status).toBe('over');
    expect(over.state.guesses).toHaveLength(MAX_QUESTIONS);
    expect(questionsLeft(over.state)).toBe(0);
    const more = guess(over.state, '987');
    expect(more.outcome).toBe('finished');
    expect(more.state.guesses).toHaveLength(MAX_QUESTIONS);
    expect(typeDigit(over.state, '1')).toBe(over.state);
  });
  it('むこうな しつもんは 回数を へらさない：そろって いない・かさなり・まえと おなじ・おわった あと', () => {
    let s = newGame('427');
    expect(ask(typeAll(s, '12')).outcome).toBe('incomplete');
    expect(ask({ ...s, input: '112' }).outcome).toBe('duplicateDigit');
    s = guess(s, '123').state;
    const again = guess(s, '123');
    expect(again.outcome).toBe('repeated');
    expect(again.state.guesses).toHaveLength(1);
    expect(again.state.input).toBe('123'); // なおして べつの ならびで きける
    const done = guess(newGame('427'), '427').state;
    expect(ask({ ...done, input: '123' }).outcome).toBe('finished');
  });
  it('途中保存から もどす：形を たしかめ、EAT・BITE は 計算しなおす', () => {
    let s = newGame('052');
    s = guess(s, '123').state;
    s = typeAll(s, '50');
    const back = restoreState(JSON.parse(JSON.stringify({ ...s, guesses: s.guesses.map((g) => ({ ...g, eat: 9 })) })))!;
    expect(back.secret).toBe('052');
    expect(back.guesses).toEqual([{ guess: '123', ...judgeGuess('052', '123') }]);
    expect(back.input).toBe('50');
    expect(back.status).toBe('playing');
    for (const bad of [null, {}, { secret: '112', guesses: [] }, { secret: '052', guesses: [{ guess: '11' }] }, { secret: '052', guesses: [{ guess: '123' }, { guess: '123' }] }])
      expect(restoreState(bad)).toBeNull();
    expect(restoreState({ secret: '052', guesses: [], input: '55' })!.input).toBe('');
  });
});

describe('31 すうじたんてい：プロフィールごとの 出題じゅん（720とおり）', () => {
  let seedN = 1000;
  const seed = () => seedN++;
  it('720かい 出すまで 同じ ならびは 出ない。使いきったら シャッフルしなおし、直前と 同じ ならびが つづかない', () => {
    let deck: unknown = undefined;
    const seen: string[] = [];
    for (let k = 0; k < 720; k++) {
      const r = drawSecret(deck, seed);
      seen.push(r.secret);
      deck = r.deck;
    }
    expect(new Set(seen).size).toBe(720);
    expect((deck as DetectiveDeck).next).toBe(720);
    const next = drawSecret(deck, seed);
    expect(next.deck.next).toBe(1);
    expect(next.deck.prevLast).toBe(seen[719]);
    expect(next.secret).not.toBe(seen[719]);
    // 2周めも 720とおり ぜんぶ
    let d: unknown = next.deck;
    const second = [next.secret];
    for (let k = 1; k < 720; k++) {
      const r = drawSecret(d, seed);
      second.push(r.secret);
      d = r.deck;
    }
    expect(new Set(second).size).toBe(720);
  });
  it('前の 周の さいごが 新しい 周の 先頭に くる seed でも、先頭を いれかえる', () => {
    // seed 0 の 先頭を 前の さいごに した 場合
    const first = deckOrder({ seed: 7 })[0];
    const order = deckOrder({ seed: 7, prevLast: first });
    expect(order[0]).not.toBe(first);
    expect(new Set(order).size).toBe(720);
    // 720 まで 使った deck から 次の 周へ（さいごが そのまま 先頭に こない）
    for (let s = 1; s < 200; s++) {
      const full: DetectiveDeck = { v: 1, seed: s, next: 720 };
      const last = deckOrder(full)[719];
      expect(drawSecret(full, () => s + 1).secret).not.toBe(last);
    }
  });
  it('同じ deck なら 同じ じゅん（アプリを 開きなおしても つづきから）', () => {
    const d: DetectiveDeck = { v: 1, seed: 42, next: 10 };
    expect(drawSecret(d, seed).secret).toBe(deckOrder(d)[10]);
    expect(drawSecret(JSON.parse(JSON.stringify(d)), seed).secret).toBe(deckOrder(d)[10]);
  });
  it('こわれた deck は 使わず 新しく はじめる', () => {
    for (const bad of [null, {}, { v: 2, seed: 1, next: 0 }, { v: 1, seed: 1.5, next: 0 }, { v: 1, seed: 1, next: 800 }, { v: 1, seed: 1, next: -1 }, { v: 1, seed: 1, next: 0, prevLast: '11' }]) {
      expect(isDeck(bad)).toBe(false);
      expect(drawSecret(bad, () => 5).deck).toMatchObject({ v: 1, seed: 5, next: 1 });
    }
  });
});

describe('31 すうじたんてい：登録', () => {
  it('31ばん・かずを くらべる・みぬく。専用の 画面', () => {
    expect(GAMES).toHaveLength(31);
    expect(GAMES.map((g) => g.no)).toEqual(Array.from({ length: 31 }, (_, i) => String(i + 1).padStart(2, '0')));
    expect(GAME_BY_ID['number-detective']).toMatchObject({ no: '31', title: 'すうじたんてい', category: 'compare', resumable: true });
    expect(STANDALONE_GAMES).toEqual(['number-detective']);
    expect(MODES.play.sub).toBe('31この すうじあそび');
  });
  it('登録表の ロジック：どの 内部の むずかしさでも 720とおりの どれか。判定は 3 EAT で 正解', () => {
    for (const d of DIFFICULTIES)
      for (let s = 1; s <= 300; s++) {
        const r = generatePuzzle(numberDetective, createRng(s), d);
        expect(r.fromFallback).toBe(false);
        expect(isValidCode(r.puzzle.secret)).toBe(true);
      }
    expect(numberDetective.judge({ secret: '427' }, { guess: '427' })).toMatchObject({ correct: true });
    expect(numberDetective.judge({ secret: '427' }, { guess: '472' })).toMatchObject({ correct: false, message: '1 EAT！ 2 BITE！' });
    expect(numberDetective.judge({ secret: '427' }, { guess: '447' }).correct).toBe(false);
  });
});
