import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { bounds, centroid, coverage, placedTris, rotated, type Placement, type ShapesAnswer, type ShapesPuzzle, type Tri } from '../../domain/games/shapes';
import { play } from '../../audio/sfx';
import { IconRotate } from '../../components/Icons';
import type { GameViewProps } from '../types';
import { InDock } from '../../components/Dock';

interface Draft {
  placements: (Placement | null)[];
  rots: number[];
}

const triPoints = ([x, y, q]: Tri): string => {
  const c = `${x + 0.5},${y + 0.5}`;
  switch (q) {
    case 0:
      return `${x},${y} ${x + 1},${y} ${c}`;
    case 1:
      return `${x + 1},${y} ${x + 1},${y + 1} ${c}`;
    case 2:
      return `${x + 1},${y + 1} ${x},${y + 1} ${c}`;
    default:
      return `${x},${y + 1} ${x},${y} ${c}`;
  }
};

function Tris({ tris, fill, opacity = 1, stroke }: { tris: Tri[]; fill: string; opacity?: number; stroke?: string }) {
  return (
    <g opacity={opacity}>
      {tris.map((t, i) => (
        <polygon key={i} points={triPoints(t)} fill={fill} stroke={stroke ?? fill} strokeWidth={0.03} strokeLinejoin="round" />
      ))}
    </g>
  );
}

interface Drag {
  piece: number;
  /** つかんだ点からピースの左上までのずれ（マス単位） */
  grabX: number;
  grabY: number;
  startX: number;
  startY: number;
  x: number;
  y: number;
  moved: boolean;
  fromBoard: boolean;
}

