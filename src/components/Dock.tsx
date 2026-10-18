import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/**
 * 操作ドック：数字キーと、その時の主な操作（こたえる・つぎへ など）を画面の下にまとめて置く。
 * position: sticky で本文の最後に置くので、本文の最後の行を隠さない。
 * iPhone Safari の下のツールバーやホームバーに重ならないよう、
 * safe-area と visualViewport から求めた「見えていない下の部分」の分だけ余白をとる。
 */
const DockSlot = createContext<HTMLElement | null | undefined>(undefined);

export function DockLayout({ children, footer }: { children: ReactNode; footer?: ReactNode }) {
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  const dockRef = useRef<HTMLDivElement>(null);
  useVisualViewportGap();
  useLayoutEffect(() => {
    const el = dockRef.current;
    if (!el) return;
    const set = () => document.documentElement.style.setProperty('--dock-h', `${el.offsetHeight}px`);
    set();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(set) : null;
    ro?.observe(el);
    return () => {
      ro?.disconnect();
      document.documentElement.style.setProperty('--dock-h', '0px');
    };
  }, []);
  return (
    <DockSlot.Provider value={slot}>
      {children}
      <div className="dock" ref={dockRef} data-testid="dock">
        <div className="dock-slot" ref={setSlot} />
        {footer && <div className="dock-footer">{footer}</div>}
      </div>
    </DockSlot.Provider>
  );
}

/** ドックの中に表示する（ドックの無い画面では、その場に表示） */
export function InDock({ children }: { children: ReactNode }) {
  const slot = useContext(DockSlot);
  if (slot === undefined) return <>{children}</>;
  if (slot === null) return null;
  return createPortal(children, slot);
}

/**
 * ブラウザの表示領域（visualViewport）が、レイアウト上の画面より下で切れている分を CSS 変数 --vv-gap に入れる。
 * 下のツールバーが本文に重なるブラウザでも、ドックがその上に来るようにするため。
 */
function useVisualViewportGap() {
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => {
      const gap = Math.max(0, Math.round(window.innerHeight - (vv.height + vv.offsetTop)));
      // ピンチで拡大しているときは無視する
      document.documentElement.style.setProperty('--vv-gap', `${vv.scale > 1.01 ? 0 : Math.min(gap, 200)}px`);
    };
    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
      document.documentElement.style.setProperty('--vv-gap', '0px');
    };
  }, []);
}
