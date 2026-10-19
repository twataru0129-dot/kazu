import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { emptyNonogram, lineMatches, nextDeduction, nonogramMismatch, type NonoCell, type NonogramAnswer, type NonogramPuzzle } from '../../domain/games/nonogram';
import { play } from '../../audio/sfx';
import { InDock } from '../../components/Dock';
import type { GameViewProps } from '../types';

type Mode = 'fill' | 'cross' | 'erase';
interface Draft {
  cells: NonogramAnswer;
  undo: NonogramAnswer[];
  redo: NonogramAnswer[];
  mode: Mode;
}

const MODE_LABEL: Record<Mode, string> = { fill: 'ぬる', cross: '×', erase: 'けす' };
const STATE_LABEL = ['まだ', 'くろ', 'ばつ'] as const;
const BIG = 40;
const HISTORY = 30;

export function NonogramView({ puzzle: p, submit, solved, status, draft, saveDraft, reportProgress, hintLevel }: GameViewProps<NonogramPuzzle, NonogramAnswer, Draft>) {
  const n = p.size;
  const [cells, setCells] = useState<NonogramAnswer>(() => draft?.cells ?? emptyNonogram(n));
  const [undo, setUndo] = useState<NonogramAnswer[]>(() => draft?.undo ?? []);
  const [redo, setRedo] = useState<NonogramAnswer[]>(() => draft?.redo ?? []);
  const [mode, setMode] = useState<Mode>(draft?.mode ?? 'fill');
  const [focus, setFocus] = useState<[number, number] | null>(null);
  const [zoom, setZoom] = useState<boolean | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(300);
  const [availH, setAvailH] = useState(400);

  useEffect(() => reportProgress(cells), [cells, reportProgress]);

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const dock = document.querySelector<HTMLElement>('[data-testid="dock"]');
    const update = () => {
      setWidth(el.clientWidth || 300);
      const top = el.getBoundingClientRect().top + window.scrollY;
      const viewH = window.visualViewport?.height ?? window.innerHeight;
      setAvailH(Math.max(160, viewH - top - (dock?.offsetHeight ?? 0) - 12));
    };
    update();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(update) : null;
    ro?.observe(el);
    if (dock) ro?.observe(dock);
    window.addEventListener('resize', update);
    return () => {
      ro?.disconnect();
      window.removeEventListener('resize', update);
    };
  }, []);

  const maxRowGroups = Math.max(1, ...p.rows.map((r) => r.length));
  const maxColGroups = Math.max(1, ...p.cols.map((c) => c.length));
  const clueW = maxRowGroups * 16 + 12;
  const clueH = maxColGroups * 17 + 8;
  const fit = Math.floor((width - clueW - 4) / n);
  // せまい画面の 大きい盤面は、はじめから 大きく表示して スクロールする（押せる大きさを優先）
  const big = zoom ?? fit < 30;
  const cell = big ? Math.max(BIG, fit) : Math.max(22, Math.min(48, fit));
  const canZoom = fit < BIG;

  const flash: [number, number] | undefined = (() => {
    if (hintLevel < 3 || solved) return undefined;
    const wrong = nonogramMismatch(p, cells).wrongBlack[0];
    return wrong ?? nextDeduction(p, cells)?.cell;
  })();

  const commit = (next: NonogramAnswer, nextUndo: NonogramAnswer[], nextRedo: NonogramAnswer[], m = mode) => {
    setCells(next);
    setUndo(nextUndo);
    setRedo(nextRedo);
    saveDraft({ cells: next, undo: nextUndo, redo: nextRedo, mode: m });
  };

  const tap = (r: number, c: number) => {
    if (solved) return;
    const cur = cells[r][c];
    // おなじ モードで もういちど おすと「まだ」に もどる
    const v: NonoCell = mode === 'erase' ? 0 : mode === 'fill' ? (cur === 1 ? 0 : 1) : cur === 2 ? 0 : 2;
    setFocus([r, c]);
    if (v === cur) return;
    play('tap');
    const next = cells.map((row, i) => (i === r ? row.map((x, j) => (j === c ? v : x)) : row));
    commit(next, [...undo.slice(-(HISTORY - 1)), cells], []);
  };

  const doUndo = () => {
    const prev = undo.at(-1);
    if (!prev) return;
    commit(prev, undo.slice(0, -1), [...redo.slice(-(HISTORY - 1)), cells]);
  };
  const doRedo = () => {
    const nx = redo.at(-1);
    if (!nx) return;
    commit(nx, [...undo.slice(-(HISTORY - 1)), cells], redo.slice(0, -1));
  };
  const pickMode = (m: Mode) => {
    setMode(m);
    saveDraft({ cells, undo, redo, mode: m });
  };

  const thick = (i: number) => (i > 0 && i % 5 === 0 ? 3 : 1);
  const clueText = (c: number[]) => (c.length ? c : [0]);
  const boardW = clueW + cell * n;
  const boardH = clueH + cell * n;
  const rowDone = p.rows.map((clue, r) => lineMatches(clue, cells[r]));
  const colDone = p.cols.map((clue, c) => lineMatches(clue, cells.map((row) => row[c])));

  return (
    <section className="stack">
      <div className="row center" role="radiogroup" aria-label="おす ときの うごき" style={{ gap: 6, flexWrap: 'nowrap' }}>
        {(['fill', 'cross', 'erase'] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={mode === m}
            className="chip"
            onClick={() => pickMode(m)}
            disabled={solved}
            style={{ flex: '1 1 0', maxWidth: 110, minWidth: 0, minHeight: 52, padding: '0 6px', whiteSpace: 'nowrap', fontSize: '1.1rem', borderWidth: mode === m ? 4 : 2, borderColor: mode === m ? '#2a7fd0' : undefined, background: mode === m ? '#e6f1fc' : '#fff' }}
          >
            {m === 'fill' && <span aria-hidden style={{ display: 'inline-block', width: 16, height: 16, background: '#1b2838', borderRadius: 3, marginRight: 4, verticalAlign: '-2px' }} />}
            {MODE_LABEL[m]}
          </button>
        ))}
        {canZoom && (
          <button type="button" className="chip" aria-pressed={big} aria-label={big ? 'ぜんたいを みる（ちいさく する）' : 'おおきく する'} onClick={() => setZoom(!big)} style={{ flex: '0 0 52px', minHeight: 52, padding: 0 }}>
            <svg viewBox="0 0 24 24" width="28" height="28" aria-hidden style={{ display: 'block', margin: '0 auto' }}>
              <circle cx="10" cy="10" r="6.5" fill="none" stroke="#1b2838" strokeWidth="2.2" />
              <path d="M15 15 L21 21" stroke="#1b2838" strokeWidth="2.6" strokeLinecap="round" />
              <path d={big ? 'M7 10 H13' : 'M7 10 H13 M10 7 V13'} stroke="#1b2838" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        )}
      </div>
      <div ref={wrapRef}>
        <div
          data-testid="nonogram-scroll"
          style={{ overflow: 'auto', maxHeight: availH, maxWidth: '100%', margin: '0 auto', width: Math.min(width, boardW + 2), border: '2px solid #c6d6e4', borderRadius: 10, background: '#fff', touchAction: 'pan-x pan-y' }}
        >
          <div role="grid" aria-label="ピクロスの ばん" style={{ display: 'grid', gridTemplateColumns: `${clueW}px repeat(${n}, ${cell}px)`, gridTemplateRows: `${clueH}px repeat(${n}, ${cell}px)`, width: boardW, height: boardH }}>
            <div style={{ position: 'sticky', top: 0, left: 0, zIndex: 3, background: '#f3f7fb' }} aria-hidden />
            {p.cols.map((clue, c) => (
              <div
                key={`c${c}`}
                role="columnheader"
                aria-label={`ひだりから ${c + 1}ばんめの れつ：${clueText(clue).join('、')}`}
                style={{ position: 'sticky', top: 0, zIndex: 2, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', alignItems: 'center', paddingBottom: 3, fontSize: '0.85rem', fontWeight: 800, lineHeight: '17px', background: focus?.[1] === c ? '#dcecfb' : '#f3f7fb', color: colDone[c] ? '#a8b6c4' : '#1b2838', borderLeft: `${thick(c)}px solid #c6d6e4` }}
              >
                {clueText(clue).map((v, i) => (
                  <span key={i}>{v}</span>
                ))}
              </div>
            ))}
            {cells.map((row, r) => [
              <div
                key={`r${r}`}
                role="rowheader"
                aria-label={`うえから ${r + 1}ばんめの ぎょう：${clueText(p.rows[r]).join('、')}`}
                style={{ position: 'sticky', left: 0, zIndex: 1, display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 6, paddingRight: 5, fontSize: '0.85rem', fontWeight: 800, background: focus?.[0] === r ? '#dcecfb' : '#f3f7fb', color: rowDone[r] ? '#a8b6c4' : '#1b2838', borderTop: `${thick(r)}px solid #c6d6e4` }}
              >
                {clueText(p.rows[r]).map((v, i) => (
                  <span key={i}>{v}</span>
                ))}
              </div>,
              ...row.map((v, c) => {
                const isFlash = flash && flash[0] === r && flash[1] === c;
                const inFocus = focus && (focus[0] === r || focus[1] === c);
                const black = v === 1;
                return (
                  <button
                    key={`${r}-${c}`}
                    type="button"
                    role="gridcell"
                    className={isFlash ? 'pop' : ''}
                    onClick={() => tap(r, c)}
                    aria-label={`うえから ${r + 1}ばんめ ひだりから ${c + 1}ばんめ：${STATE_LABEL[v]}`}
                    style={{
                      width: cell,
                      height: cell,
                      boxSizing: 'border-box',
                      padding: 0,
                      border: 'none',
                      borderLeft: `${thick(c)}px solid #c6d6e4`,
                      borderTop: `${thick(r)}px solid #c6d6e4`,
                      outline: isFlash ? '3px solid #f4b400' : undefined,
                      outlineOffset: -3,
                      background: black ? '#1b2838' : inFocus ? '#eef6fd' : '#fff',
                      color: '#d9534f',
                      fontSize: Math.round(cell * 0.6),
                      fontWeight: 800,
                      lineHeight: 1,
                      borderRadius: 0,
                    }}
                  >
                    {v === 2 && !solved ? '×' : ''}
                  </button>
                );
              }),
            ])}
          </div>
        </div>
      </div>
      {solved && (
        <p className="center-text pop" style={{ margin: 0, fontWeight: 800, fontSize: '1.2rem' }}>
          「{p.name}」が できたよ！
        </p>
      )}
      {status}
      <InDock>
        <div className="row center" style={{ flexWrap: 'nowrap', gap: 6 }}>
          <button type="button" className="btn" onClick={doUndo} disabled={solved || undo.length === 0}>
            もどす
          </button>
          <button type="button" className="btn" onClick={doRedo} disabled={solved || redo.length === 0}>
            やりなおし
          </button>
          <button type="button" className="btn primary big" onClick={() => submit(cells)} disabled={solved}>
            こたえあわせ
          </button>
        </div>
      </InDock>
    </section>
  );
}
