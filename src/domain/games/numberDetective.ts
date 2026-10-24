import { createRng, type Rng } from '../random';
import type { GameLogic } from './types';

/**
 * 31 すうじたんてい：コンピューターが きめた 3つの ひみつの すうじ（0〜9・かさならない・ならびも だいじ）を、
 * 10かい までの しつもんで あてる。しつもんの こたえは EAT（すうじも ばしょも おなじ）と BITE（すうじだけ おなじ）の 数だけ。
 *
 * すうじは 3もじの 文字列で もつ（"052" を 52 に しない）。判定は UI から はなした 純粋関数。
 * ひみつの すうじは 1人ずつ「720とおりを シャッフルした じゅんばん」から 出す（使いきるまで 同じ ならびは 出ない）。
 */
export const CODE_LENGTH = 3;
export const MAX_QUESTIONS = 10;
export const ALL_DIGITS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'] as const;

/** 0〜9 から かさならない 3つを ならべた 720とおり（"012" 〜 "987" の じゅん） */
export const ALL_CODES: readonly string[] = (() => {
  const out: string[] = [];
  for (const a of ALL_DIGITS) for (const b of ALL_DIGITS) for (const c of ALL_DIGITS) if (a !== b && b !== c && a !== c) out.push(a + b + c);
  return out;
})();

/** 3もじ・すうじだけ・かさならない */
export function isValidCode(s: unknown): s is string {
  return typeof s === 'string' && /^[0-9]{3}$/.test(s) && new Set(s).size === CODE_LENGTH;
}

export interface EatBite {
  eat: number;
  bite: number;
}

/**
 * EAT：おなじ ばしょに おなじ すうじ。BITE：すうじは ひみつに あるが ばしょが ちがう。
 * どちらも かさならない すうじ どうしなので、1つの すうじは EAT か BITE の どちらか 一方に しか 数えない。
 */
export function judgeGuess(secret: string, guess: string): EatBite {
  if (!isValidCode(secret) || !isValidCode(guess)) throw new Error('invalid code');
  let eat = 0;
  let bite = 0;
  for (let i = 0; i < CODE_LENGTH; i++) {
    if (guess[i] === secret[i]) eat++;
    else if (secret.includes(guess[i])) bite++;
  }
  return { eat, bite };
}

export const resultText = (r: EatBite) => `${r.eat} EAT！ ${r.bite} BITE！`;

export interface GuessRecord extends EatBite {
  guess: string;
}

export type DetectiveStatus = 'playing' | 'cleared' | 'over';

/** 1ゲームの すすみぐあい（途中保存にも そのまま つかう） */
export interface DetectiveState {
  secret: string;
  guesses: GuessRecord[];
  /** 入力中の すうじ（0〜3もじ・かさならない） */
  input: string;
  status: DetectiveStatus;
}

export const newGame = (secret: string): DetectiveState => ({ secret, guesses: [], input: '', status: 'playing' });
export const questionsLeft = (s: DetectiveState) => MAX_QUESTIONS - s.guesses.length;

/** 入力に すうじを 1つ たす（3つ そろって いる・おなじ すうじ・おわった あと は かえない） */
export function typeDigit(s: DetectiveState, d: string): DetectiveState {
  if (s.status !== 'playing' || !/^[0-9]$/.test(d) || s.input.length >= CODE_LENGTH || s.input.includes(d)) return s;
  return { ...s, input: s.input + d };
}
export function deleteDigit(s: DetectiveState): DetectiveState {
  if (s.status !== 'playing' || s.input.length === 0) return s;
  return { ...s, input: s.input.slice(0, -1) };
}
export function clearInput(s: DetectiveState): DetectiveState {
  if (s.status !== 'playing' || s.input.length === 0) return s;
  return { ...s, input: '' };
}

export type AskOutcome = 'asked' | 'incomplete' | 'duplicateDigit' | 'repeated' | 'finished';

/**
 * いまの 入力で しつもんする。
 * むこうな 入力（そろって いない・おなじ すうじ・まえと おなじ ならび・おわった あと）は 回数を へらさない。
 * 正解（3 EAT）で クリア、10かいめで 正解で なければ おしまい。
 */
export function ask(s: DetectiveState): { state: DetectiveState; outcome: AskOutcome; result?: GuessRecord } {
  if (s.status !== 'playing' || s.guesses.length >= MAX_QUESTIONS) return { state: s, outcome: 'finished' };
  const g = s.input;
  if (g.length !== CODE_LENGTH || !/^[0-9]{3}$/.test(g)) return { state: s, outcome: 'incomplete' };
  if (!isValidCode(g)) return { state: s, outcome: 'duplicateDigit' };
  if (s.guesses.some((x) => x.guess === g)) return { state: s, outcome: 'repeated' };
  const result: GuessRecord = { guess: g, ...judgeGuess(s.secret, g) };
  const guesses = [...s.guesses, result];
  const status: DetectiveStatus = result.eat === CODE_LENGTH ? 'cleared' : guesses.length >= MAX_QUESTIONS ? 'over' : 'playing';
  return { state: { ...s, guesses, input: '', status }, outcome: 'asked', result };
}

