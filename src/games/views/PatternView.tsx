import { useLayoutEffect, useRef, useState } from 'react';
import type { ColorKind, PatternPuzzle, ShapeKind, Token } from '../../domain/games/pattern';
import { sameToken } from '../../domain/games/pattern';
import type { GameViewProps } from '../types';
import { InDock } from '../../components/Dock';

const COLOR: Record<ColorKind, string> = { red: '#e8504f', blue: '#3d7fd9', yellow: '#f2b705', green: '#2fa36b' };
const COLOR_NAME: Record<ColorKind, string> = { red: 'あか', blue: 'あお', yellow: 'きいろ', green: 'みどり' };
const SHAPE_NAME: Record<ShapeKind, string> = { circle: 'まる', triangle: 'さんかく', square: 'しかく', star: 'ほし', heart: 'ハート', diamond: 'ひしがた' };

const PATH: Record<ShapeKind, string> = {
  circle: 'M24 6a18 18 0 1 0 0.01 0Z',
  triangle: 'M24 5 L43 40 H5 Z',
  square: 'M7 7 H41 V41 H7 Z',
  star: 'M24 4 L29.5 17.5 L44 18 L32.5 27 L36.5 42 L24 33.5 L11.5 42 L15.5 27 L4 18 L18.5 17.5 Z',
  heart: 'M24 42 C6 30 4 18 10 11 C16 5 23 9 24 14 C25 9 32 5 38 11 C44 18 42 30 24 42 Z',
  diamond: 'M24 3 L43 24 L24 45 L5 24 Z',
};

/** 形＋色＋模様（色が見分けにくくても模様で区別できる） */
export function TokenIcon({ t, size = 48 }: { t: Token; size?: number }) {
  const id = `pat-${t.color}`;
  return (
    <svg viewBox="0 0 48 48" width={size} height={size} role="img" aria-label={`${COLOR_NAME[t.color]}の ${SHAPE_NAME[t.shape]}`}>
      <defs>
        <pattern id={`${id}-dots`} width="8" height="8" patternUnits="userSpaceOnUse">
          <circle cx="4" cy="4" r="1.8" fill="#fff" opacity=".8" />
        </pattern>
        <pattern id={`${id}-stripes`} width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="3" height="8" fill="#fff" opacity=".6" />
        </pattern>
        <pattern id={`${id}-grid`} width="8" height="8" patternUnits="userSpaceOnUse">
          <path d="M0 4 H8 M4 0 V8" stroke="#fff" strokeWidth="1.4" opacity=".6" />
        </pattern>
      </defs>
      <path d={PATH[t.shape]} fill={COLOR[t.color]} stroke="#1b2838" strokeWidth="2" strokeLinejoin="round" />
      {t.color === 'blue' && <path d={PATH[t.shape]} fill={`url(#${id}-dots)`} />}
      {t.color === 'yellow' && <path d={PATH[t.shape]} fill={`url(#${id}-stripes)`} />}
      {t.color === 'green' && <path d={PATH[t.shape]} fill={`url(#${id}-grid)`} />}
    </svg>
  );
}

/** ならびの 1マスの大きさ（px）と すきま */
const TILE_MIN = 52;
const TILE_MAX = 64;
const GAP = 6;

/**
 * ならびを 何列で 並べるか。1マスが TILE_MIN 以上になる 列数のうち いちばん多いものにし、
 * 行の数が同じなら 各行の マスの数を そろえる（例：6こ → 3＋3、7こ → 4＋3、8こ → 4＋4）。
 */
export function patternColumns(count: number, width: number): number {
  const fit = Math.max(1, Math.floor((width + GAP) / (TILE_MIN + GAP)));
  if (fit >= count) return count;
  const rows = Math.ceil(count / fit);
  return Math.ceil(count / rows);
}

export function patternQuestion(p: Pick<PatternPuzzle, 'sequence' | 'hidden'>): string {
  return p.hidden === p.sequence.length - 1 ? 'つぎに くるのは どれ？' : '？に はいるのは どれ？';
}

export function PatternView({ puzzle: p, submit, solved, status, hintLevel }: GameViewProps<PatternPuzzle, Token | null>) {
  const unit = p.shapeUnit.length;
  const gridRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(288);
  useLayoutEffect(() => {
    const el = gridRef.current;
    if (!el) return;
    const update = () => setWidth(el.clientWidth || 288);
    update();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(update) : null;
    ro?.observe(el);
    return () => ro?.disconnect();
  }, []);
  const cols = patternColumns(p.sequence.length, width);
  const rows = Math.ceil(p.sequence.length / cols);
  const tile = Math.max(TILE_MIN, Math.min(TILE_MAX, Math.floor((width - GAP * (cols - 1)) / cols)));
  return (
    <section className="stack">
      <div className="card">
        <div className="center-text" style={{ fontWeight: 700 }}>
          {patternQuestion(p)}
        </div>
        {rows > 1 && (
          <div className="center-text small muted" style={{ marginTop: 2 }}>
            ひだりから みぎへ、つぎの だんへ つづくよ
          </div>
        )}
        <div ref={gridRef} style={{ marginTop: 8 }}>
          <ol
            aria-label="ならび"
            data-cols={cols}
            style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, ${tile}px)`, gap: GAP, justifyContent: 'center', listStyle: 'none', margin: 0, padding: 0 }}
          >
            {p.sequence.map((t, i) => {
              const groupBg = hintLevel >= 2 && Math.floor(i / unit) % 2 === 0 ? '#fff6d6' : '#f6f9fc';
              const isQ = i === p.hidden && !solved;
              return (
                <li
                  key={i}
                  data-index={i}
                  data-hidden={i === p.hidden ? 'true' : undefined}
                  style={{ width: tile, height: tile, display: 'flex', alignItems: 'center', justifyContent: 'center', background: groupBg, borderRadius: 10 }}
                >
                  {isQ ? (
                    <span
                      className="num"
                      style={{ width: '92%', height: '92%', border: '3px dashed #7a55c8', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#7a55c8', fontSize: '2rem', fontWeight: 800, background: '#fff' }}
                      aria-label="はてな"
                    >
                      ?
                    </span>
                  ) : (
                    <TokenIcon t={t} size={tile - 10} />
                  )}
                </li>
              );
            })}
          </ol>
        </div>
      </div>
      {status}
      <InDock>
      <div className="row center" role="group" aria-label="せんたくし" style={{ flexWrap: 'nowrap', gap: 6 }}>
        {p.options.map((o, i) => (
          <button
            key={i}
            type="button"
            className="btn"
            style={{ flex: '1 1 0', maxWidth: 84, minWidth: 0, height: 76, padding: 0, borderRadius: 18, borderColor: solved && sameToken(o, p.sequence[p.hidden]) ? '#1f9d6a' : undefined }}
            onClick={() => submit(o)}
            disabled={solved}
          >
            <TokenIcon t={o} size={56} />
          </button>
        ))}
      </div>
      </InDock>
    </section>
  );
}
