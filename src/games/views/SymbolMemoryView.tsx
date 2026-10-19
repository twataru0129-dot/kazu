import { useCallback, useEffect, useRef, useState } from 'react';
import { emptyCells, isTimed, symbolMismatches, SYMBOL_NAME, type Cell, type SymbolId, type SymbolMemoryAnswer, type SymbolMemoryPuzzle } from '../../domain/games/symbolMemory';
import { play } from '../../audio/sfx';
import { InDock } from '../../components/Dock';
import type { GameViewProps } from '../types';

/** 記号は 形で見分ける（色は 補助） */
const SYMBOL_COLOR: Record<SymbolId, string> = { circle: '#e8504f', double: '#7a55c8', cross: '#1b2838', triangle: '#2fa36b', square: '#3d7fd9', diamond: '#d9822b', star: '#c79a00' };

export function SymbolIcon({ s, size = '70%' }: { s: SymbolId; size?: string | number }) {
  const c = SYMBOL_COLOR[s];
  const w = 7;
  const body = (() => {
    switch (s) {
      case 'circle':
        return <circle cx="50" cy="50" r="34" fill="none" stroke={c} strokeWidth={w} />;
      case 'double':
        return (
          <>
            <circle cx="50" cy="50" r="36" fill="none" stroke={c} strokeWidth={w} />
            <circle cx="50" cy="50" r="17" fill="none" stroke={c} strokeWidth={w} />
          </>
        );
      case 'cross':
        return <path d="M20 20 L80 80 M80 20 L20 80" stroke={c} strokeWidth={w + 2} strokeLinecap="round" />;
      case 'triangle':
        return <path d="M50 14 L86 82 H14 Z" fill="none" stroke={c} strokeWidth={w} strokeLinejoin="round" />;
      case 'square':
        return <rect x="18" y="18" width="64" height="64" fill="none" stroke={c} strokeWidth={w} />;
      case 'diamond':
        return <path d="M50 10 L88 50 L50 90 L12 50 Z" fill="none" stroke={c} strokeWidth={w} strokeLinejoin="round" />;
      case 'star':
        return <path d="M50 8 L61 38 L93 39 L68 58 L77 90 L50 71 L23 90 L32 58 L7 39 L39 38 Z" fill="none" stroke={c} strokeWidth={w - 1} strokeLinejoin="round" />;
    }
  })();
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden style={{ display: 'block' }}>
      {body}
    </svg>
  );
}

type Phase = 'ready' | 'showing' | 'answer';
interface Draft {
  cells: Cell[];
  reshows: number;
  /** 見本を さいごまで（または「おぼえた！」まで）見たか */
  seen: boolean;
}

const pos = (i: number, n: number) => `うえから ${Math.floor(i / n) + 1}ばんめ ひだりから ${(i % n) + 1}ばんめ`;
const cellLabel = (c: Cell) => (c ? SYMBOL_NAME[c] : 'から');

