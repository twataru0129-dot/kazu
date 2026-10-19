import { createRng } from '../random';
import type { Difficulty } from '../types';
import type { GameLogic } from './types';

/**
 * 22 ひかる じゅんばん：ボタンが1つずつ光る。光った順に おす。
 * 1回の あそびは 5ラウンド。ラウンドごとに、まえの順番の さいごに 1こだけ 足して 長くなる
 * （順番を 作りなおさない）。問題には さいごのラウンドの長さぶんの 順番を 1本だけ持ち、
 * ラウンド k（0始まり）は その 先頭 startLen + k 個を つかう。
 *
 * 記録（1つの attempt）の決め方：
 * - 5ラウンドを すべて正しく おしたときに だけ submit → 正解（finalCorrect）
 * - とちゅうで まちがえたら、その時点で submit（不正解・そのラウンドを やりなおす）
 *   → firstTryCorrect は「1回も まちがえずに 5ラウンド できた」、retryCount は まちがえた回数
 * - answerSnapshot には ラウンドごとの「みた回数・まちがえた回数」と とどいた長さ（best）を入れる
 */
export const LIGHT_ROUNDS = 5;

export interface LightSequencePuzzle {
  buttons: number;
  startLen: number;
  /** 長さ startLen + 4 の順番（ボタン番号 0..buttons-1） */
  sequence: number[];
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
/** ラウンド round で 光る順番（先頭から とった もの） */
export const roundSequence = (p: LightSequencePuzzle, round: number) => p.sequence.slice(0, roundLength(p, round));

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

export const lightSequence: GameLogic<LightSequencePuzzle, LightSequenceAnswer> = {
  id: 'light-sequence',
  generatorVersion: 1,
  create(rng, d) {
    const r = LIGHT_RULES[d];
    const len = r.startLen + LIGHT_ROUNDS - 1;
    const sequence: number[] = [];
    for (let i = 0; i < len; i++) {
      let b = rng.int(0, r.buttons - 1);
      if (!r.allowRepeat) while (i > 0 && b === sequence[i - 1]) b = rng.int(0, r.buttons - 1);
      sequence.push(b);
    }
    return { buttons: r.buttons, startLen: r.startLen, sequence, onMs: r.onMs, gapMs: r.gapMs };
  },
  validate(p, d) {
    const r = LIGHT_RULES[d];
    if (p.buttons !== r.buttons || p.startLen !== r.startLen || p.onMs !== r.onMs || p.gapMs !== r.gapMs) return 'rules';
    if (p.sequence.length !== r.startLen + LIGHT_ROUNDS - 1) return 'length';
    if (p.sequence.some((b) => !Number.isInteger(b) || b < 0 || b >= p.buttons)) return 'button';
    if (!r.allowRepeat && p.sequence.some((b, i) => i > 0 && b === p.sequence[i - 1])) return 'repeat';
    // 同じボタンが3回つづくのは むずかしい以上でも さける
    if (p.sequence.some((b, i) => i > 1 && b === p.sequence[i - 1] && b === p.sequence[i - 2])) return 'triple';
    // ボタンを ひととおり つかう（2しゅるいだけで くりかえす などを さける）
    if (new Set(p.sequence).size < Math.min(p.buttons, 3)) return 'too few buttons';
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
      round > 0 ? `まえの ラウンドと おなじ じゅんばんに、さいごに 1こ ふえるだけ だよ` : `ぜんぶで ${seq.length}こ ひかるよ。ゆびで おいかけよう`,
      `${next + 1}ばんめに おす ボタンが ひかるよ`,
    ];
  },
  key: (p) => `${p.buttons}:${p.sequence.join('')}`,
};
