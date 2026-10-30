/**
 * 「あそぶ じかん」の時間制限（アプリ全体で1つ。プロフィールごとではない）。
 * UI から独立した純粋関数。時刻の差（ミリ秒）を渡して積算する。
 */
export const LIMIT_OPTIONS = [5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60] as const;
export const DEFAULT_LIMIT_MINUTES = 30;
export const WARN_BEFORE_MS = 5 * 60_000;
/** 1回の積算で数える最大の時間（端末のスリープ・時計の変更などで大きく飛んだときの安全策） */
export const MAX_STEP_MS = 60_000;

export function isValidLimit(n: unknown): n is number {
  return typeof n === 'number' && (LIMIT_OPTIONS as readonly number[]).includes(n);
}

/**
 * 時間制限の方式
 * - pin：使い切ると、保護者が PIN を入れるまで ロック（v1.4〜の 従来方式。前の版の 設定は ぜんぶ こちら）
 * - daily：1日の 合計で 数え、端末の 現地時刻で 0時を すぎると 自動で 回復（v1.8）
 */
export type LimitMode = 'pin' | 'daily';
export const isLimitMode = (m: unknown): m is LimitMode => m === 'pin' || m === 'daily';

/**
 * waiting：解除直後・有効にした直後。モードを選ぶまで数えない
 * running：遊んでいる（数える）
 * locked：時間切れ。保護者が PIN で解除するまで操作できない
 */
export type PlayPhase = 'waiting' | 'running' | 'locked';

export interface PlaytimeState {
  usedMs: number;
  phase: PlayPhase;
  /** 残り5分の案内を、この1回分で出したか */
  warned: boolean;
  /**
   * 毎日自動回復：いまの 時間枠の 日付（端末の 現地日付 YYYY-MM-DD）。これまでに 管理した いちばん 新しい 日付で、
   * 時計を 過去に もどしても さがらない（同じ 日の 枠が 何度も 復活しない）。PIN 方式では つかわない
   */
  day?: string;
}

export const initialPlaytime = (): PlaytimeState => ({ usedMs: 0, phase: 'waiting', warned: false });

export interface LimitConfig {
  enabled: boolean;
  limitMinutes: number;
  /** ない とき（前の 版の 設定）は pin */
  mode?: LimitMode;
}

export const modeOf = (c: LimitConfig): LimitMode => (c.mode === 'daily' ? 'daily' : 'pin');
const isDaily = (c: LimitConfig) => c.enabled && modeOf(c) === 'daily';

// ---- 日付（端末の 現地時刻。UTC の 日付とは まぜない） ----

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
export const isDayKey = (d: unknown): d is string => typeof d === 'string' && DAY_RE.test(d);

