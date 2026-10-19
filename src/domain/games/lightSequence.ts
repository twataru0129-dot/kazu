import { createRng } from '../random';
import type { Difficulty } from '../types';
import type { GameLogic } from './types';

/**
 * 22 ひかる じゅんばん：ボタンが1つずつ光る。光った順に おす。
 * 1回の あそびは 5ラウンド。ラウンド k（0始まり）の長さは startLen + k。
 * 5ラウンドぶんの順番は 問題を作るときに それぞれ べつに 作って 問題の中に持つ
 * （見なおし・やりなおし・再開で 作りなおさない）。どのラウンドも
 * 「まえのラウンドの順番に 1こ 足しただけ」には ならない。
 *
 * 記録（1つの attempt）の決め方：
 * - 5ラウンドを すべて正しく おしたときに だけ submit → 正解（finalCorrect）
 * - とちゅうで まちがえたら、その時点で submit（不正解・そのラウンドを やりなおす）
 *   → firstTryCorrect は「1回も まちがえずに 5ラウンド できた」、retryCount は まちがえた回数
 * - answerSnapshot には ラウンドごとの「みた回数・まちがえた回数」と とどいた長さ（best）を入れる
 *
 * generatorVersion 1 の問題（順番を 1本 `sequence` だけ持ち、ラウンド k は その先頭 startLen + k 個）も、
 * 途中保存や記録に のこっているため そのまま 遊べるように 読む（新しく 作ることは ない）。
 */
export const LIGHT_ROUNDS = 5;

export interface LightSequencePuzzle {
  buttons: number;
  startLen: number;
  /** ラウンドごとの順番（ボタン番号 0..buttons-1）。rounds[k] の長さは startLen + k */
  rounds?: number[][];
  /** generatorVersion 1 の問題だけが持つ：長さ startLen + 4 の順番を 1本 */
  sequence?: number[];
  /** 1つ光る時間（ミリ秒）と、光と光の あいだ（ミリ秒） */
  onMs: number;
  gapMs: number;
}

export interface LightRoundRecord {
  /** そのラウンドの長さ */
  length: number;
  /** 「みる」「もういちど みる」を押した回数（さいしょの「みる」も 1回と数える） */
  views: number;
  /** まちがえて やりなおした回数 */
  retries: number;
  cleared: boolean;
}

export interface LightSequenceAnswer {
  /** 各ラウンドで さいごに 押した順番 */
  inputs: number[][];
  rounds: LightRoundRecord[];
  /** 正しく おせた いちばん長い長さ */
  best: number;
}

export const LIGHT_RULES: Record<Difficulty, { buttons: number; startLen: number; onMs: number; gapMs: number; allowRepeat: boolean }> = {
  easy: { buttons: 4, startLen: 2, onMs: 1000, gapMs: 300, allowRepeat: false },
  normal: { buttons: 4, startLen: 3, onMs: 800, gapMs: 260, allowRepeat: false },
  hard: { buttons: 6, startLen: 4, onMs: 650, gapMs: 220, allowRepeat: true },
  challenge: { buttons: 9, startLen: 6, onMs: 550, gapMs: 200, allowRepeat: true },
};

export const roundLength = (p: LightSequencePuzzle, round: number) => p.startLen + round;
/** ラウンド round で 光る順番 */
export const roundSequence = (p: LightSequencePuzzle, round: number): number[] =>
  p.rounds ? (p.rounds[round] ?? []) : (p.sequence ?? []).slice(0, roundLength(p, round));

/** 押した順番が、そのラウンドの順番の先頭と 合っているか（UI は この関数で その場で確かめる） */
export function checkInput(p: LightSequencePuzzle, round: number, input: readonly number[]): 'ok' | 'wrong' | 'done' {
  const seq = roundSequence(p, round);
  if (input.length > seq.length) return 'wrong';
  for (let i = 0; i < input.length; i++) if (input[i] !== seq[i]) return 'wrong';
  return input.length === seq.length ? 'done' : 'ok';
}

/** 再生の時間割：光りはじめる時刻（ミリ秒）と、全体の長さ */
export function playbackSchedule(p: LightSequencePuzzle, round: number): { button: number; at: number }[] {
  return roundSequence(p, round).map((button, i) => ({ button, at: i * (p.onMs + p.gapMs) }));
}

const startsWith = (seq: readonly number[], head: readonly number[]) => head.length <= seq.length && head.every((b, i) => seq[i] === b);

/** 1ラウンドぶんの順番の きまり。合っていれば null */
function roundProblem(seq: readonly number[], len: number, buttons: number, allowRepeat: boolean, prev: readonly number[] | undefined): string | null {
  if (!Array.isArray(seq) || seq.length !== len) return 'length';
  if (seq.some((b) => !Number.isInteger(b) || b < 0 || b >= buttons)) return 'button';
  if (!allowRepeat && seq.some((b, i) => i > 0 && b === seq[i - 1])) return 'repeat';
  // 同じボタンが3回つづくのは むずかしい以上でも さける
  if (seq.some((b, i) => i > 1 && b === seq[i - 1] && b === seq[i - 2])) return 'triple';
  // ボタンを ひととおり つかう（2しゅるいだけで くりかえす などを さける）
  if (new Set(seq).size < Math.min(buttons, 3, len)) return 'too few buttons';
  // まえのラウンドの順番に 1こ 足しただけ（まえの順番で はじまる）には しない
  if (prev && startsWith(seq, prev)) return 'extends previous round';
  return null;
}

