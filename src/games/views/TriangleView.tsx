import { useEffect, useState } from 'react';
import { emptyTriangleBoard, nextTriState, TRI_LABEL, TRI_POINTS, triangleMismatches, type TriangleAnswer, type TrianglePuzzle } from '../../domain/games/triangle';
import { play } from '../../audio/sfx';
import { InDock } from '../../components/Dock';
import type { GameViewProps } from '../types';
import { useFitCell } from '../useFitCell';

export function TriShape({ v, color = '#4a7fd6' }: { v: number; color?: string }) {
  const pts = TRI_POINTS[v];
  return (
    <svg viewBox="0 0 1 1" width="100%" height="100%" aria-hidden style={{ display: 'block' }} preserveAspectRatio="none">
      {pts && <polygon points={pts} fill={color} />}
    </svg>
  );
}

const pos = (r: number, c: number) => `うえから ${r + 1}ばんめ ひだりから ${c + 1}ばんめ`;

export function TriangleView({ puzzle: p, submit, solved, status, draft, saveDraft, reportProgress, hintLevel }: GameViewProps<TrianglePuzzle, TriangleAnswer, { board: number[][] }>) {
  const [board, setBoard] = useState<number[][]>(() => draft?.board ?? emptyTriangleBoard(p.size));
  const [history, setHistory] = useState<number[][][]>([]);
  const flash = hintLevel >= 3 ? triangleMismatches(p, board)[0] : undefined;

  useEffect(() => reportProgress(board), [board, reportProgress]);

  const update = (next: number[][], pushHistory = true) => {
    if (pushHistory) setHistory((h) => [...h.slice(-49), board]);
    setBoard(next);
    saveDraft({ board: next });
  };

  const tap = (r: number, c: number) => {
    if (solved) return;
    play('tap');
    update(board.map((row, i) => (i === r ? row.map((v, j) => (j === c ? nextTriState(v) : v)) : row)));
  };

  const undo = () => {
    const prev = history.at(-1);
    if (!prev) return;
    setHistory((h) => h.slice(0, -1));
    update(prev, false);
  };

  const { ref: boardRef, cell } = useFitCell<HTMLDivElement>(p.size, { min: 48, max: 76, gap: 3 });
  const sampleCell = Math.max(16, Math.min(34, Math.floor(110 / p.size)));
  const grid = (px: number) => ({ display: 'grid', gridTemplateColumns: `repeat(${p.size}, ${px}px)`, gap: 3, width: 'max-content' }) as const;

  return (
    <section className="stack">
      <div className="card row" style={{ gap: 12, padding: 10, justifyContent: 'center', alignItems: 'flex-start', flexWrap: 'nowrap' }}>
        <div className="stack" style={{ gap: 4, alignItems: 'center' }}>
          <strong className="small">みほん</strong>
          <div role="img" aria-label={`みほん：${p.target.map((row, r) => row.map((v, c) => `${pos(r, c)} ${TRI_LABEL[v]}`).join('、')).join('、')}`} style={grid(sampleCell)}>
            {p.target.flatMap((row, r) =>
              row.map((v, c) => (
                <div key={`${r}-${c}`} data-state={v} style={{ width: sampleCell, height: sampleCell, border: '1px solid #c6d6e4', background: '#fff', borderRadius: 3, overflow: 'hidden' }}>
                  <TriShape v={v} color="#7a55c8" />
                </div>
              )),
            )}
          </div>
        </div>
        <div className="stack" style={{ gap: 4, alignItems: 'center' }} aria-label="タップすると この じゅんに かわるよ">
          <span className="small muted">タップで かわる じゅん</span>
          <ol style={{ display: 'grid', gridTemplateColumns: 'repeat(3, auto)', gap: '4px 6px', listStyle: 'none', margin: 0, padding: 0 }}>
            {[0, 1, 2, 3, 4, 5].map((v) => (
              <li key={v} className="row" style={{ gap: 2, flexWrap: 'nowrap' }} aria-label={`${v + 1}. ${TRI_LABEL[v]}`}>
                <span className="small muted" aria-hidden>
                  {v + 1}
                </span>
                <span style={{ width: 22, height: 22, display: 'inline-block', border: '1px solid #9fb3c6', background: '#fff' }}>
                  <TriShape v={v} />
                </span>
              </li>
            ))}
          </ol>
        </div>
      </div>
      <div ref={boardRef} role="grid" aria-label="きみの ばん" style={{ ...grid(cell), margin: '0 auto' }}>
        {board.flatMap((row, r) =>
          row.map((v, c) => {
            const flashMe = flash && flash[0] === r && flash[1] === c;
            return (
              <button
                key={`${r}-${c}`}
                type="button"
                role="gridcell"
                className={flashMe ? 'pop' : ''}
                onClick={() => tap(r, c)}
                aria-label={`${pos(r, c)}：${TRI_LABEL[v]}`}
                style={{ width: cell, height: cell, padding: 0, background: '#fff', border: flashMe ? '4px solid #f4b400' : '2px solid #c6d6e4', borderRadius: 6, overflow: 'hidden' }}
              >
                <TriShape v={v} />
              </button>
            );
          }),
        )}
      </div>
      {status}
      <InDock>
        <div className="row center" style={{ flexWrap: 'nowrap' }}>
          <button type="button" className="btn" onClick={undo} disabled={solved || history.length === 0}>
            もどす
          </button>
          <button type="button" className="btn" onClick={() => update(emptyTriangleBoard(p.size))} disabled={solved}>
            ぜんぶ けす
          </button>
          <button type="button" className="btn primary big" onClick={() => submit(board)} disabled={solved}>
            こたえあわせ
          </button>
        </div>
      </InDock>
    </section>
  );
}