/** 現地日付 YYYY-MM-DD（toISOString は UTC なので つかわない） */
export function localDay(now: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

/** 現地の その日の 0時から 何ミリ秒 たったか */
export function msSinceLocalMidnight(now: Date): number {
  return now.getTime() - new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
}

/** 保存から よんだ ものを ただしい 形に（前の 版の データ・こわれた データでも 安全側に） */
export function normalizePlaytime(r: unknown): PlaytimeState {
  if (!r || typeof r !== 'object') return initialPlaytime();
  const x = r as Partial<PlaytimeState>;
  const s: PlaytimeState = {
    usedMs: Math.max(0, Number(x.usedMs) || 0),
    phase: x.phase === 'running' || x.phase === 'locked' ? x.phase : 'waiting',
    warned: !!x.warned,
  };
  if (isDayKey(x.day)) s.day = x.day;
  return s;
}

export interface RollResult {
  state: PlaytimeState;
  /** 新しい 日の 時間枠に した */
  reset: boolean;
}

/**
 * 毎日自動回復：日付が 変わって いたら 新しい 日の 時間枠に する（つかった 時間・ロック・5分前の 案内を もどし、
 * つぎに 遊びはじめるまで 数えない）。何日 あいても 1日ぶん だけ（のこりを ためない）。
 * - 日付が ない（方式を 切りかえた 直後 など）ときは、今日の 枠として 日付だけ つける（つかった 時間は そのまま）
 * - 日付が 今日より 新しい（端末の 時計を 過去に もどした）ときは 何も しない（同じ 日の 枠を 復活させない）
 * - 何回 よんでも 同じ（別の タブと 同時でも 二重に もどさない）
 * PIN 方式・制限なしでは 何も しない。
 */
export function rollDay(c: LimitConfig, s: PlaytimeState, today: string): RollResult {
  if (!isDaily(c)) return { state: s, reset: false };
  if (!s.day) return { state: { ...s, day: today }, reset: false };
  if (today > s.day) return { state: { ...initialPlaytime(), day: today }, reset: true };
  return { state: s, reset: false };
}

/** いま ロック中か（毎日自動回復で 日付が 変わって いれば、保存が まだ 古くても ロックと しない） */
export function isLockedNow(c: LimitConfig, s: PlaytimeState, now: Date): boolean {
  if (!c.enabled || s.phase !== 'locked') return false;
  return !rollDay(c, s, localDay(now)).reset;
}

export const limitMs = (c: LimitConfig) => c.limitMinutes * 60_000;

export function remainingMs(c: LimitConfig, s: PlaytimeState): number {
  return Math.max(0, limitMs(c) - s.usedMs);
}

/** 数える画面か（おとなのメニュー・ロック画面は数えない） */
export function isCountedRoute(path: string): boolean {
  return !path.startsWith('/parent');
}

/** 「遊びはじめた」とみなす画面（モードを選んだ） */
export function isPlayStartRoute(path: string): boolean {
  return /^\/(calc|play|learn|test)(\/|$)/.test(path);
}

export interface TickContext {
  visible: boolean;
  path: string;
}

export interface TickResult {
  state: PlaytimeState;
  warn: boolean;
  lock: boolean;
}

/** 経過時間 deltaMs を積算する。制限がオフ・非表示・数えない画面・待機中は数えない */
export function advance(c: LimitConfig, s: PlaytimeState, deltaMs: number, ctx: TickContext): TickResult {
  if (!c.enabled) return { state: s, warn: false, lock: false };
  if (s.phase === 'locked') return { state: s, warn: false, lock: false };
  let state = s;
  if (state.phase === 'waiting') {
    if (ctx.visible && isPlayStartRoute(ctx.path)) state = { ...state, phase: 'running' };
    else return { state, warn: false, lock: false };
  }
  // すでに使い切っていたら（制限を短くした・別のタブで使った など）すぐロック
  if (state.usedMs >= limitMs(c)) return { state: { ...state, phase: 'locked' }, warn: false, lock: true };
  if (!ctx.visible || !isCountedRoute(ctx.path)) return { state, warn: false, lock: false };
  const step = Math.min(MAX_STEP_MS, Math.max(0, Number.isFinite(deltaMs) ? deltaMs : 0));
  const usedMs = state.usedMs + step;
  const left = limitMs(c) - usedMs;
  if (left <= 0) return { state: { ...state, usedMs: limitMs(c), phase: 'locked' }, warn: false, lock: true };
  const warn = !state.warned && left <= WARN_BEFORE_MS;
  return { state: { ...state, usedMs, warned: state.warned || warn }, warn, lock: false };
}

export interface ClockTickResult extends TickResult {
  /** 日付が 変わって 新しい 時間枠に した */
  reset: boolean;
}

/**
 * 1回の 時間の 更新（日付の 確認 → 積算）。日付が 変わった ときは、0時より 前の 経過時間を 新しい 日に 足さない。
 * 遊んで いる とちゅうなら、新しい 日の 枠で そのまま 数えはじめる（画面・盤面は そのまま）。
 * ロック中に 変わった ときは 数えはじめない（ホームへ もどして、つぎに 遊びはじめて から）。
 */
export function tickPlaytime(c: LimitConfig, s: PlaytimeState, deltaMs: number, ctx: TickContext, now: Date): ClockTickResult {
  const rolled = rollDay(c, s, localDay(now));
  // ロック中に 日付が 変わった：ロック画面の うしろは まだ ゲームの 画面の ことが あるので、この 回は 数えはじめない
  // （ホームへ もどして から、つぎに 遊びはじめた ときから 数える）
  if (rolled.reset && s.phase === 'locked') return { state: rolled.state, warn: false, lock: false, reset: true };
  const delta = rolled.reset ? Math.min(deltaMs, msSinceLocalMidnight(now)) : deltaMs;
  return { ...advance(c, rolled.state, delta, ctx), reset: rolled.reset };
}

/**
 * PIN で解除：時間枠を設定値に戻し、つぎに遊びはじめるまで数えない。
 * 毎日自動回復では「今日の 追加の 1枠」（日付は そのまま。つぎの 日に なれば ふつうの 枠に もどる）
 */
export function afterUnlock(c?: LimitConfig, s?: PlaytimeState, now: Date = new Date()): PlaytimeState {
  if (!c || !isDaily(c)) return initialPlaytime();
  const today = localDay(now);
  return { ...initialPlaytime(), day: s?.day && s.day > today ? s.day : today };
}

/** 設定を 保存した あとの 時間枠（毎日自動回復なら 今日の 枠として はじめる） */
export const afterSave = (c: LimitConfig, now: Date = new Date()): PlaytimeState => (isDaily(c) ? { ...initialPlaytime(), day: localDay(now) } : initialPlaytime());

/** 保護者向けの 方式の 説明（「1日15分・毎日0時に回復」「1回15分・PINで解除」） */
export function limitSummary(c: LimitConfig): string {
  return modeOf(c) === 'daily' ? `1日 ${c.limitMinutes}分・毎日0時に回復` : `1回 ${c.limitMinutes}分・PINで解除`;
}

export function formatMinutes(ms: number): string {
  const total = Math.ceil(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return s ? `${m}分${s}秒` : `${m}分`;
}