/** 保存から もどした ものが ただしい 形か（こわれて いたら 使わない）。EAT・BITE は 保存を 信じず 計算しなおす */
export function restoreState(raw: unknown): DetectiveState | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Partial<DetectiveState>;
  if (!isValidCode(r.secret) || !Array.isArray(r.guesses) || r.guesses.length > MAX_QUESTIONS) return null;
  const guesses: GuessRecord[] = [];
  for (const x of r.guesses) {
    const g = (x as Partial<GuessRecord> | null)?.guess;
    if (!isValidCode(g) || guesses.some((y) => y.guess === g)) return null;
    guesses.push({ guess: g, ...judgeGuess(r.secret, g) });
  }
  const solvedAt = guesses.findIndex((x) => x.eat === CODE_LENGTH);
  if (solvedAt >= 0 && solvedAt !== guesses.length - 1) return null;
  const status: DetectiveStatus = solvedAt >= 0 ? 'cleared' : guesses.length >= MAX_QUESTIONS ? 'over' : 'playing';
  const input = typeof r.input === 'string' && status === 'playing' && /^[0-9]{0,3}$/.test(r.input) && new Set(r.input).size === r.input.length ? r.input : '';
  return { secret: r.secret, guesses, input, status };
}

// ---- 出題の じゅんばん（プロフィールごと） ----

/** 720とおりの 出題じゅん。seed から シャッフルした じゅんばんの next ばんめを つぎに 出す */
export interface DetectiveDeck {
  v: 1;
  seed: number;
  next: number;
  /** ひとつ まえの 周の さいごに 出した ならび（つぎの 周の さいしょと かさならない ように） */
  prevLast?: string;
}

/** deck の 出題じゅん（シャッフルは seed で きまる。前の 周の さいごと 同じ ものが 先頭に くれば 2ばんめと いれかえる） */
export function deckOrder(deck: Pick<DetectiveDeck, 'seed' | 'prevLast'>): string[] {
  const order = createRng(deck.seed).shuffle([...ALL_CODES]);
  if (deck.prevLast && order[0] === deck.prevLast) [order[0], order[1]] = [order[1], order[0]];
  return order;
}

export function isDeck(d: unknown): d is DetectiveDeck {
  const x = d as Partial<DetectiveDeck> | null;
  return (
    !!x &&
    x.v === 1 &&
    Number.isInteger(x.seed) &&
    Number.isInteger(x.next) &&
    (x.next as number) >= 0 &&
    (x.next as number) <= ALL_CODES.length &&
    (x.prevLast === undefined || isValidCode(x.prevLast))
  );
}

/**
 * つぎの ひみつの すうじを 出す。720とおりを 使いきったら 新しい seed で シャッフルしなおす
 * （前の 周の さいごと 同じ ならびが つづけて 出ない）。deck が ない・こわれて いるときは 新しく はじめる。
 */
export function drawSecret(deck: unknown, newSeed: () => number): { secret: string; deck: DetectiveDeck } {
  let d: DetectiveDeck = isDeck(deck) ? deck : { v: 1, seed: newSeed(), next: 0 };
  if (d.next >= ALL_CODES.length) {
    const last = deckOrder(d)[ALL_CODES.length - 1];
    d = { v: 1, seed: newSeed(), next: 0, prevLast: last };
  }
  const secret = deckOrder(d)[d.next];
  return { secret, deck: { ...d, next: d.next + 1 } };
}

// ---- 登録表（ゲームの 一覧・記録）むけ ----

export interface DetectivePuzzle {
  secret: string;
}
export interface DetectiveAnswer {
  guess: string;
}

export const numberDetective: GameLogic<DetectivePuzzle, DetectiveAnswer> = {
  id: 'number-detective',
  generatorVersion: 1,
  create: (rng: Rng) => ({ secret: rng.pick(ALL_CODES) }),
  validate: (p) => (isValidCode(p.secret) ? null : 'secret'),
  fallback: () => [{ secret: '427' }, { secret: '052' }, { secret: '809' }],
  judge(p, a) {
    if (!isValidCode(a?.guess)) return { correct: false, message: 'ちがう 3つの すうじを えらんでね' };
    const r = judgeGuess(p.secret, a.guess);
    return { correct: r.eat === CODE_LENGTH, message: resultText(r) };
  },
  // このゲームでは EAT・BITE の 結果が ヒント。ヒントボタンは 出さない（あそびかたを いつでも 見られる）
  hints: () => ['EAT は すうじも ばしょも おなじ', 'BITE は すうじだけ おなじで ばしょが ちがう', 'まえの けっかと くらべて つぎの すうじを かんがえよう'],
  key: (p) => p.secret,
};
