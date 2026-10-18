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

export function PatternView({ puzzle: p, submit, solved, status, hintLevel }: GameViewProps<PatternPuzzle, Token | null>) {
  const unit = p.shapeUnit.length;
  const tile = 'clamp(38px, 11vw, 56px)';
  return (
    <section className="stack">
      <div className="card">
        <div className="center-text muted">？に はいるのは どれ？</div>
        <div className="row center" style={{ gap: 4, marginTop: 8 }} aria-label="ならび">
          {p.sequence.map((t, i) => {
            const groupBg = hintLevel >= 2 && Math.floor(i / unit) % 2 === 0 ? '#fff6d6' : 'transparent';
            return (
              <span key={i} style={{ width: tile, height: tile, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: groupBg, borderRadius: 8 }}>
                {i === p.hidden && !solved ? (
                  <span className="num" style={{ width: '90%', height: '90%', border: '3px dashed #7a55c8', borderRadius: 10, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#7a55c8', fontSize: '1.5rem' }} aria-label="はてな">
                    ?
                  </span>
                ) : (
                  <TokenIcon t={t} size={44} />
                )}
              </span>
            );
          })}
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
