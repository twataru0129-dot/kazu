import { useEffect, useState } from 'react';
import { boxOf, colOf, conflicts, rowOf, sudokuHintCell, type SudokuAnswer, type SudokuPuzzle } from '../../domain/games/sudoku';
import { play } from '../../audio/sfx';
import type { GameViewProps } from '../types';
import { InDock } from '../../components/Dock';

interface Draft {
  grid: number[];
  checked: boolean;
}

export function SudokuView({ puzzle: p, submit, solved, status, draft, saveDraft, reportProgress, hintLevel }: GameViewProps<SudokuPuzzle, SudokuAnswer, Draft>) {
  const [grid, setGrid] = useState<number[]>(() => draft?.grid ?? [...p.givens]);
  const [sel, setSel] = useState<number>(() => p.givens.findIndex((v) => v === 0));
  const [checked, setChecked] = useState(draft?.checked ?? false);
  const bad = checked ? new Set(conflicts(grid)) : new Set<number>();
  const hintCell = hintLevel >= 2 ? sudokuHintCell(p, grid) : -1;
  const hintRow = hintLevel >= 1 ? rowOf(sudokuHintCell(p, grid)) : -1;

  useEffect(() => reportProgress(grid), [grid, reportProgress]);

  const setCell = (v: number) => {
    if (solved || sel < 0 || p.givens[sel] !== 0) return;
    play('tap');
    const g = grid.map((x, i) => (i === sel ? v : x));
    setGrid(g);
    setChecked(false);
    saveDraft({ grid: g, checked: false });
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (/^[1-4]$/.test(e.key)) setCell(Number(e.key));
      else if (e.key === 'Backspace' || e.key === 'Delete' || e.key === '0') setCell(0);
      else if (e.key.startsWith('Arrow')) {
        e.preventDefault();
        const d = { ArrowUp: -4, ArrowDown: 4, ArrowLeft: -1, ArrowRight: 1 }[e.key] ?? 0;
        setSel((s) => Math.min(15, Math.max(0, (s < 0 ? 0 : s) + d)));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const check = () => {
    setChecked(true);
    saveDraft({ grid, checked: true });
    submit(grid);
  };

  return (
    <section className="stack">
      <p className="center-text small muted" style={{ margin: 0 }}>
        たて・よこ・ふとい わくの なかに 1〜4 が 1かいずつ
      </p>
      <div
        role="grid"
        aria-label="すうどく"
        style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', width: 'min(100%, 360px, calc(100dvh - var(--dock-h, 0px) - 150px))', minWidth: 220, margin: '0 auto', border: '4px solid #1b2838', borderRadius: 12, overflow: 'hidden', background: '#1b2838', gap: 0 }}
      >
        {grid.map((v, i) => {
          const given = p.givens[i] !== 0;
          const isSel = i === sel;
          const r = rowOf(i);
          const c = colOf(i);
          const peer = sel >= 0 && (rowOf(sel) === r || colOf(sel) === c || boxOf(sel) === boxOf(i));
          let bg = '#fff';
          if (peer) bg = '#eef6fd';
          if (r === hintRow) bg = '#fff6d6';
          if (isSel) bg = '#cfe6fb';
          if (i === hintCell) bg = '#ffe48a';
          return (
            <button
              key={i}
              type="button"
              role="gridcell"
              aria-label={`${r + 1}ぎょうめ ${c + 1}れつめ ${v || 'から'}${given ? '（さいしょから ある かず）' : ''}${bad.has(i) ? '（おなじ かずが ある）' : ''}`}
              aria-selected={isSel}
              onClick={() => setSel(i)}
              className="num"
              style={{
                aspectRatio: '1',
                fontSize: 'clamp(1.6rem, 9vw, 2.4rem)',
                border: 'none',
                borderRight: c === 1 ? '3px solid #1b2838' : c < 3 ? '1px solid #9fb3c6' : 'none',
                borderBottom: r === 1 ? '3px solid #1b2838' : r < 3 ? '1px solid #9fb3c6' : 'none',
                background: bg,
                color: given ? '#1b2838' : '#2a7fd0',
                fontWeight: given ? 900 : 700,
                position: 'relative',
                borderRadius: 0,
              }}
            >
              {v || ''}
              {bad.has(i) && !given && (
                <span aria-hidden style={{ position: 'absolute', top: 4, right: 6, fontSize: '0.9rem', color: '#c0392b' }}>
                  ●
                </span>
              )}
            </button>
          );
        })}
      </div>
      {status}
      <InDock>
      <div className="row center" role="group" aria-label="すうじ" style={{ flexWrap: 'nowrap', gap: 6 }}>
        {[1, 2, 3, 4].map((n) => (
          <button key={n} type="button" className="btn big num" style={{ fontSize: '1.6rem', minWidth: 0, flex: '1 1 0', padding: 0 }} onClick={() => setCell(n)} disabled={solved}>
            {n}
          </button>
        ))}
        <button type="button" className="btn big" onClick={() => setCell(0)} disabled={solved} style={{ flex: '1 1 0', minWidth: 0, padding: 0 }}>
          けす
        </button>
      </div>
      <button type="button" className="btn primary big" onClick={check} disabled={solved || grid.some((v) => v === 0)}>
        こたえあわせ
      </button>
      </InDock>
      {grid.some((v) => v === 0) && !solved && <p className="center-text small muted">ぜんぶ うめたら こたえあわせ できるよ</p>}
    </section>
  );
}
