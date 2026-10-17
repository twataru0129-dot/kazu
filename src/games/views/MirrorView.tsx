import { useEffect, useState } from 'react';
import { emptyRight, mismatches, type MirrorAnswer, type MirrorPuzzle } from '../../domain/games/mirror';
import { play } from '../../audio/sfx';
import type { GameViewProps } from '../types';

/** 色だけに頼らないよう、色ごとに模様も変える */
export const PAINT = [
  null,
  { fill: '#4a7fd6', pattern: 'dots', label: 'あお（てんてん）' },
  { fill: '#ef7d57', pattern: 'stripes', label: 'オレンジ（しましま）' },
] as const;

function CellPaint({ v }: { v: number }) {
  const p = PAINT[v];
  if (!p) return null;
  return (
    <svg viewBox="0 0 20 20" width="100%" height="100%" aria-hidden style={{ display: 'block' }}>
      <rect x="0" y="0" width="20" height="20" fill={p.fill} />
      {p.pattern === 'dots' && [5, 15].flatMap((x) => [5, 15].map((y) => <circle key={`${x}${y}`} cx={x} cy={y} r="2.2" fill="#fff" opacity=".8" />))}
      {p.pattern === 'stripes' && <path d="M-2 6 L6 -2 M-2 14 L14 -2 M-2 22 L22 -2 M6 22 L22 6 M14 22 L22 14" stroke="#fff" strokeWidth="2.2" opacity=".75" />}
    </svg>
  );
}

export function MirrorView({ puzzle: p, submit, solved, status, draft, saveDraft, reportProgress, hintLevel }: GameViewProps<MirrorPuzzle, MirrorAnswer, { right: number[][] }>) {
  const [right, setRight] = useState<number[][]>(() => draft?.right ?? emptyRight(p));
  const [brush, setBrush] = useState(1);
  const half = p.size / 2;
  const flash = hintLevel >= 3 ? mismatches(p, right)[0] : undefined;

  useEffect(() => reportProgress(right), [right, reportProgress]);

  const tap = (r: number, c: number) => {
    if (solved) return;
    play('tap');
    const next = right.map((row) => [...row]);
    next[r][c] = next[r][c] === brush ? 0 : brush;
    setRight(next);
    saveDraft({ right: next });
  };

  const cellPx = `clamp(30px, calc((min(100vw, 720px) - 48px) / ${p.size}), 56px)`;
  return (
    <section className="stack">
      <p className="center-text small muted" style={{ margin: 0 }}>
        オレンジの せんが かがみ。ひだりと ぴったり おなじに なるように みぎを ぬろう。
      </p>
      {p.colors > 1 && (
        <div className="row center" role="radiogroup" aria-label="いろ">
          {[1, 2].map((k) => (
            <button key={k} type="button" role="radio" aria-checked={brush === k} className="chip" aria-pressed={brush === k} onClick={() => setBrush(k)}>
              <span style={{ width: 24, height: 24, display: 'inline-block', borderRadius: 6, overflow: 'hidden', verticalAlign: 'middle' }}>
                <CellPaint v={k} />
              </span>{' '}
              {PAINT[k]!.label}
            </button>
          ))}
        </div>
      )}
      <div style={{ overflowX: 'auto', paddingBottom: 4 }}>
        <div role="grid" aria-label="かがみの ほうがん" style={{ display: 'grid', gridTemplateColumns: `repeat(${p.size}, ${cellPx})`, justifyContent: 'center', gap: 2, width: 'max-content', margin: '0 auto' }}>
          {Array.from({ length: p.size }, (_, r) =>
            Array.from({ length: p.size }, (_, c) => {
              const isLeft = c < half;
              const v = isLeft ? p.left[r][c] : right[r][c - half];
              const flashMe = flash && flash[0] === r && (c - half === flash[1] || c === half - 1 - flash[1]);
              const common = {
                width: cellPx,
                height: cellPx,
                padding: 0,
                border: flashMe ? '3px solid #f4b400' : '1px solid #c6d6e4',
                marginLeft: c === half ? 4 : 0,
                boxShadow: c === half ? '-5px 0 0 -1px #f07a2a' : undefined,
                overflow: 'hidden',
                borderRadius: 4,
              } as const;
              return isLeft ? (
                <div key={c} role="gridcell" aria-label={`ひだり ${r + 1}ぎょう ${c + 1}れつ ${v ? 'ぬってある' : 'しろ'}`} style={{ ...common, background: '#e9eef4' }}>
                  <CellPaint v={v} />
                </div>
              ) : (
                <button key={c} type="button" role="gridcell" onClick={() => tap(r, c - half)} aria-label={`みぎ ${r + 1}ぎょう ちゅうしんから ${c - half + 1}マスめ ${v ? 'ぬってある' : 'しろ'}`} style={{ ...common, background: '#fff' }} className={flashMe ? 'pop' : ''}>
                  <CellPaint v={v} />
                </button>
              );
            }),
          )}
        </div>
      </div>
      {status}
      <div className="row center">
        <button
          type="button"
          className="btn"
          onClick={() => {
            const e = emptyRight(p);
            setRight(e);
            saveDraft({ right: e });
          }}
          disabled={solved}
        >
          ぜんぶ けす
        </button>
        <button type="button" className="btn primary big" onClick={() => submit(right)} disabled={solved}>
          こたえあわせ
        </button>
      </div>
    </section>
  );
}
