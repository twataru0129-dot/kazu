import { useRef, useState } from 'react';
import { isLabeled, ratioOf, snapRatio, tickCount, tickValue, type NumberLinePuzzle } from '../../domain/games/numberline';
import { play } from '../../audio/sfx';
import type { GameViewProps } from '../types';

export function NumberLineView({ puzzle: p, submit, solved, status }: GameViewProps<NumberLinePuzzle, number | null>) {
  const [marker, setMarker] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const dragging = useRef(false);
  const n = tickCount(p);
  const width = Math.max(300, n * 28);
  const fits = n * 28 <= 300;
  const pad = 28;
  const lineW = width - pad * 2;
  const xOf = (v: number) => pad + ratioOf(p, v) * lineW;

  const setFromClient = (clientX: number) => {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * width;
    const v = snapRatio(p, (x - pad) / lineW);
    if (v !== marker) play('tap');
    setMarker(v);
  };
  const stepBy = (k: number) => {
    const idx = marker === null ? Math.floor(n / 2) : Math.round((marker - p.min) / p.step) + k;
    setMarker(tickValue(p, Math.max(0, Math.min(n - 1, idx))));
    play('tap');
  };

  return (
    <section className="stack">
      <div className="card center-text">
        <div className="muted">この かずは どこ？</div>
        <div className="big-expr">{p.target}</div>
        <div className="small muted">せんの うえを タップするか、マーカーを うごかしてね（1めもり {p.step}）</div>
      </div>
      <div className="card" style={{ padding: '8px 0' }}>
        <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
          <svg
            ref={svgRef}
            viewBox={`0 0 ${width} 130`}
            width={fits ? '100%' : width}
            height={130}
            style={{ touchAction: 'pan-x', display: 'block', minWidth: fits ? undefined : '100%' }}
            role="slider"
            aria-label="すうちょくせん"
            aria-valuemin={p.min}
            aria-valuemax={p.max}
            aria-valuenow={marker ?? undefined}
            aria-valuetext={marker === null ? 'まだ おいていない' : 'マーカーを おいた'}
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'ArrowLeft') stepBy(-1);
              if (e.key === 'ArrowRight') stepBy(1);
              if (e.key === 'Enter' && marker !== null && !solved) submit(marker);
            }}
            onPointerDown={(e) => {
              if (solved) return;
              dragging.current = true;
              (e.target as Element).setPointerCapture?.(e.pointerId);
              setFromClient(e.clientX);
            }}
            onPointerMove={(e) => dragging.current && !solved && setFromClient(e.clientX)}
            onPointerUp={() => (dragging.current = false)}
            onPointerCancel={() => (dragging.current = false)}
          >
            <rect x="0" y="0" width={width} height="130" fill="transparent" />
            <line x1={pad - 10} y1="70" x2={width - pad + 10} y2="70" stroke="#1b2838" strokeWidth="4" strokeLinecap="round" />
            {Array.from({ length: n }, (_, i) => {
              const v = tickValue(p, i);
              const lab = isLabeled(p, v);
              const x = xOf(v);
              return (
                <g key={v}>
                  <line x1={x} y1={lab ? 54 : 60} x2={x} y2={lab ? 86 : 80} stroke="#1b2838" strokeWidth={lab ? 3 : 2} />
                  {lab && (
                    <text x={x} y="110" textAnchor="middle" fontSize="18" fontWeight="800" fill="#1b2838">
                      {v}
                    </text>
                  )}
                </g>
              );
            })}
            {marker !== null && (
              <g style={{ transition: 'transform .15s' }} transform={`translate(${xOf(marker)} 0)`}>
                <path d="M0 52 L-12 30 L12 30 Z" fill={solved ? '#1f9d6a' : '#f07a2a'} />
                <circle cx="0" cy="22" r="12" fill={solved ? '#1f9d6a' : '#f07a2a'} />
                {solved && (
                  <text x="0" y="27" textAnchor="middle" fontSize="13" fontWeight="800" fill="#fff">
                    {marker}
                  </text>
                )}
              </g>
            )}
          </svg>
        </div>
      </div>
      {status}
      <div className="row center">
        <button type="button" className="btn big" onClick={() => stepBy(-1)} disabled={solved} aria-label="ひだりへ 1めもり">
          ◀
        </button>
        <button type="button" className="btn primary big" onClick={() => marker !== null && submit(marker)} disabled={solved || marker === null}>
          ここに する
        </button>
        <button type="button" className="btn big" onClick={() => stepBy(1)} disabled={solved} aria-label="みぎへ 1めもり">
          ▶
        </button>
      </div>
    </section>
  );
}
