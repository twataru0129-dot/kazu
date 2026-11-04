import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useApp } from './AppContext';
import { currentPath, navigate } from './router';
import { createPinRecord, isValidPin, lockoutMs, verifyPin } from '../domain/parental/pin';
import {
  afterSave,
  afterUnlock,
  initialPlaytime,
  isLimitMode,
  isLockedNow,
  isValidLimit,
  localDay,
  remainingMs,
  rollDay,
  tickPlaytime,
  type LimitMode,
  type PlaytimeState,
} from '../domain/parental/playtime';
import { defaultParental, type ParentalConfig } from '../persistence/types';

/**
 * 保護者の時間制限と PIN（アプリ全体で1組。プロフィールをまたいで共通）。
 * - 前面に表示されていて、子ども向けの画面にいる時間だけを、時刻の差で積算する
 * - 記録は IndexedDB（meta ストア）に1秒ごとに保存し、リロード・別タブ・プロフィール切替でも引き継ぐ
 * - 時間切れになったら App 全体をロック画面に差し替える
 * - 毎日自動回復（mode: daily）では、起動・復帰・1秒ごとの 更新・ロック中にも 日付を たしかめ、
 *   端末の 現地時刻で 日付が 変わって いたら 新しい 日の 枠に もどす（読んで・変えて・書くを 1つの トランザクションで）
 */
const TICK_MS = 1000;
const CHANNEL = 'kazu-parental';

export interface PinCheck {
  ok: boolean;
  /** まちがいが続いたときの待ち時間（ミリ秒）。0 なら すぐ入力できる */
  waitMs: number;
}

export interface ParentalState {
  loaded: boolean;
  config: ParentalConfig;
  playtime: PlaytimeState;
  locked: boolean;
  remainingMs: number;
  /** 残り5分の案内を出す合図（出すたびに増える） */
  warnCount: number;
  /** 記録を保存できなかった（メモリ上で数えている） */
  saveFailed: boolean;
  checkPin(pin: string): Promise<PinCheck>;
  unlockWithPin(pin: string): Promise<PinCheck>;
  setPin(pin: string): Promise<void>;
  clearPin(): Promise<void>;
  /** mode を はぶくと いまの 方式の まま */
  setLimit(enabled: boolean, minutes: number, mode?: LimitMode): Promise<void>;
}

const Ctx = createContext<ParentalState | null>(null);

export function useParental(): ParentalState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useParental outside provider');
  return v;
}

const visible = () => typeof document === 'undefined' || document.visibilityState !== 'hidden';

