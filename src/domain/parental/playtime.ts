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
}

export const initialPlaytime = (): PlaytimeState => ({ usedMs: 0, phase: 'waiting', warned: false });

export interface LimitConfig {
  enabled: boolean;
  limitMinutes: number;
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

/** PIN で解除：時間枠を設定値に戻し、つぎに遊びはじめるまで数えない */
export const afterUnlock = (): PlaytimeState => initialPlaytime();

export function formatMinutes(ms: number): string {
  const total = Math.ceil(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return s ? `${m}ふん ${s}びょう` : `${m}ふん`;
}
