import { useEffect, useRef, useState } from 'react';

/** 1回の 数えで ふやす 上限（スリープや 時計の 変更で 大きく とんでも 時間を すすめすぎない） */
export const MAX_TICK_MS = 2000;
const TICK_MS = 250;

/**
 * 遊んでいる 時間（ミリ秒）を 数える。running で、画面が 見えている ときだけ 進む。
 * performance.now()（端末の 時計を かえても 変わらない）の 差を たして いく。
 * initialMs から つづける（途中保存からの 再開）。
 */
export function useActiveTimer(running: boolean, initialMs = 0) {
  const [ms, setMs] = useState(initialMs);
  const msRef = useRef(initialMs);
  const last = useRef<number | null>(null);

  useEffect(() => {
    const visible = () => typeof document === 'undefined' || document.visibilityState !== 'hidden';
    const flush = () => {
      const now = performance.now();
      if (last.current !== null) {
        const d = Math.min(MAX_TICK_MS, Math.max(0, now - last.current));
        msRef.current += d;
        setMs(msRef.current);
      }
      last.current = running && visible() ? now : null;
    };
    last.current = running && visible() ? performance.now() : null;
    const id = setInterval(flush, TICK_MS);
    const onVis = () => flush();
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('pagehide', onVis);
    return () => {
      flush();
      last.current = null;
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('pagehide', onVis);
    };
  }, [running]);

  /** いまの 値（つぎの 数えを またずに よむ） */
  const read = () => {
    if (last.current !== null) {
      const now = performance.now();
      msRef.current += Math.min(MAX_TICK_MS, Math.max(0, now - last.current));
      last.current = now;
    }
    return msRef.current;
  };
  const reset = (v = 0) => {
    msRef.current = v;
    last.current = last.current === null ? null : performance.now();
    setMs(v);
  };
  return { ms, read, reset };
}

/** 0:05・1:23・12:03 の ような 表示 */
export function formatClock(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}