/** 1ラウンドを 作るときに ためす回数。先頭の 2こが それまでの ラウンドと ちがう ものを さがし、見つからなければ きまりだけ まもる */
const ROUND_TRIES = 30;

export const lightSequence: GameLogic<LightSequencePuzzle, LightSequenceAnswer> = {
  id: 'light-sequence',
  generatorVersion: 2,
  create(rng, d) {
    const r = LIGHT_RULES[d];
    const rounds: number[][] = [];
    for (let k = 0; k < LIGHT_ROUNDS; k++) {
      const len = r.startLen + k;
      const make = () => {
        const seq: number[] = [];
        for (let i = 0; i < len; i++) {
          let b = rng.int(0, r.buttons - 1);
          if (!r.allowRepeat) while (i > 0 && b === seq[i - 1]) b = rng.int(0, r.buttons - 1);
          seq.push(b);
        }
        return seq;
      };
      let pick: number[] | null = null;
      let backup: number[] | null = null;
      for (let t = 0; t < ROUND_TRIES * 4 && !pick; t++) {
        const seq = make();
        if (roundProblem(seq, len, r.buttons, r.allowRepeat, rounds[k - 1]) !== null) continue;
        // できれば それまでの どのラウンドとも 先頭の 2こを かえる（はじめから おぼえなおす）
        if (t < ROUND_TRIES && rounds.some((prev) => startsWith(seq, prev.slice(0, 2)))) {
          backup ??= seq;
          continue;
        }
        pick = seq;
      }
      pick ??= backup;
      if (!pick) return null;
      rounds.push(pick);
    }
    return { buttons: r.buttons, startLen: r.startLen, rounds, onMs: r.onMs, gapMs: r.gapMs };
  },
  validate(p, d) {
    const r = LIGHT_RULES[d];
    if (p.buttons !== r.buttons || p.startLen !== r.startLen || p.onMs !== r.onMs || p.gapMs !== r.gapMs) return 'rules';
    // 新しく出す問題は ラウンドごとの順番を持つ形だけ（generatorVersion 1 の形は 読むだけ）
    if (!Array.isArray(p.rounds) || p.rounds.length !== LIGHT_ROUNDS) return 'rounds';
    for (let k = 0; k < LIGHT_ROUNDS; k++) {
      const why = roundProblem(p.rounds[k], roundLength(p, k), p.buttons, r.allowRepeat, p.rounds[k - 1]);
      if (why) return `round ${k + 1}: ${why}`;
    }
    return null;
  },
  fallback(d) {
    const out: LightSequencePuzzle[] = [];
    for (let seed = 1; seed < 300 && out.length < 3; seed++) {
      const p = lightSequence.create(createRng(seed), d);
      if (p && lightSequence.validate(p, d) === null) out.push(p);
    }
    return out;
  },
  judge(p, a) {
    if (!a || !Array.isArray(a.inputs)) return { correct: false, message: 'ひかった じゅんに おしてね' };
    // 5ラウンドぶん、どれも そのラウンドの順番と ぴったり同じなら 正解
    for (let k = 0; k < LIGHT_ROUNDS; k++) {
      const res = checkInput(p, k, a.inputs[k] ?? []);
      if (res !== 'done') {
        const reached = k > 0 ? roundLength(p, k - 1) : 0;
        return { correct: false, message: res === 'wrong' ? 'おしい！ もういちど みて やってみよう' : reached ? `${reached}こ まで できたよ` : 'ひかった じゅんに おしてね' };
      }
    }
    return { correct: true };
  },
  hints(p, progress) {
    const pr = progress as { round?: number; input?: number[] } | undefined;
    const round = pr?.round ?? 0;
    const input = pr?.input ?? [];
    const seq = roundSequence(p, round);
    const next = Math.min(input.length, seq.length - 1);
    return [
      'ひかった ボタンの マークを こえに だして おぼえよう',
      // generatorVersion 1 の問題は まえと同じ順番で はじまるので「ちがう」とは 言わない
      p.rounds ? 'まえとは ちがう じゅんばんだよ。はじめから おぼえよう' : `ぜんぶで ${seq.length}こ ひかるよ。ゆびで おいかけよう`,
      `${next + 1}ばんめに おす ボタンが ひかるよ`,
    ];
  },
  key: (p) => (p.rounds ? `${p.buttons}:${p.rounds.map((s) => s.join('')).join('-')}` : `${p.buttons}:${(p.sequence ?? []).join('')}`),
};
