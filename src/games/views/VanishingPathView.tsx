import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { cellId, checkStep, PATH_ROUNDS, PATH_RULES, type PathRoundRecord, type VanishingPathAnswer, type VanishingPathPuzzle } from '../../domain/games/vanishingPath';
import { play } from '../../audio/sfx';
import { InDock } from '../../components/Dock';
import type { GameViewProps } from '../types';
import { useFitCell } from '../useFitCell';

type Phase = 'ready' | 'show' | 'input' | 'roundDone';
interface Draft {
  round: number;
  records: PathRoundRecord[];
  /** いまの ラウンドで すすんだ ところ（道の 何番目に いるか） */
  index: number;
}

const freshRecords = (): PathRoundRecord[] => Array.from({ length: PATH_ROUNDS }, () => ({ views: 0, wrong: 0, restarts: 0, peeks: 0, cleared: false }));
const BIG = 52;
const GAP = 3;

export function VanishingPathView({ puzzle: p, difficulty, submit, solved, status, draft, saveDraft, reportProgress, hintLevel }: GameViewProps<VanishingPathPuzzle, VanishingPathAnswer, Draft>) {
  const [round, setRound] = useState(draft?.round ?? 0);
  const [records, setRecords] = useState<PathRoundRecord[]>(() => draft?.records ?? freshRecords());
  const [index, setIndex] = useState(draft?.index ?? 0);
  // 再開したときは 道を 自動で 見せない
  const [phase, setPhase] = useState<Phase>('ready');
  const [message, setMessage] = useState(draft ? 'つづきから。「みる」を おしてね' : '「みる」を おすと みちが でるよ');
  const [wrongCell, setWrongCell] = useState<number | null>(null);
  const [peekCell, setPeekCell] = useState<number | null>(null);
  const [zoom, setZoom] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const playId = useRef(0);
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const n = p.size;
  const path = p.rounds[Math.min(round, PATH_ROUNDS - 1)];
  const restartOnMiss = PATH_RULES[difficulty].restartOnMiss;
  const { ref, cell: fit } = useFitCell<HTMLDivElement>(n, { min: 34, max: 72, gap: GAP });
  const cell = zoom ? Math.max(BIG, fit) : fit;

  useEffect(() => reportProgress({ round, index }), [round, index, reportProgress]);

  // 道を 見せる とき・すすむ ときは、盤 ぜんたいが 下の ボタンに かくれない 位置まで うごかす（7×7 の 小さい 画面など）
  const boardRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (phase !== 'show' && phase !== 'input') return;
    const el = boardRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const dock = document.querySelector<HTMLElement>('[data-testid="dock"]');
    const viewH = window.visualViewport?.height ?? window.innerHeight;
    const over = rect.bottom - (viewH - (dock?.offsetHeight ?? 0) - 8);
    if (over > 0) window.scrollBy(0, Math.min(over, rect.top - 8));
  }, [phase, zoom]);

  const clearTimers = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    playId.current++;
  };
  const later = (ms: number, fn: () => void) => {
    const id = playId.current;
    timers.current.push(setTimeout(() => playId.current === id && fn(), ms));
  };

  /** 道を 見せている とちゅうで 画面が かくれたら、けして「みる」待ちに もどす */
  const stop = useCallback(() => {
    clearTimers();
    setPeekCell(null);
    if (phaseRef.current !== 'show') return;
    setPhase('ready');
    setMessage('とちゅうで とまったよ。「もういちど みる」を おしてね');
  }, []);

  useEffect(() => {
    const onHide = () => document.visibilityState === 'hidden' && stop();
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', stop);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', stop);
      clearTimers();
    };
  }, [stop]);

  const persist = (next: Partial<Draft>) => saveDraft({ round, records, index, ...next });
  const routeIds = (k: number, upto = p.rounds[k].length - 1) => p.rounds[k].slice(0, upto + 1).map((c) => cellId(n, c));
  const doneRoutes = (k: number) => Array.from({ length: k }, (_, i) => routeIds(i));

  const hidePath = () => {
    clearTimers();
    setPhase('input');
    setMessage(index > 0 ? 'つづきの マスを おしてね' : 'スタートの となりから すすもう');
  };

  const watch = () => {
    if (solved || phase === 'show' || phase === 'roundDone') return;
    clearTimers();
    const nextRecords = records.map((r, k) => (k === round ? { ...r, views: r.views + 1 } : r));
    setRecords(nextRecords);
    persist({ records: nextRecords });
    setPeekCell(null);
    setWrongCell(null);
    setPhase('show');
    setMessage('みちを おぼえてね');
    later(p.showMs, hidePath);
  };

  const tap = (r: number, c: number) => {
    if (solved || phase !== 'input') return;
    const id = cellId(n, [r, c]);
    if (id === cellId(n, path[index])) return;
    const res = checkStep(p, round, index, [r, c]);
    if (res === 'notNeighbor') {
      play('soft');
      setMessage('いま いる マスの となりを おしてね（ななめは だめ）');
      return;
    }
    setPeekCell(null);
    if (res === 'wrong') {
      play('soft');
      const nextRecords = records.map((x, k) => (k === round ? { ...x, wrong: x.wrong + 1, firstTry: x.firstTry ?? false, restarts: x.restarts + (restartOnMiss ? 1 : 0) } : x));
      const nextIndex = restartOnMiss ? 0 : index;
      setRecords(nextRecords);
      setIndex(nextIndex);
      setWrongCell(id);
      later(700, () => setWrongCell(null));
      setMessage(restartOnMiss ? 'ちがったよ。スタートから もういちど' : 'ちがったよ。いまの ばしょから もういちど');
      persist({ records: nextRecords, index: nextIndex });
      submit({ routes: [...doneRoutes(round), [...routeIds(round, index), id]], rounds: nextRecords });
      return;
    }
    play('tap');
    if (res === 'next') {
      setIndex(index + 1);
      setMessage('そのちょうし！');
      persist({ index: index + 1 });
      return;
    }
    // ゴール
    const nextRecords = records.map((x, k) => (k === round ? { ...x, cleared: true, firstTry: x.firstTry ?? true } : x));
    setRecords(nextRecords);
    setIndex(index + 1);
    const routes = [...doneRoutes(round), routeIds(round)];
    if (round + 1 >= PATH_ROUNDS) {
      setPhase('roundDone');
      setMessage('ゴール！ ぜんぶ できた！');
      persist({ records: nextRecords, index: index + 1 });
      submit({ routes, rounds: nextRecords });
      return;
    }
    play('correct');
    setPhase('roundDone');
    setMessage('ゴール！');
    persist({ round: round + 1, records: nextRecords, index: 0 });
  };

  const nextRound = () => {
    setRound(round + 1);
    setIndex(0);
    setPhase('ready');
    setMessage(`ラウンド ${round + 2}。「みる」を おしてね`);
  };

  const undo = () => {
    if (solved || phase !== 'input' || index === 0) return;
    setIndex(index - 1);
    persist({ index: index - 1 });
  };

  const peek = () => {
    if (solved || phase !== 'input') return;
    const next = path[index + 1];
    if (!next) return;
    const nextRecords = records.map((x, k) => (k === round ? { ...x, peeks: x.peeks + 1 } : x));
    setRecords(nextRecords);
    persist({ records: nextRecords });
    setPeekCell(cellId(n, next));
    later(900, () => setPeekCell(null));
  };

  const showing = phase === 'show';
  const reached = phase === 'roundDone' ? path.length - 1 : index;
  const trail = new Set(path.slice(0, reached + 1).map((c) => cellId(n, c)));
  const startId = cellId(n, path[0]);
  const goalId = cellId(n, path.at(-1)!);
  const curId = cellId(n, path[Math.min(reached, path.length - 1)]);
  const center = (c: readonly [number, number]) => [c[1] * (cell + GAP) + cell / 2, c[0] * (cell + GAP) + cell / 2];
  const line = (cells: readonly (readonly [number, number])[]) => cells.map(center).map((x) => x.join(',')).join(' ');
  const boardW = n * cell + (n - 1) * GAP;
  const canZoom = fit < 44;

  return (
    <section className="stack">
      <div className="card stack" style={{ gap: 6, padding: 10 }}>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <strong>
            ラウンド {Math.min(round + 1, PATH_ROUNDS)}／{PATH_ROUNDS}
          </strong>
          <span className="muted small">{path.length - 1}ほ</span>
        </div>
        <div className="center-text" aria-live="polite" style={{ fontWeight: 700, minHeight: '1.5em' }} data-testid="path-message">
          {message}
        </div>
        <div className="row center small muted" style={{ gap: 14 }}>
          <span>
            <span aria-hidden style={{ color: '#1f9d6a', fontWeight: 800 }}>
              ●
            </span>{' '}
            スタート
          </span>
          <span>
            <span aria-hidden style={{ color: '#c79a00', fontWeight: 800 }}>
              ★
            </span>{' '}
            ゴール
          </span>
          {canZoom && (
            <button type="button" className="chip" aria-pressed={zoom} onClick={() => setZoom(!zoom)} style={{ minHeight: 40 }}>
              {zoom ? 'ちいさく する' : 'おおきく する'}
            </button>
          )}
        </div>
      </div>
      <div ref={ref}>
        <div ref={boardRef} style={{ overflow: 'auto', maxWidth: '100%', width: 'fit-content', margin: '0 auto', touchAction: 'pan-x pan-y' }} data-testid="path-scroll">
          <div role="grid" aria-label="みちの ばん" data-phase={phase} style={{ position: 'relative', display: 'grid', gridTemplateColumns: `repeat(${n}, ${cell}px)`, gap: GAP, width: boardW }}>
            {Array.from({ length: n }, (_, r) =>
              Array.from({ length: n }, (_, c) => {
                const id = cellId(n, [r, c]);
                const isStart = id === startId;
                const isGoal = id === goalId;
                const onPath = showing && path.some((x) => cellId(n, x) === id);
                const visited = !showing && trail.has(id);
                const here = !showing && id === curId && phase !== 'ready';
                const tags = [isStart && 'スタート', isGoal && 'ゴール', here && 'いま いる ところ', visited && !here && !isStart && 'とおった'].filter(Boolean).join('・');
                return (
                  <button
                    key={id}
                    type="button"
                    role="gridcell"
                    aria-label={`うえから ${r + 1}ばんめ ひだりから ${c + 1}ばんめ${tags ? `（${tags}）` : ''}`}
                    disabled={solved || phase !== 'input'}
                    onClick={() => tap(r, c)}
                    style={{
                      width: cell,
                      height: cell,
                      padding: 0,
                      borderRadius: 8,
                      border: peekCell === id ? '4px dashed #f4b400' : wrongCell === id ? '4px solid #d9534f' : '2px solid #c6d6e4',
                      background: wrongCell === id ? '#fde3e1' : onPath ? '#bfe0fb' : visited ? '#d7f1e3' : '#fff',
                      fontSize: Math.round(cell * 0.5),
                      fontWeight: 800,
                      lineHeight: 1,
                      color: isGoal ? '#c79a00' : '#1f9d6a',
                      position: 'relative',
                      zIndex: 1,
                      opacity: phase === 'ready' && !isStart && !isGoal && !visited ? 0.85 : 1,
                    }}
                  >
                    {here ? <span style={{ display: 'inline-block', width: '60%', height: '60%', borderRadius: '50%', background: '#2a7fd0', border: '3px solid #1b2838' }} aria-hidden /> : isGoal ? '★' : isStart ? '●' : wrongCell === id ? '×' : ''}
                  </button>
                );
              }),
            )}
            <svg width={boardW} height={boardW} style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 2 }} aria-hidden>
              {showing && <polyline points={line(path)} fill="none" stroke="#2a7fd0" strokeWidth={Math.max(4, cell * 0.14)} strokeLinecap="round" strokeLinejoin="round" opacity="0.85" />}
              {!showing && reached > 0 && <polyline points={line(path.slice(0, reached + 1))} fill="none" stroke="#1f9d6a" strokeWidth={Math.max(3, cell * 0.1)} strokeLinecap="round" strokeLinejoin="round" opacity="0.7" />}
            </svg>
          </div>
        </div>
      </div>
      {status}
      <InDock>
        <div className="row center" style={{ flexWrap: 'nowrap', gap: 6 }}>
          {phase === 'show' ? (
            <button type="button" className="btn primary big" onClick={hidePath}>
              おぼえた！
            </button>
          ) : phase === 'roundDone' && round + 1 < PATH_ROUNDS ? (
            <button type="button" className="btn primary big" onClick={nextRound}>
              つぎの ラウンド
            </button>
          ) : (
            <>
              <button type="button" className="btn" onClick={undo} disabled={solved || phase !== 'input' || index === 0}>
                もどす
              </button>
              {hintLevel >= 3 && phase === 'input' && (
                <button type="button" className="btn" onClick={peek} disabled={solved}>
                  つぎの 1マス
                </button>
              )}
              <button type="button" className={phase === 'input' ? 'btn' : 'btn primary big'} onClick={watch} disabled={solved || phase === 'roundDone'}>
                {records[round]?.views ? 'もういちど みる' : 'みる'}
              </button>
            </>
          )}
        </div>
      </InDock>
    </section>
  );
}