export function ShapesView({ puzzle: p, submit, solved, status, draft, saveDraft }: GameViewProps<ShapesPuzzle, ShapesAnswer, Draft>) {
  const [placements, setPlacements] = useState<(Placement | null)[]>(() => draft?.placements ?? p.pieces.map(() => null));
  const [rots, setRots] = useState<number[]>(() => draft?.rots ?? [...p.initialRot]);
  const [selected, setSelected] = useState<number | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const boardRef = useRef<SVGSVGElement>(null);
  const [avail, setAvail] = useState(320);
  const [viewH, setViewH] = useState(() => (typeof window !== 'undefined' ? window.innerHeight : 700));
  const [dockH, setDockH] = useState(0);
  /** 盤面カードの上端（ページの先頭から）。見出しの高さに合わせて盤面を大きくするため */
  const [boardTop, setBoardTop] = useState(150);
  const boardCardRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const dock = wrapRef.current?.closest('main')?.querySelector<HTMLElement>('.dock');
    const update = () => {
      setViewH(window.visualViewport?.height ?? window.innerHeight);
      setDockH(dock?.offsetHeight ?? 0);
      const card = boardCardRef.current;
      if (card) setBoardTop(card.getBoundingClientRect().top + window.scrollY);
    };
    update();
    const ro = typeof ResizeObserver !== 'undefined' && dock ? new ResizeObserver(update) : null;
    if (dock) ro?.observe(dock);
    window.addEventListener('resize', update);
    return () => {
      ro?.disconnect();
      window.removeEventListener('resize', update);
    };
  }, []);
  const lastSubmitted = useRef('');

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const update = () => setAvail(el.clientWidth || 320);
    update();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(update) : null;
    ro?.observe(el);
    return () => ro?.disconnect();
  }, []);

  // 盤面は 横幅と「画面の高さ − 下の操作ドック − 盤面より上の部分 − 盤面の下の1行」の どちらにも 収まる大きさにする
  const maxH = Math.max(160, viewH - dockH - boardTop - 24 - 36);
  const cs = Math.max(28, Math.min(72, Math.floor((avail - 32) / (p.width + 0.3)), Math.floor(maxH / (p.height + 0.3))));
  const shapeOf = (i: number) => rotated(p.pieces[i].tris, rots[i]);

  const commit = (pl: (Placement | null)[], rs: number[]) => {
    setPlacements(pl);
    setRots(rs);
    saveDraft({ placements: pl, rots: rs });
    const ans: ShapesAnswer = pl.map((x, i) => (x ? { ...x, rot: rs[i] } : null));
    const sig = JSON.stringify(ans);
    if (ans.every((x) => x !== null) && sig !== lastSubmitted.current) {
      lastSubmitted.current = sig;
      submit(ans);
    }
  };

  const clampPlace = (i: number, x: number, y: number, rot = rots[i]): Placement => {
    const b = bounds(rotated(p.pieces[i].tris, rot));
    return { rot, x: Math.max(0, Math.min(p.width - b.w, x)), y: Math.max(0, Math.min(p.height - b.h, y)) };
  };

  const placeAtCenter = (i: number, cx: number, cy: number) => {
    // タップした点にピースの重心が来るように置く
    const c = centroid(shapeOf(i));
    const pl = clampPlace(i, Math.round(cx - c.x), Math.round(cy - c.y));
    play('move');
    commit(
      placements.map((x, k) => (k === i ? pl : x)),
      rots,
    );
  };

  const boardPoint = (clientX: number, clientY: number) => {
    const r = boardRef.current!.getBoundingClientRect();
    // viewBox は -0.15 から (幅 + 0.3) マスぶん
    return { x: ((clientX - r.left) / r.width) * (p.width + 0.3) - 0.15, y: ((clientY - r.top) / r.height) * (p.height + 0.3) - 0.15, inside: clientX >= r.left - 20 && clientX <= r.right + 20 && clientY >= r.top - 20 && clientY <= r.bottom + 20 };
  };

  // ドラッグ中はウィンドウ全体でポインタを追う
  useEffect(() => {
    if (!drag) return;
    const move = (e: PointerEvent) => {
      setDrag((d) => (d ? { ...d, x: e.clientX, y: e.clientY, moved: d.moved || Math.hypot(e.clientX - d.startX, e.clientY - d.startY) > 8 } : d));
    };
    const up = (e: PointerEvent) => {
      const d = drag;
      setDrag(null);
      if (!d) return;
      if (!d.moved) {
        // えらんでいるピースの上をタップしたら、そこへ置き直す
        if (d.fromBoard && selected === d.piece) {
          const bp = boardPoint(e.clientX, e.clientY);
          placeAtCenter(d.piece, bp.x, bp.y);
          return;
        }
        setSelected((s) => (s === d.piece ? (d.fromBoard ? d.piece : null) : d.piece));
        return;
      }
      const bp = boardPoint(e.clientX, e.clientY);
      if (bp.inside) {
        const pl = clampPlace(d.piece, Math.round(bp.x - d.grabX), Math.round(bp.y - d.grabY));
        play('move');
        commit(
          placements.map((x, k) => (k === d.piece ? pl : x)),
          rots,
        );
      } else {
        commit(
          placements.map((x, k) => (k === d.piece ? null : x)),
          rots,
        );
      }
      setSelected(d.piece);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
  });

  const startDrag = (e: RPointerEvent, i: number, fromBoard: boolean) => {
    if (solved) return;
    e.preventDefault();
    e.stopPropagation();
    const c = centroid(shapeOf(i));
    let grabX = c.x;
    let grabY = c.y;
    if (fromBoard && placements[i]) {
      const bp = boardPoint(e.clientX, e.clientY);
      grabX = bp.x - placements[i]!.x;
      grabY = bp.y - placements[i]!.y;
    }
    setDrag({ piece: i, grabX, grabY, startX: e.clientX, startY: e.clientY, x: e.clientX, y: e.clientY, moved: false, fromBoard });
  };

  const rotateSelected = () => {
    if (selected === null || solved) return;
    const i = selected;
    const rs = rots.map((r, k) => (k === i ? (r + 1) % 4 : r));
    const pl = placements.map((x, k) => (k === i && x ? clampPlace(i, x.x, x.y, rs[i]) : x));
    play('tap');
    commit(pl, rs);
  };

  const returnSelected = () => {
    if (selected === null || solved) return;
    commit(
      placements.map((x, k) => (k === selected ? null : x)),
      rots,
    );
  };

  const cov = coverage(
    p,
    placements.map((x, i) => (x ? { ...x, rot: rots[i] } : null)),
  );

  const onBoardTap = (e: RPointerEvent<SVGSVGElement>) => {
    if (solved || selected === null || drag) return;
    const bp = boardPoint(e.clientX, e.clientY);
    placeAtCenter(selected, bp.x, bp.y);
  };

  return (
    <section className="stack" ref={wrapRef}>
      {/* もんだいの なまえ（p.title）は 出さない：かげの形が なまえに にていないと まよう もとになるため */}
      <div className="center-text">
        <strong className="phrase">ピースを えらんで</strong> <strong className="phrase">かげと おなじ かたちを つくろう！</strong>
      </div>
      <div ref={boardCardRef} className="card" style={{ display: 'flex', justifyContent: 'center', padding: 12, touchAction: drag ? 'none' : 'auto' }}>
        <svg
          ref={boardRef}
          viewBox={`-0.15 -0.15 ${p.width + 0.3} ${p.height + 0.3}`}
          width={(p.width + 0.3) * cs}
          height={(p.height + 0.3) * cs}
          role="img"
          aria-label={`かげの かたち。${p.pieces.length}この ピースのうち ${placements.filter(Boolean).length}こ おいた`}
          onPointerUp={onBoardTap}
          style={{ touchAction: 'none', maxWidth: '100%', height: 'auto' }}
        >
          {Array.from({ length: p.width + 1 }, (_, x) => (
            <line key={`v${x}`} x1={x} y1={0} x2={x} y2={p.height} stroke="#e3ebf2" strokeWidth={0.02} />
          ))}
          {Array.from({ length: p.height + 1 }, (_, y) => (
            <line key={`h${y}`} x1={0} y1={y} x2={p.width} y2={y} stroke="#e3ebf2" strokeWidth={0.02} />
          ))}
          <Tris tris={p.silhouette.map((k) => k.split(',').map(Number) as Tri)} fill="#c3cfdb" />
          {p.showGuide && p.solution.map((pl, i) => <Tris key={`g${i}`} tris={placedTris(p.pieces[i], pl)} fill={p.pieces[i].color} opacity={0.22} />)}
          {placements.map((pl, i) =>
            pl && !(drag?.piece === i && drag.moved) ? (
              <g key={i} onPointerDown={(e) => startDrag(e, i, true)} style={{ cursor: solved ? 'default' : 'grab' }}>
                <Tris tris={placedTris(p.pieces[i], { ...pl, rot: rots[i] })} fill={p.pieces[i].color} opacity={0.92} stroke={selected === i ? '#1b2838' : undefined} />
              </g>
            ) : null,
          )}
        </svg>
      </div>
      <div className="small muted center-text" aria-live="polite">
        うまった ところ：{Math.round((cov.covered / cov.total) * 100)}%{cov.overlap ? '・かさなりが あるよ' : ''}
      </div>
      {status}
      <InDock>
      <div className="row center" aria-label="ピース" style={{ gap: 6 }}>
        {p.pieces.map((pc, i) => {
          const t = shapeOf(i);
          const b = bounds(t);
          const s = 24; // 盤面の大きさに連動させない（ドックの高さ→盤面→ドック…の循環を防ぐ）
          const placed = placements[i] !== null;
          return (
            <button
              key={pc.id}
              type="button"
              className="btn"
              aria-label={`${pc.name}${placed ? '（おいてある）' : ''}${selected === i ? '（えらんでいる）' : ''}`}
              aria-pressed={selected === i}
              onPointerDown={(e) => startDrag(e, i, false)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setSelected(selected === i ? null : i);
                }
              }}
              style={{ padding: 3, borderRadius: 12, borderColor: selected === i ? '#1b2838' : undefined, borderWidth: selected === i ? 3 : 2, opacity: placed ? 0.4 : 1, touchAction: 'none', minWidth: 52, minHeight: 52 }}
            >
              <svg viewBox={`-0.1 -0.1 ${b.w + 0.2} ${b.h + 0.2}`} width={(b.w + 0.2) * s} height={(b.h + 0.2) * s} aria-hidden>
                <Tris tris={t} fill={pc.color} />
              </svg>
            </button>
          );
        })}
      </div>
      <div className="row center" style={{ flexWrap: 'nowrap' }}>
        {p.allowRotate && (
          <button type="button" className="btn" onClick={rotateSelected} disabled={selected === null || solved}>
            <span style={{ width: 26, height: 26, display: 'inline-flex' }}>
              <IconRotate />
            </span>
            まわす
          </button>
        )}
        <button type="button" className="btn" onClick={returnSelected} disabled={selected === null || placements[selected] === null || solved}>
          もどす
        </button>
      </div>
      </InDock>
      {drag?.moved && (
        <div
          aria-hidden
          style={{
            position: 'fixed',
            left: drag.x - drag.grabX * cs,
            top: drag.y - drag.grabY * cs,
            pointerEvents: 'none',
            zIndex: 40,
            opacity: 0.85,
          }}
        >
          <svg viewBox={`0 0 ${bounds(shapeOf(drag.piece)).w} ${bounds(shapeOf(drag.piece)).h}`} width={bounds(shapeOf(drag.piece)).w * cs} height={bounds(shapeOf(drag.piece)).h * cs}>
            <Tris tris={shapeOf(drag.piece)} fill={p.pieces[drag.piece].color} />
          </svg>
        </div>
      )}
    </section>
  );
}
