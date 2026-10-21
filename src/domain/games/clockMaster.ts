import { createRng, type Rng } from '../random';
import type { Difficulty } from '../types';
import type { GameLogic } from './types';

/**
 * 26 とけいマスター：アナログ時計を 読む・針を 動かして 時刻を つくる・時間の 計算。
 *
 * 時刻は「12時間の 中の 分」（0〜719）で もつ。0 は 12じ00ぷん、75 は 1じ15ふん。
 * 表示の「じ」は 0 のとき 12。正誤は 表示の 文字では なく この 数で 判定する。
 * 針の 角度（12じを 0度、時計まわり）：長針 = 分×6度、短針 = じ×30度 ＋ 分×0.5度。
 *
 * 時間の 計算（チャレンジ）は、12じを またがない（1じ00ぷん〜11じ59ふんの 中で おわる）問題だけに して、
 * ごぜん・ごごが かわる・日付を またぐ などで 答えが 1つに きまらない 問題は 出さない。
 */
export const DAY_MINUTES = 720;

export type ClockQuestion =
  /** 時計を 読む。choices が あれば えらぶ、なければ 数字で 入れる */
  | { kind: 'read'; time: number; choices?: number[] }
  /** 針を 動かして time に する。はじめは start。step は 分の 動き（5 または 1） */
  | { kind: 'set'; time: number; start: number; step: 1 | 5 }
  /** start の delta 分 あと／まえ の 時刻（数字で 入れる） */
  | { kind: 'after' | 'before'; start: number; delta: number; story: number | null }
  /** start から end まで 何分（数字で 入れる） */
  | { kind: 'between'; start: number; end: number; story: number | null };

export type ClockPuzzle = ClockQuestion & { difficulty: Difficulty };
/** 答え：時刻（0〜719）または 分数 */
export type ClockAnswer = number | null;

export const hourOf = (t: number) => Math.floor((((t % DAY_MINUTES) + DAY_MINUTES) % DAY_MINUTES) / 60);
export const minuteOf = (t: number) => (((t % DAY_MINUTES) + DAY_MINUTES) % DAY_MINUTES) % 60;
/** 表示の じ（0 → 12） */
export const displayHour = (t: number) => hourOf(t) || 12;
export const toTime = (hour12: number, minute: number) => ((hour12 % 12) * 60 + minute + DAY_MINUTES) % DAY_MINUTES;
export const wrap = (t: number) => ((t % DAY_MINUTES) + DAY_MINUTES) % DAY_MINUTES;

/** 長針・短針の 角度（度。12じが 0、時計まわり） */
export const minuteAngle = (t: number) => minuteOf(t) * 6;
export const hourAngle = (t: number) => hourOf(t) * 30 + minuteOf(t) * 0.5;

/** 「ふん／ぷん」：1・3・4・6・8・0 で おわる ときは「ぷん」 */
export const fun = (m: number) => (m % 10 === 2 || m % 10 === 5 || m % 10 === 7 || m % 10 === 9 ? 'ふん' : 'ぷん');
/** 3じ・3じはん・3じ15ふん */
export function timeText(t: number, opts: { half?: boolean } = {}): string {
  const h = displayHour(t);
  const m = minuteOf(t);
  if (m === 0) return `${h}じ`;
  if (m === 30 && opts.half) return `${h}じはん`;
  return `${h}じ${m}${fun(m)}`;
}
/** 40ぷん・1じかん20ぷん */
export function durationText(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h && m) return `${h}じかん${m}${fun(m)}`;
  if (h) return `${h}じかん`;
  return `${m}${fun(m)}`;
}

/** 生活の 場面（ごぜん・ごご を はっきり 書く）。{s}{e}{d} を うめる */
export const STORIES: { kind: 'after' | 'before' | 'between'; half: 'ごぜん' | 'ごご'; hours: [number, number]; text: string }[] = [
  { kind: 'after', half: 'ごご', hours: [1, 5], text: '{half} {s}に こうえんに ついたよ。{d} あそんだら なんじ なんぷん？' },
  { kind: 'after', half: 'ごぜん', hours: [8, 10], text: '{half} {s}に えいがが はじまったよ。{d} で おわるのは なんじ なんぷん？' },
  { kind: 'before', half: 'ごぜん', hours: [7, 9], text: '{half} {s}に がっこうに ついたよ。いえを でたのは {d} まえ。なんじ なんぷん？' },
  { kind: 'before', half: 'ごご', hours: [5, 7], text: '{half} {s}に ばんごはんを たべはじめたよ。おふろに はいったのは その {d} まえ。なんじ なんぷん？' },
  { kind: 'between', half: 'ごご', hours: [2, 5], text: '{half} {s}から {e}まで ほんを よんだよ。なんぷん よんだ？' },
  { kind: 'between', half: 'ごぜん', hours: [9, 11], text: '{half} {s}に でかけて {e}に かえって きたよ。なんぷん でかけて いた？' },
];