function Grid({ p, cells, cellPx, onTap, flash, label }: { p: SymbolMemoryPuzzle; cells: readonly Cell[]; cellPx: number; onTap?: (i: number) => void; flash?: number; label: string }) {
  return (
    <div role="grid" aria-label={label} style={{ display: 'grid', gridTemplateColumns: `repeat(${p.size}, ${cellPx}px)`, gap: 4, width: 'max-content', margin: '0 auto' }}>
      {cells.map((c, i) => {
        const common = { width: cellPx, height: cellPx, padding: 0, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' } as const;
        return onTap ? (
          <button key={i} type="button" role="gridcell" className={flash === i ? 'pop' : ''} aria-label={`${label} ${pos(i, p.size)}：${cellLabel(c)}`} onClick={() => onTap(i)} style={{ ...common, background: '#fff', border: flash === i ? '4px solid #f4b400' : '2px solid #9fb3c6' }}>
            {c && <SymbolIcon s={c} />}
          </button>
        ) : (
          <div key={i} role="gridcell" aria-label={`${label} ${pos(i, p.size)}：${cellLabel(c)}`} style={{ ...common, background: '#fdf6e3', border: '2px solid #e2c98f' }}>
            {c && <SymbolIcon s={c} />}
          </div>
        );
      })}
    </div>
  );
}

export function SymbolMemoryView({ puzzle: p, submit, solved, status, draft, saveDraft, reportProgress, hintLevel }: GameViewProps<SymbolMemoryPuzzle, SymbolMemoryAnswer, Draft>) {
  const timed = isTimed(p);
  const [cells, setCells] = useState<Cell[]>(() => draft?.cells ?? emptyCells(p));
  const [reshows, setReshows] = useState(draft?.reshows ?? 0);
  const [seen, setSeen] = useState(draft?.seen ?? false);
  // 再開したときは、見本を勝手に見せない（「みる」を押すまで待つ）
  const [phase, setPhase] = useState<Phase>(() => (!timed || draft?.seen ? 'answer' : 'ready'));
  const [brush, setBrush] = useState<SymbolId | 'eraser'>(p.symbols[0]);
  const [history, setHistory] = useState<Cell[][]>([]);
  const [leftMs, setLeftMs] = useState(p.showMs ?? 0);
  const timer = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const flash = hintLevel >= 3 && phase === 'answer' ? symbolMismatches(p, cells)[0] : undefined;

  useEffect(() => reportProgress(cells), [cells, reportProgress]);

  const save = useCallback((next: Partial<Draft>) => saveDraft({ cells, reshows, seen, ...next }), [saveDraft, cells, reshows, seen]);

  const stopTimer = () => {
    clearInterval(timer.current);
    timer.current = undefined;
  };

  const endShow = useCallback(() => {
    stopTimer();
    setSeen(true);
    setPhase('answer');
    save({ seen: true });
  }, [save]);

  const startShow = (again: boolean) => {
    if (!timed || solved) return;
    play('tap');
    const nextReshows = again ? reshows + 1 : reshows;
    setReshows(nextReshows);
    save({ reshows: nextReshows });
    setLeftMs(p.showMs!);
    setPhase('showing');
    stopTimer();
    // 見えている あいだだけ 時間を へらす（タイマーが まびかれても 時刻の差で数える）
    let last = performance.now();
    timer.current = setInterval(() => {
      const now = performance.now();
      const step = Math.min(500, now - last);
      last = now;
      setLeftMs((ms) => Math.max(0, ms - step));
    }, 100);
  };

  useEffect(() => {
    if (phase === 'showing' && leftMs <= 0) endShow();
  }, [phase, leftMs, endShow]);

  // 画面が かくれたら 見本を とじる（もどったときに 見本だけが見えたり、時間が へったり しない）
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState !== 'hidden' || phase !== 'showing') return;
      stopTimer();
      setPhase(seen ? 'answer' : 'ready');
    };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', onHide);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', onHide);
    };
  }, [phase, seen]);
  useEffect(() => () => stopTimer(), []);

  const update = (next: Cell[], pushHistory = true) => {
    if (pushHistory) setHistory((h) => [...h.slice(-49), cells]);
    setCells(next);
    save({ cells: next });
  };

  const tap = (i: number) => {
    if (solved || phase !== 'answer') return;
    const v: Cell = brush === 'eraser' ? null : brush;
    if (cells[i] === v) return;
    play('tap');
    update(cells.map((c, k) => (k === i ? v : c)));
  };

  const undo = () => {
    const prev = history.at(-1);
    if (!prev) return;
    setHistory((h) => h.slice(0, -1));
    update(prev, false);
  };

  const answerPx = Math.max(48, Math.min(72, Math.floor(288 / p.size) - 4));
  const samplePx = timed ? answerPx : Math.max(30, Math.min(52, Math.floor(200 / p.size)));
  const secs = Math.ceil(leftMs / 1000);

  const palette = (
    <div className="row center" role="radiogroup" aria-label="おく きごう" style={{ gap: 6 }}>
      {p.symbols.map((s) => (
        <button key={s} type="button" role="radio" aria-checked={brush === s} aria-label={SYMBOL_NAME[s]} className="chip" onClick={() => setBrush(s)} style={{ width: 52, height: 52, padding: 4, borderWidth: brush === s ? 4 : 2, borderColor: brush === s ? '#2a7fd0' : undefined, background: brush === s ? '#e6f1fc' : '#fff' }} disabled={solved || phase !== 'answer'}>
          <SymbolIcon s={s} size="100%" />
        </button>
      ))}
      <button type="button" role="radio" aria-checked={brush === 'eraser'} aria-label="けしごむ" className="chip" onClick={() => setBrush('eraser')} style={{ height: 52, padding: '0 10px', borderWidth: brush === 'eraser' ? 4 : 2, borderColor: brush === 'eraser' ? '#2a7fd0' : undefined, background: brush === 'eraser' ? '#e6f1fc' : '#fff' }} disabled={solved || phase !== 'answer'}>
        けしごむ
      </button>
    </div>
  );

  return (
    <section className="stack">
      {!timed && (
        <div className="card stack" style={{ gap: 6, padding: 10 }}>
          <strong className="center-text small">みほん</strong>
          <Grid p={p} cells={p.cells} cellPx={samplePx} label="みほん" />
        </div>
      )}
      {timed && phase === 'ready' && (
        <div className="card stack center-text" style={{ gap: 8 }}>
          <p style={{ margin: 0 }}>
            みほんを {p.showMs! / 1000}びょう みて、<span className="phrase">おなじ ばしょに きごうを おこう</span>
          </p>
          <button type="button" className="btn primary big" onClick={() => startShow(false)} disabled={solved}>
            みる
          </button>
        </div>
      )}
      {timed && phase === 'showing' && (
        <div className="card stack" style={{ gap: 8, padding: 10 }} data-testid="symbol-sample">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <strong>みほんを おぼえよう</strong>
            <span className="num" aria-live="polite" aria-label={`のこり ${secs}びょう`} style={{ fontSize: '1.4rem', color: '#b85a12' }}>
              のこり {secs}
            </span>
          </div>
          <div className="bar" aria-hidden>
            <i style={{ width: `${(leftMs / p.showMs!) * 100}%` }} />
          </div>
          <Grid p={p} cells={p.cells} cellPx={answerPx} label="みほん" />
          <button type="button" className="btn good big" onClick={endShow}>
            おぼえた！
          </button>
        </div>
      )}
      {phase === 'answer' && (
        <>
          {timed && (
            <div className="row center small" style={{ gap: 8 }}>
              <span className="muted">みほんは かくれたよ</span>
              <button type="button" className="btn small" onClick={() => startShow(true)} disabled={solved}>
                もういちど みる
              </button>
              {reshows > 0 && <span className="muted">（{reshows}かい みた）</span>}
            </div>
          )}
          {palette}
          <div className="stack" style={{ gap: 4 }}>
            <strong className="center-text small">きみの こたえ</strong>
            <Grid p={p} cells={cells} cellPx={answerPx} onTap={tap} flash={flash} label="こたえ" />
          </div>
        </>
      )}
      {status}
      <InDock>
        <div className="row center" style={{ flexWrap: 'nowrap' }}>
          <button type="button" className="btn" onClick={undo} disabled={solved || phase !== 'answer' || history.length === 0}>
            もどす
          </button>
          <button type="button" className="btn" onClick={() => update(emptyCells(p))} disabled={solved || phase !== 'answer' || cells.every((c) => c === null)}>
            ぜんぶ けす
          </button>
          <button type="button" className="btn primary big" onClick={() => submit({ cells, reshows })} disabled={solved || phase !== 'answer'}>
            こたえあわせ
          </button>
        </div>
      </InDock>
    </section>
  );
}
