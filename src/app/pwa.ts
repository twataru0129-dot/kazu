import { useEffect, useState } from 'react';
import { currentPath } from './router';

/**
 * Service Worker の登録と自動更新。
 *
 * - 起動時・アプリに戻ったとき・オンラインに戻ったとき・30分ごとに、新しい版があるか確かめる（registration.update）
 * - 新しい版が「待機」になったら、安全な画面（ホーム・プロフィール選択・一覧）にいるときだけ自動で切り替え、1回だけ再読み込みする
 * - ゲーム・計算・テストなどの途中では切り替えない。安全な画面に戻ったとき（または次の起動時）に適用する
 * - 記録は IndexedDB にあり、Service Worker もキャッシュの整理も IndexedDB には触れない
 */

/** 自動で再読み込みしてよい画面（途中の問題や入力がない画面） */
export const SAFE_PATHS = ['/', '', '/create', '/home', '/play', '/learn'];
const CHECK_INTERVAL_MS = 30 * 60 * 1000;
/** 自動の再読み込みを、この時間内に2回以上しない（無限リロード防止） */
const RELOAD_GUARD_MS = 30 * 1000;
const RELOAD_KEY = 'kazu.swReloadAt';
const ACTIVATE_TIMEOUT_MS = 10 * 1000;

export type UpdateState = 'idle' | 'waiting' | 'applying';

let registration: ServiceWorkerRegistration | null = null;
let state: UpdateState = 'idle';
let hadController = false;
let applyingSince = 0;
let reloadPending = false;
/** 書き込みが終わるのを待つ関数（保存中に再読み込みしないため。AppContext から登録） */
let waitForSaves: () => Promise<void> = async () => undefined;

const subs = new Set<(s: UpdateState) => void>();
function setState(s: UpdateState) {
  state = s;
  subs.forEach((f) => f(s));
}

export function setSaveWaiter(fn: () => Promise<void>) {
  waitForSaves = fn;
}

export function isSafeToReload(path = currentPath()): boolean {
  return SAFE_PATHS.includes(path.split('?')[0]);
}

function readReloadAt(): number {
  try {
    return Number(sessionStorage.getItem(RELOAD_KEY) || 0);
  } catch {
    return 0;
  }
}

function reloadOnce(): boolean {
  const last = readReloadAt();
  if (Date.now() - last < RELOAD_GUARD_MS) return false; // 直前に更新で再読み込みしたばかり
  try {
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
  } catch {
    /* sessionStorage が使えなくても続ける */
  }
  window.location.reload();
  return true;
}

/** 新しい版があるか確かめる（オフラインなどで失敗しても何もしない） */
export async function checkForUpdate(): Promise<void> {
  if (!registration) return;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
  try {
    await registration.update();
  } catch {
    /* オフライン・サーバーエラーでも今の版で続ける */
  }
  noticeWaiting();
}

function noticeWaiting() {
  if (!registration) return;
  if (registration.waiting && navigator.serviceWorker.controller) {
    if (state === 'idle') setState('waiting');
    void maybeApply();
  }
}

/** 安全なときだけ、待機中の新しい版に切り替える */
export async function maybeApply(force = false): Promise<void> {
  const w = registration?.waiting;
  if (!w || !navigator.serviceWorker.controller) return;
  if (!force && !isSafeToReload()) return;
  if (state === 'applying' && Date.now() - applyingSince < ACTIVATE_TIMEOUT_MS) return;
  setState('applying');
  applyingSince = Date.now();
  // 保存中の書き込みが終わるまで待つ（最大 3 秒）
  await Promise.race([waitForSaves(), new Promise((r) => setTimeout(r, 3000))]);
  if (!force && !isSafeToReload()) {
    setState('waiting');
    return;
  }
  reloadPending = true;
  w.postMessage({ type: 'SKIP_WAITING' });
  // 切り替えに失敗しても、そのまま今の版で遊べるようにする
  setTimeout(() => {
    if (state === 'applying') {
      reloadPending = false;
      setState(registration?.waiting ? 'waiting' : 'idle');
    }
  }, ACTIVATE_TIMEOUT_MS);
}

/** 画面が変わったとき：保留中の切り替え・再読み込みを、安全な画面なら行う */
function onRouteChange() {
  if (!isSafeToReload()) return;
  if (reloadPending && hadController && navigator.serviceWorker.controller) {
    // ほかのタブ・前の画面で切り替わり済み。ここで再読み込みして新しい版にする
    reloadPending = false;
    reloadOnce();
    return;
  }
  void maybeApply();
}

export function registerServiceWorker() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  hadController = !!navigator.serviceWorker.controller;

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    // はじめてのインストール（今まで Service Worker が無かった）では再読み込みしない
    if (!hadController) {
      hadController = true;
      return;
    }
    if (isSafeToReload()) {
      if (!reloadOnce()) setState('idle');
    } else {
      // ほかのタブで切り替わった場合など：プレイ中は再読み込みせず、安全な画面に戻ったときに行う
      reloadPending = true;
    }
  });

  const start = () => {
    navigator.serviceWorker
      .register('./sw.js', { updateViaCache: 'none' })
      .then((reg) => {
        registration = reg;
        reg.addEventListener('updatefound', () => {
          const w = reg.installing;
          w?.addEventListener('statechange', () => {
            if (w.state === 'installed') noticeWaiting();
          });
        });
        noticeWaiting();
        void checkForUpdate();
      })
      .catch(() => {
        /* Service Worker が使えなくてもアプリは動く */
      });
  };
  if (document.readyState === 'complete') start();
  else window.addEventListener('load', start, { once: true });

  // バックグラウンドから戻ったとき（iPhone のホーム画面アプリは再起動せずに戻ることが多い）
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void checkForUpdate();
  });
  window.addEventListener('pageshow', (e) => {
    if ((e as PageTransitionEvent).persisted) void checkForUpdate();
  });
  window.addEventListener('online', () => void checkForUpdate());
  window.setInterval(() => {
    if (document.visibilityState === 'visible') void checkForUpdate();
  }, CHECK_INTERVAL_MS);
  window.addEventListener('hashchange', onRouteChange);
  window.addEventListener('popstate', onRouteChange);
  window.addEventListener('kazu:navigate', onRouteChange);
}

/** ホーム画面の「こうしん する」ボタン（自動適用が間に合わないときの手動用） */
export function applyUpdate() {
  void maybeApply(true);
}

export function useUpdateState(): UpdateState {
  const [s, setS] = useState(state);
  useEffect(() => {
    subs.add(setS);
    return () => {
      subs.delete(setS);
    };
  }, []);
  return s;
}

/** 互換用：待機中の新しい版があるか */
export function useUpdateAvailable(): boolean {
  return useUpdateState() !== 'idle';
}