/** 正しい 答え（時刻 または 分数） */
export function clockAnswer(p: ClockQuestion): number {
  switch (p.kind) {
    case 'read':
    case 'set':
      return p.time;
    case 'after':
      return wrap(p.start + p.delta);
    case 'before':
      return wrap(p.start - p.delta);
    case 'between':
      return p.end - p.start;
  }
}

/** 問題文 */
export function questionText(p: ClockQuestion): string {
  switch (p.kind) {
    case 'read':
      return 'とけいは なんじ なんぷん？';
    case 'set':
      return `はりを うごかして「${timeText(p.time)}」に しよう`;
    case 'after':
    case 'before':
    case 'between': {
      const st = p.story !== null ? STORIES[p.story] : null;
      const s = timeText(p.start);
      if (p.kind === 'between') {
        const e = timeText(p.end);
        return st ? fill(st.text, st.half, s, e, '') : `${s}から ${e}まで なんぷん？`;
      }
      const d = durationText(p.delta);
      if (st) return fill(st.text, st.half, s, '', d);
      return p.kind === 'after' ? `${s}の ${d} あとは なんじ なんぷん？` : `${s}の ${d} まえは なんじ なんぷん？`;
    }
  }
}
const fill = (t: string, half: string, s: string, e: string, d: string) => t.replace('{half}', half).replace('{s}', s).replace('{e}', e).replace('{d}', d);

/** 選択肢の 文字（かんたんは「はん」も つかう） */
export const choiceText = (p: ClockPuzzle, t: number) => timeText(t, { half: p.difficulty === 'easy' });

function distinct(xs: number[]) {
  return new Set(xs).size === xs.length;
}

/** まちがえ やすい 読みかた（短針と 長針を とりちがえる・1じかん ずれる・数字を そのまま 分に する など） */
function confusions(t: number, step: number): number[] {
  const h = hourOf(t);
  const m = minuteOf(t);
  const out: number[] = [];
  // 長針と 短針を とりちがえる（長針の さす 数字を じ に、短針の じ を 分の 数字として 読む）
  const mNum = Math.round(m / 5) % 12;
  out.push(toTime(mNum || 12, h * 5 >= 60 ? 0 : h * 5));
  // 30分 すぎで 短針が つぎの 数字に ちかい → 1じかん 先と 読む
  out.push(wrap(t + 60), wrap(t - 60));
  // 長針の 数字を そのまま 分に する（3 を さす → 3ぷん）
  if (m % 5 === 0 && m !== 0) out.push(toTime(h || 12, m / 5));
  out.push(wrap(t + step), wrap(t - step), wrap(t + 30));
  return out;
}

function pickChoices(rng: Rng, t: number, n: number, step: number, allowed: (x: number) => boolean): number[] | null {
  const pool = [...new Set(confusions(t, step).filter((x) => x !== t && allowed(x)))];
  const wrong = rng.shuffle(pool).slice(0, n - 1);
  if (wrong.length < n - 1) return null;
  return rng.shuffle([t, ...wrong]);
}

/** 12じを またがない（1じ00ぷん〜11じ59ふん） */
const inDay = (t: number) => t >= 60 && t < DAY_MINUTES;

function build(rng: Rng, d: Difficulty): ClockPuzzle | null {
  if (d === 'easy') {
    const time = rng.int(0, 11) * 60 + (rng.chance(0.5) ? 30 : 0);
    const choices = pickChoices(rng, time, 3, 30, (x) => minuteOf(x) % 30 === 0);
    return choices ? { difficulty: d, kind: 'read', time, choices } : null;
  }
  if (d === 'normal') {
    const time = rng.int(0, 143) * 5;
    if (rng.chance(0.6)) {
      const choices = pickChoices(rng, time, 4, 5, (x) => minuteOf(x) % 5 === 0);
      return choices ? { difficulty: d, kind: 'read', time, choices } : null;
    }
    let start = rng.int(0, 143) * 5;
    if (start === time) start = wrap(start + 60);
    return { difficulty: d, kind: 'set', time, start, step: 5 };
  }
  if (d === 'hard') {
    const time = rng.int(0, DAY_MINUTES - 1);
    if (rng.chance(0.5)) return { difficulty: d, kind: 'read', time };
    let start = rng.int(0, 143) * 5;
    if (start === time) start = wrap(start + 60);
    return { difficulty: d, kind: 'set', time, start, step: 1 };
  }
  // チャレンジ：時間の 計算
  const r = rng.next();
  const kind: 'after' | 'before' | 'between' = r < 0.4 ? 'after' : r < 0.7 ? 'before' : 'between';
  const storyIds = STORIES.map((s, i) => (s.kind === kind ? i : -1)).filter((i) => i >= 0);
  const story = rng.chance(0.5) ? rng.pick(storyIds) : null;
  const hours = story !== null ? STORIES[story].hours : ([1, 10] as [number, number]);
  const start = rng.int(hours[0], hours[1]) * 60 + rng.int(0, 11) * 5;
  if (kind === 'between') {
    const end = start + rng.int(2, 24) * 5;
    if (!inDay(start) || !inDay(end)) return null;
    return { difficulty: d, kind, start, end, story };
  }
  const delta = rng.int(1, 23) * 5;
  const res = kind === 'after' ? start + delta : start - delta;
  if (!inDay(start) || !inDay(res)) return null;
  return { difficulty: d, kind, start, delta, story };
}

