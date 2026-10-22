import { useLayoutEffect, useRef, useState } from 'react';

/**
 * 要素の 上端から 下の 操作ドックの 上までの 高さと、親の 幅（px）。
 * 絵の 大きさを 画面に あわせて きめるのに つかう（ドックに かくれないように）。
 */
export function useRoom<T extends Element>(fallback = { width: 320, height: 360 }) {
  const ref = useRef<T>(null);
  const [room, setRoom] = useState(fallback);

  useLayoutEffect(() => {
    const el = ref.current;
    const host = el?.parentElement;
    if (!el || !host) return;
    const dock = document.querySelector<HTMLElement>('[data-testid="dock"]');
    const calc = () => {
      const viewH = window.visualViewport?.height ?? window.innerHeight;
      const top = el.getBoundingClientRect().top + window.scrollY;
      const width = Math.floor(host.clientWidth);
      const height = Math.floor(viewH - top - (dock?.offsetHeight ?? 0) - 12);
      setRoom((r) => (r.width === width && r.height === height ? r : { width, height }));
    };
    calc();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(calc) : null;
    ro?.observe(host);
    if (dock) ro?.observe(dock);
    window.addEventListener('resize', calc);
    window.visualViewport?.addEventListener('resize', calc);
    return () => {
      ro?.disconnect();
      window.removeEventListener('resize', calc);
      window.visualViewport?.removeEventListener('resize', calc);
    };
  }, []);

  return { ref, ...room };
}