export function ParentalProvider({ children }: { children: ReactNode }) {
  const { repo } = useApp();
  const [config, setConfig] = useState<ParentalConfig>(defaultParental);
  const [playtime, setPlaytime] = useState<PlaytimeState>(initialPlaytime);
  const [loaded, setLoaded] = useState(false);
  const [warnCount, setWarnCount] = useState(0);
  const [saveFailed, setSaveFailed] = useState(false);
  const configRef = useRef(config);
  configRef.current = config;
  const playRef = useRef(playtime);
  playRef.current = playtime;
  const lastTs = useRef<number | null>(null);
  const busy = useRef(false);
  const channel = useRef<BroadcastChannel | null>(null);

  const reload = useCallback(async () => {
    const c = await repo.getParental();
    let p = await repo.getPlaytime();
    // 毎日自動回復：ロックの 表示を きめる 前に、保存されて いる 日付が 今日か たしかめる（古い ロック画面を 一瞬でも 出さない）
    if (rollDay(c, p, localDay(new Date())).state !== p) {
      p = (await repo.updatePlaytime((cur) => ({ state: rollDay(c, cur, localDay(new Date())).state, result: null }))).state;
    }
    configRef.current = c;
    playRef.current = p;
    setConfig(c);
    setPlaytime(p);
  }, [repo]);

  // 起動時：ロック状態を読み終わるまで画面を出さない（時間切れの画面が一瞬でも操作できないように）
  useEffect(() => {
    reload()
      .catch(() => undefined)
      .finally(() => setLoaded(true));
  }, [reload]);

  const broadcast = () => channel.current?.postMessage('changed');

  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return;
    const ch = new BroadcastChannel(CHANNEL);
    ch.onmessage = () => void reload();
    channel.current = ch;
    return () => ch.close();
  }, [reload]);

  /** 経過時間を積算する（時刻の差で数えるので、タイマーが間引かれても誤差が小さい） */
  const tick = useCallback(async () => {
    const c = configRef.current;
    if (!c.enabled) {
      lastTs.current = null;
      return;
    }
    if (busy.current) return;
    const now = Date.now();
    const isVisible = visible();
    const delta = lastTs.current === null || !isVisible ? 0 : now - lastTs.current;
    lastTs.current = isVisible ? now : null;
    const ctx = { visible: isVisible, path: currentPath() };
    busy.current = true;
    try {
      const out = await repo.updatePlaytime((cur) => {
        const r = tickPlaytime(c, cur, delta, ctx, new Date(now));
        return { state: r.state, result: r };
      });
      setSaveFailed(false);
      playRef.current = out.state;
      setPlaytime(out.state);
      if (out.result.warn) setWarnCount((n) => n + 1);
      if (out.result.lock || out.result.reset) broadcast();
    } catch {
      // 保存できないときも、メモリ上で数えつづける（安全側：ロックは かかる）
      setSaveFailed(true);
      const r = tickPlaytime(c, playRef.current, delta, ctx, new Date(now));
      playRef.current = r.state;
      setPlaytime(r.state);
      if (r.warn) setWarnCount((n) => n + 1);
    } finally {
      busy.current = false;
    }
  }, [repo]);

  useEffect(() => {
    if (!loaded) return;
    const id = window.setInterval(() => void tick(), TICK_MS);
    const onVis = () => {
      // 非表示になる前までを数えて保存し、非表示の間は数えない
      void tick();
      if (visible()) {
        lastTs.current = Date.now();
        void reload();
      }
    };
    const onRoute = () => void tick();
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('pagehide', onVis);
    window.addEventListener('pageshow', onVis);
    window.addEventListener('hashchange', onRoute);
    window.addEventListener('popstate', onRoute);
    window.addEventListener('kazu:navigate', onRoute);
    void tick();
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('pagehide', onVis);
      window.removeEventListener('pageshow', onVis);
      window.removeEventListener('hashchange', onRoute);
      window.removeEventListener('popstate', onRoute);
      window.removeEventListener('kazu:navigate', onRoute);
    };
  }, [loaded, tick, reload]);

  const saveConfig = useCallback(
    async (c: ParentalConfig) => {
      await repo.saveParental(c);
      configRef.current = c;
      setConfig(c);
      broadcast();
    },
    [repo],
  );

  const checkPin = useCallback(
    async (pin: string): Promise<PinCheck> => {
      const c = await repo.getParental(); // 別のタブでの失敗回数も反映
      const now = Date.now();
      if (c.retryAt > now) return { ok: false, waitMs: c.retryAt - now };
      if (!c.pin) return { ok: false, waitMs: 0 };
      const ok = await verifyPin(pin, c.pin);
      const failures = ok ? 0 : c.failures + 1;
      const wait = ok ? 0 : lockoutMs(failures);
      await saveConfig({ ...c, failures, retryAt: wait ? now + wait : 0 });
      return { ok, waitMs: wait };
    },
    [repo, saveConfig],
  );

  const unlockWithPin = useCallback(
    async (pin: string) => {
      const r = await checkPin(pin);
      if (!r.ok) return r;
      // 時間枠を設定値に戻し、つぎに遊びはじめるまで数えない（毎日自動回復では 今日の 追加の 1枠）
      const c = configRef.current;
      const out = await repo.updatePlaytime((cur) => ({ state: afterUnlock(c, cur, new Date()), result: null }));
      playRef.current = out.state;
      setPlaytime(out.state);
      lastTs.current = null;
      broadcast();
      navigate('/home', { replace: true });
      return r;
    },
    [checkPin, repo],
  );

  const setPin = useCallback(
    async (pin: string) => {
      if (!isValidPin(pin)) throw new Error('invalid pin');
      const rec = await createPinRecord(pin);
      await saveConfig({ ...configRef.current, pin: rec, failures: 0, retryAt: 0 });
    },
    [saveConfig],
  );

  const clearPin = useCallback(async () => {
    // 時間制限をつかっている間は PIN を消せない（ロックを解除できなくなるため）
    if (configRef.current.enabled) throw new Error('time limit is on');
    await saveConfig({ ...configRef.current, pin: null, failures: 0, retryAt: 0 });
  }, [saveConfig]);

  const setLimit = useCallback(
    async (enabled: boolean, minutes: number, mode: LimitMode = configRef.current.mode) => {
      if (!isValidLimit(minutes)) throw new Error('invalid limit');
      if (!isLimitMode(mode)) throw new Error('invalid mode');
      if (enabled && !configRef.current.pin) throw new Error('pin required');
      const next: ParentalConfig = { ...configRef.current, enabled, limitMinutes: minutes, mode };
      await saveConfig(next);
      // 設定を保存したら、新しい時間で 1回分を はじめから（つぎに遊びはじめたときから数える。毎日自動回復なら 今日の 枠）
      const out = await repo.updatePlaytime(() => ({ state: afterSave(next, new Date()), result: null }));
      playRef.current = out.state;
      setPlaytime(out.state);
      lastTs.current = null;
      broadcast();
    },
    [saveConfig, repo],
  );

  const locked = isLockedNow(config, playtime, new Date());
  // ロックが とけたら（PIN・日付の 変更・別の タブ）、うしろの 画面では なく ホームから（安全に もどす）
  const wasLocked = useRef(locked);
  useEffect(() => {
    if (wasLocked.current && !locked) navigate('/home', { replace: true });
    wasLocked.current = locked;
  }, [locked]);

  const value = useMemo<ParentalState>(
    () => ({
      loaded,
      config,
      playtime,
      locked,
      remainingMs: remainingMs(config, playtime),
      warnCount,
      saveFailed,
      checkPin,
      unlockWithPin,
      setPin,
      clearPin,
      setLimit,
    }),
    [loaded, config, playtime, locked, warnCount, saveFailed, checkPin, unlockWithPin, setPin, clearPin, setLimit],
  );

  if (!loaded) return <div className="screen center-text muted" style={{ justifyContent: 'center' }}>よみこみちゅう…</div>;
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