export const clockMaster: GameLogic<ClockPuzzle, ClockAnswer> = {
  id: 'clock-master',
  generatorVersion: 1,
  create: (rng, d) => build(rng, d),
  validate(p, d) {
    if (p.difficulty !== d) return 'difficulty';
    const ok = (t: number) => Number.isInteger(t) && t >= 0 && t < DAY_MINUTES;
    if (p.kind === 'read') {
      if (!ok(p.time)) return 'time';
      const step = d === 'easy' ? 30 : d === 'normal' ? 5 : 1;
      if (minuteOf(p.time) % step !== 0) return 'step';
      if (d === 'easy' || d === 'normal') {
        if (!p.choices || p.choices.length !== (d === 'easy' ? 3 : 4)) return 'choices';
        if (!distinct(p.choices) || p.choices.filter((c) => c === p.time).length !== 1) return 'answer not unique';
        // 文字に すると 同じ に なる 選択肢も だめ
        if (new Set(p.choices.map((c) => choiceText(p, c))).size !== p.choices.length) return 'same text';
        if (p.choices.some((c) => !ok(c) || minuteOf(c) % step !== 0)) return 'choice step';
      } else if (p.choices) return 'hard reads by number';
      if (d === 'challenge') return 'kind';
      return null;
    }
    if (p.kind === 'set') {
      if (d !== 'normal' && d !== 'hard') return 'kind';
      if (!ok(p.time) || !ok(p.start) || p.time === p.start) return 'time';
      if (p.step !== (d === 'normal' ? 5 : 1)) return 'step';
      if (minuteOf(p.time) % p.step !== 0 || minuteOf(p.start) % 5 !== 0) return 'step';
      return null;
    }
    if (d !== 'challenge') return 'kind';
    if (p.story !== null && (STORIES[p.story]?.kind !== p.kind)) return 'story';
    if (p.kind === 'between') {
      if (!inDay(p.start) || !inDay(p.end) || p.end <= p.start) return 'range';
      if ((p.end - p.start) % 5 !== 0) return 'step';
      return null;
    }
    if (!(p.delta > 0) || p.delta % 5 !== 0) return 'delta';
    const res = p.kind === 'after' ? p.start + p.delta : p.start - p.delta;
    if (!inDay(p.start) || !inDay(res)) return 'crosses 12';
    return null;
  },
  fallback(d) {
    const out: ClockPuzzle[] = [];
    for (let seed = 1; seed < 300 && out.length < 6; seed++) {
      const p = build(createRng(seed), d);
      if (p && clockMaster.validate(p, d) === null) out.push(p);
    }
    return out;
  },
  judge(p, a) {
    if (a === null || a === undefined || !Number.isFinite(a)) return { correct: false, message: p.kind === 'between' ? 'なんぷんか いれてね' : 'こたえを えらんでね' };
    const want = clockAnswer(p);
    if (p.kind === 'between') return a === want ? { correct: true } : { correct: false, message: a > want ? 'すこし おおいよ。ながい はりを うごかして かぞえよう' : 'すこし すくないよ。ながい はりを うごかして かぞえよう' };
    if (wrap(a) === want) return { correct: true };
    if (minuteOf(a) === minuteOf(want)) return { correct: false, message: 'ふんは あってるよ。みじかい はりを よく みよう' };
    if (hourOf(a) === hourOf(want)) return { correct: false, message: 'じは あってるよ。ながい はりを よく みよう' };
    return { correct: false, message: 'おしい！ みじかい はりと ながい はりを じゅんばんに みよう' };
  },
  hints(p) {
    const third =
      p.kind === 'read'
        ? 'そとの ちいさな すうじが なんぷんかを おしえて くれるよ。みじかい はりは すうじと すうじの あいだにも くるよ'
        : p.kind === 'set'
          ? 'そとの ちいさな すうじを みながら ながい はりを うごかそう。みじかい はりも いっしょに うごくよ'
          : p.kind === 'between'
            ? 'ちょうど なんじに なるまで なんぷんか、そこから なんぷんか、2つに わけて たそう'
            : '5ふんずつ かぞえよう。60ぷんで 1じかん すすむ（もどる）よ';
    return ['みじかい はりは なんじを あらわすよ', 'ながい はりは なんぷんを あらわすよ。すうじ 1つで 5ふん', third];
  },
  key: (p) => (p.kind === 'read' ? `r${p.time}:${p.choices?.join(',') ?? ''}` : p.kind === 'set' ? `s${p.time}<${p.start}` : p.kind === 'between' ? `b${p.start}-${p.end}` : `${p.kind[0]}${p.start}${p.kind === 'after' ? '+' : '-'}${p.delta}`),
};
