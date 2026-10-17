import { useEffect, useState } from 'react';

/**
 * Service Worker の登録と更新通知。
 * 新しい版は「待機」させ、ユーザーが押したときだけ切り替えて再読み込みする。
 * 記録は IndexedDB にあるので、アプリ本体の更新で消えない。
 */
let waiting: ServiceWorker | null = null;
const subs = new Set<(w: boolean) => void>();
const emit = () => subs.forEach((f) => f(waiting !== null));

export function registerServiceWorker() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('./sw.js')
      .then((reg) => {
        const track = (w: ServiceWorker | null) => {
          if (!w) return;
          w.addEventListener('statechange', () => {
            if (w.state === 'installed' && navigator.serviceWorker.controller) {
              waiting = w;
              emit();
            }
          });
        };
        if (reg.waiting && navigator.serviceWorker.controller) {
          waiting = reg.waiting;
          emit();
        }
        reg.addEventListener('updatefound', () => track(reg.installing));
      })
      .catch(() => {
        /* オフライン対応なしでも動く */
      });
  });
}

export function applyUpdate() {
  if (!waiting) return;
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloaded) return;
    reloaded = true;
    window.location.reload();
  });
  waiting.postMessage({ type: 'SKIP_WAITING' });
}

export function useUpdateAvailable(): boolean {
  const [w, setW] = useState(waiting !== null);
  useEffect(() => {
    subs.add(setW);
    return () => {
      subs.delete(setW);
    };
  }, []);
  return w;
}
