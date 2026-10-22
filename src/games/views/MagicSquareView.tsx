import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { easiestLine, lineName, lineStatus, magicSum, type MagicAnswer, type MagicPuzzle } from '../../domain/games/magicSquare';
import { play } from '../../audio/sfx';
import { InDock } from '../../components/Dock';
import { useRoom } from '../useRoom';
import type { GameViewProps } from '../types';

interface Draft {
  cells: number[];
  sel: number;
  history: number[][];
}

const HISTORY = 60;
/** 4×4 で 2けたを うつ ときの まち時間 */
const TWO_DIGIT_MS = 900;

export function MagicSquareView({ puzzle: p, difficulty, submit, solved, status, draft, saveDraft, reportProgress, hintLevel }: GameViewProps<MagicPuzzle, MagicAnswer, Draft>) {
  const n = p.n;
  const N = n * n;
  const target = magicSum(n);
  const fixed = (i: number) => p.givens[i] !== 0;
  const firstBlank = (c: readonly number[], from = 0) => {
    for (let k = 0; k < N; k++) {
      const i = (from + k) % N;
      if (!fixed(i) && !c[i]) return i;
    }
    return -1;
  };
  const [cells, setCells] = useState<number[]>(() => {
    const ok = Array.isArray(draft?.cells) && draft.cells.length === N && draft.cells.every((v) => Number.isInteger(v) && v >= 0 && v <= N);
    // はじめの かずは いつも 問題の とおり
    return p.givens.map((g, i) => (g !== 0 ? g : ok ? draft!.cells[i] : 0));
  });
  const [sel, setSel] = useState<number>(() => (Number.isInteger(draft?.sel) && draft!.sel >= 0 && draft!.sel < N && !fixed(draft!.sel) ? draft!.sel : firstBlank(p.givens)));
  const [history, setHistory] = useState<number[][]>(() => (Array.isArray(draft?.history) ? draft.history.filter((h) => Array.isArray(h) && h.length === N).slice(-HISTORY) : []));
  const buffer = useRef<{ digit: number; timer: number } | null>(null);
  const { ref, width: roomW, height: roomH } = useRoom<HTMLDivElement>();

  useEffect(() => reportProgress(cells), [cells, reportProgress]);
  useEffect(() => () => window.clearTimeout(buffer.current?.timer), []);

  const persist = (c: number[], s: number, h: number[][]) => saveDraft({ cells: c, sel: s, history: h });

  const put = (v: number) => {
    if (solved || sel < 0 || fixed(sel)) return;
    // おなじ かずは 2かい おけない（ほかの マスで つかって いる かず）
    if (v !== 0 && cells.some((x, i) => x === v && i !== sel)) return;
    if (cells[sel] === v) return;
    play('tap');
    const c = cells.map((x, i) => (i === sel ? v : x));
    const h = [...history, cells].slice(-HISTORY);
    // いれたら つぎの あきへ
    const next = v !== 0 ? firstBlank(c, sel + 1) : sel;
    const s = next >= 0 ? next : sel;
    setCells(c);
    setHistory(h);
    setSel(s);
    persist(c, s, h);
  };
  const choose = (i: number) => {
    if (solved || fixed(i)) return;
    play('tap');
    setSel(i);
    persist(cells, i, history);
  };
  const undo = () => {
    if (solved || history.length === 0) return;
    play('tap');
    const c = history[history.length - 1];
    const h = history.slice(0, -1);
    setCells(c);
    setHistory(h);
    persist(c, sel, h);
  };

  useEffect(() => {
    const flush = () => {
      const b = buffer.current;
      if (!b) return;
      window.clearTimeout(b.timer);
      buffer.current = null;
      put(b.digit);
    };
    const onKey = (e: KeyboardEvent) => {
      if (solved) return;
      if (/^[0-9]$/.test(e.key)) {
        const d = Number(e.key);
        const b = buffer.current;
        if (b) {
          // 2けためを まって いた
          window.clearTimeout(b.timer);
          buffer.current = null;
          const v = b.digit * 10 + d;
          if (v <= N) {
            put(v);
            return;
          }
          // 17 などは つくれないので、1 を いれてから この かずを あたらしく うつ
          put(b.digit);
        }
        if (n === 4 && d === 1) {
          // 1 の あとに 0〜6 が くれば 10〜16
          buffer.current = { digit: 1, timer: window.setTimeout(flush, TWO_DIGIT_MS) };
          return;
        }
        if (d >= 1 && d <= N) put(d);
      } else if (e.key === 'Enter') flush();
      else if (e.key === 'Backspace' || e.key === 'Delete') put(0);
      else if (e.key.startsWith('Arrow')) {
        e.preventDefault();
        const r = Math.floor(Math.max(0, sel) / n);
        const c = Math.max(0, sel) % n;
        const [dr, dc] = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }[e.key] ?? [0, 0];
        let rr = r;
        let cc = c;
        // かためた マスは とばす
        for (let k = 0; k < n; k++) {
          rr = Math.min(n - 1, Math.max(0, rr + dr));
          cc = Math.min(n - 1, Math.max(0, cc + dc));
          if (!fixed(rr * n + cc)) {
            choose(rr * n + cc);
            break;
          }
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const st = lineStatus(n, cells);
  const hl = hintLevel >= 2 && !solved ? easiestLine(p, cells) : null;
  const hlSet = new Set(hl?.cells ?? []);
  const remaining = cells.filter((v) => !v).length;
  const usedSet = new Set(cells.filter(Boolean));

  // 大きさ：盤面（n＋合計の 1列）と パレットが ドックの うえに はいるように
  const palCols = n === 3 ? 5 : 8;
  const palRows = 2;
  const palH = palRows * 44 + (palRows - 1) * 6;
  const cell = Math.floor(Math.max(36, Math.min(n === 3 ? 76 : 64, (roomW - 8) / (n + 0.9), (roomH - palH - 50) / (n + 1))));
  const sumW = Math.floor(cell * 0.75);

  const sumBadge = (li: number, key: string, extra: CSSProperties = {}) => {
    const s = st[li];
    const label = `${lineName(n, li)}：` + (s.complete ? `ごうけい ${s.sum}${s.ok ? '（できた）' : `（${target}に ならない）`}` : `とちゅうの ごうけい ${s.sum}`);
    return (
      <div
        key={key}
        role="note"
        aria-label={label}
        data-testid={`sum-${li}`}
        data-state={s.complete ? (s.ok ? 'ok' : 'ng') : 'partial'}
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: 8,
          fontWeight: 900,
          lineHeight: 1.05,
          fontSize: cell >= 50 ? '0.95rem' : '0.8rem',
          color: s.complete ? (s.ok ? '#1f7a4d' : '#c2410c') : '#5b7086',
          background: s.complete ? (s.ok ? '#e5f7ef' : '#fff1e6') : 'transparent',
          border: s.complete ? 'none' : '1.5px dashed #b8c7d6',
          outline: hl?.li === li ? '3px solid #f59e0b' : undefined,
          ...extra,
        }}
      >
        <span>
          {li >= 2 * n && (
            <span aria-hidden style={{ fontWeight: 700, marginRight: 1 }}>
              {li === 2 * n ? '＼' : '／'}
            </span>
          )}
          {s.sum}
          {s.complete ? (s.ok ? ' ✓' : ' ≠') : ''}
        </span>
        {!s.complete && (
          <span aria-hidden style={{ fontSize: '0.55rem', fontWeight: 700 }}>
            とちゅう
          </span>
        )}
      </div>
    );
  };

  return (
    <section className="stack" style={{ gap: 6 }}>
      <p className="center-text" style={{ margin: 0, fontWeight: 800 }} data-testid="magic-guide">
        {difficulty === 'easy' ? (
          <>
            たて・よこ・ななめ ぜんぶ <strong style={{ fontSize: '1.3rem', color: '#e8590c' }}>{target}</strong> に しよう
          </>
        ) : (
          <>
            どの せんも <strong style={{ fontSize: '1.2rem', color: '#e8590c' }}>{target}</strong> に しよう
          </>
        )}
        <span className="small muted" style={{ marginLeft: 8 }} data-testid="magic-remaining">
          のこり {remaining}
        </span>
      </p>
      <div ref={ref} className="stack" style={{ gap: 8, alignItems: 'center' }}>
        <div role="grid" aria-label="まほうじん" style={{ display: 'grid', gridTemplateColumns: `repeat(${n}, ${cell}px) ${sumW}px`, gridAutoRows: 'auto', gap: 4, alignItems: 'stretch' }}>
          {/* うえの 行：ななめ（／）の 合計 */}
          {Array.from({ length: n }, (_, c) => (
            <div key={`t${c}`} />
          ))}
          {sumBadge(2 * n + 1, 'd2', { height: 24, fontSize: '0.7rem' })}
          {Array.from({ length: n }, (_, r) => (
            <div key={`r${r}`} role="row" style={{ display: 'contents' }}>
              {Array.from({ length: n }, (__, c) => {
                const i = r * n + c;
                const v = cells[i];
                const f = fixed(i);
                const on = sel === i && !solved;
                return (
                  <button
                    key={i}
                    type="button"
                    role="gridcell"
                    aria-label={`うえから ${r + 1}だんめ・ひだりから ${c + 1}れつめ：${v ? v : 'あき'}${f ? '（はじめから）' : ''}`}
                    aria-selected={on}
                    aria-readonly={f || undefined}
                    data-testid={`magic-cell-${i}`}
                    onClick={() => choose(i)}
                    disabled={f || solved}
                    style={{
                      width: cell,
                      height: cell,
                      borderRadius: 10,
                      fontSize: cell >= 56 ? '1.7rem' : '1.3rem',
                      fontWeight: 900,
                      padding: 0,
                      color: f ? '#1b2838' : '#1d4ed8',
                      background: f ? '#e6edf3' : on ? '#fff3d6' : '#fff',
                      border: on ? '3px solid #d97706' : hlSet.has(i) ? '3px dashed #f59e0b' : f ? '2px solid #c6d6e4' : '2px solid #8fb3d9',
                      opacity: 1,
                      cursor: f ? 'default' : 'pointer',
                    }}
                  >
                    {v || ''}
                  </button>
                );
              })}
              {sumBadge(r, `rs${r}`)}
            </div>
          ))}
          {/* したの 行：たての 合計と ななめ（＼） */}
          {Array.from({ length: n }, (_, c) => sumBadge(n + c, `cs${c}`, { height: sumW }))}
          {sumBadge(2 * n, 'd1', { height: sumW, fontSize: '0.75rem' })}
        </div>
        <div
          role="group"
          aria-label="かずを えらぶ"
          style={{ display: 'grid', gridTemplateColumns: `repeat(${palCols}, minmax(0, 1fr))`, gap: 6, width: '100%', maxWidth: palCols * (n === 3 ? 64 : 52) }}
        >
          {Array.from({ length: N }, (_, k) => {
            const v = k + 1;
            const inSel = sel >= 0 && cells[sel] === v;
            const used = usedSet.has(v) && !inSel;
            return (
              <button
                key={v}
                type="button"
                className="btn"
                aria-label={`${v}${used ? '（つかった）' : ''}`}
                onClick={() => put(v)}
                disabled={solved || used || sel < 0}
                style={{ minHeight: 44, minWidth: 0, padding: 0, fontSize: '1.2rem', fontWeight: 900, textDecoration: used ? 'line-through' : undefined, opacity: used ? 0.45 : 1 }}
              >
                {v}
              </button>
            );
          })}
        </div>
      </div>
      {solved && (
        <p className="center-text pop" style={{ margin: 0, fontWeight: 800, fontSize: '1.15rem' }} data-testid="magic-solved">
          どの せんも {target}！ まほうじんの できあがり
        </p>
      )}
      {status}
      <InDock>
        <div className="row center" style={{ gap: 6, flexWrap: 'nowrap' }}>
          <button type="button" className="btn" onClick={undo} disabled={solved || history.length === 0} style={{ flex: 1, minWidth: 0 }}>
            もどす
          </button>
          <button type="button" className="btn" onClick={() => put(0)} disabled={solved || sel < 0 || !cells[sel] || fixed(sel)} style={{ flex: 1, minWidth: 0 }}>
            けす
          </button>
          <button type="button" className="btn primary" onClick={() => submit({ cells })} disabled={solved} style={{ flex: 2, minWidth: 0 }}>
            こたえあわせ
          </button>
        </div>
      </InDock>
    </section>
  );
}
