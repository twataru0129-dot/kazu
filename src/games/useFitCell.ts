import { useLayoutEffect, useRef, useState } from 'react';

/**
 * 盤面の1マスの大きさ（px）を、画面に合わせて決める。
 * - 横：盤面の親の幅に n マス（＋すきま）が入る大きさ
 * - 縦：盤面の上端から、下の操作ドックの上までに入る大きさ（ドックに隠れないように）
 * （rows を わたすと 縦は rows マス。pad は 盤面の まわりの 余白 px）
 * どちらも満たす いちばん大きい値を、min〜max の範囲で使う。
 * 小さい画面で縦に入りきらないときも min（押しやすさ）を優先し、そのときはスクロールで見る。
 */
export function useFitCell<T extends Element>(n: number, { min, max, gap = 0, rows = n, pad = 0 }: { min: number; max: number; gap?: number; rows?: number; pad?: number }) {
  const ref = useRef<T>(null);
  const [cell, setCell] = useState(min);

  useLayoutEffect(() => {
    const el = ref.current;
    const host = el?.parentElement;
    if (!el || !host) return;
    const dock = document.querySelector<HTMLElement>('[data-testid="dock"]');
    const calc = () => {
      const viewH = window.visualViewport?.height ?? window.innerHeight;
      const top = el.getBoundingClientRect().top + window.scrollY;
      const byWidth = (host.clientWidth - pad * 2 - gap * (n - 1)) / n;
      const byHeight = (viewH - top - (dock?.offsetHeight ?? 0) - 12 - pad * 2 - gap * (rows - 1)) / rows;
      const next = Math.floor(Math.max(min, Math.min(max, byWidth, byHeight)));
      setCell((c) => (c === next ? c : next));
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
  }, [n, min, max, gap, rows, pad]);

  return { ref, cell };
}
