import { useEffect, useRef, useState } from 'react';
import { checkTap, hintLine, HUNT_ROUNDS, huntTargets, numberHunt, RULE_SHORT, RULE_TEXT, type HuntRoundRecord, type NumberHuntAnswer, type NumberHuntPuzzle } from '../../domain/games/numberHunt';
import { play } from '../../audio/sfx';
import { useProfile } from '../../app/AppContext';
import { InDock } from '../../components/Dock';
import type { GameViewProps } from '../types';
import { useFitCell } from '../useFitCell';
import { formatClock, useActiveTimer } from '../useActiveTimer';

interface Draft {
  round: number;
  /** いまの ラウンドで 見つけた 数 */
  index: number;
  found: number[][];
  records: HuntRoundRecord[];
  timerOn: boolean;
  /** いまの ラウンドの 時間（ミリ秒） */
  roundMs: number;
  started: boolean;
}

const freshRecords = (): HuntRoundRecord[] => Array.from({ length: HUNT_ROUNDS }, () => ({ mistakes: 0, timeMs: 0, restarts: 0, cleared: false }));

export function NumberHuntView({ puzzle: p, difficulty, submit, solved, status, draft, saveDraft, reportProgress, hintLevel }: GameViewProps<NumberHuntPuzzle, NumberHuntAnswer, Draft>) {
  const { repo, profile } = useProfile();
  const targets = huntTargets(p);
  const [round, setRound] = useState(draft?.round ?? 0);
  const [index, setIndex] = useState(draft?.index ?? 0);
  const [found, setFound] = useState<number[][]>(() => draft?.found ?? []);
  const [records, setRecords] = useState<HuntRoundRecord[]>(() => draft?.records ?? freshRecords());
  const [timerOn, setTimerOn] = useState(draft?.timerOn ?? false);
  // 再開したときは「スタート」を まつ（時間を 勝手に すすめない）
  const [started, setStarted] = useState(false);
  const [paused, setPaused] = useState(false);
  const [roundDone, setRoundDone] = useState(false);
  const [wrongCell, setWrongCell] = useState<number | null>(null);
  const [message, setMessage] = useState(draft?.started ? 'つづきから。「スタート」を おしてね' : '「スタート」を おすと すうじが でるよ');
  const [best, setBest] = useState<{ ms: number; isNew: boolean } | null>(null);
  const timer = useActiveTimer(started && !paused && !roundDone && !solved, draft?.roundMs ?? 0);
  const wrongTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const { ref, cell } = useFitCell<HTMLDivElement>(p.size, { min: 42, max: 84, gap: 5 });

  useEffect(() => reportProgress({ round, index }), [round, index, reportProgress]);
  useEffect(() => () => clearTimeout(wrongTimer.current), []);

  const curFound = found[round] ?? [];
  const persist = (next: Partial<Draft> = {}) =>
    saveDraft({ round, index, found, records, timerOn, roundMs: timer.read(), started: started || index > 0, ...next });

  // アプリを かくした ときも 時間を のこす
  const persistRef = useRef(persist);
  persistRef.current = persist;
  useEffect(() => {
    const onHide = () => document.visibilityState === 'hidden' && persistRef.current();
    document.addEventListener('visibilitychange', onHide);
    return () => document.removeEventListener('visibilitychange', onHide);
  }, []);

  const answerOf = (f: number[][], rec: HuntRoundRecord[]): NumberHuntAnswer => ({ found: f, rounds: rec, timerOn, timeMs: rec.reduce((s, r) => s + r.timeMs, 0) });

  const tap = (value: number, cellIndex: number) => {
    if (solved || !started || paused || roundDone) return;
    if (curFound.includes(value)) return;
    const res = checkTap(p, index, value);
    if (res === 'wrong') {
      play('soft');
      setWrongCell(cellIndex);
      clearTimeout(wrongTimer.current);
      wrongTimer.current = setTimeout(() => setWrongCell(null), 450);
      const nextRec = records.map((r, k) => (k === round ? { ...r, mistakes: r.mistakes + 1, firstTry: r.firstTry ?? false } : r));
      setRecords(nextRec);
      setMessage(`ちがうよ。つぎは「${targets[index]}」`);
      persist({ records: nextRec });
      // さいしょの まちがいも 記録に のこす（ゲーム ぜんたいの 1回目は 不正解に なる）
      submit(answerOf([...found.slice(0, round), curFound], nextRec));
      return;
    }
    play('tap');
    const nextFound = [...found.slice(0, round), [...curFound, value]];
    setFound(nextFound);
    if (res === 'next') {
      setIndex(index + 1);
      setMessage('');
      persist({ found: nextFound, index: index + 1 });
      return;
    }
    // ラウンド クリア
    const ms = Math.round(timer.read());
    const nextRec = records.map((r, k) => (k === round ? { ...r, cleared: true, firstTry: r.firstTry ?? true, timeMs: ms } : r));
    setRecords(nextRec);
    setIndex(index + 1);
    setRoundDone(true);
    if (round + 1 >= HUNT_ROUNDS) {
      setMessage('ぜんぶ できた！');
      persist({ found: nextFound, records: nextRec, index: index + 1 });
      const ans = answerOf(nextFound, nextRec);
      submit(ans);
      if (timerOn) {
        // おなじ むずかしさ・ルールの じこベスト（タイマーを 出した 記録だけ）
        void repo.listAttempts(profile.id).then((list) => {
          const prev = list
            .filter((a) => a.gameId === 'number-hunt' && a.difficulty === difficulty && a.finalCorrect)
            .filter((a) => {
              const q = a.questionSnapshot as NumberHuntPuzzle;
              return q?.rule === p.rule && numberHunt.key(q) !== numberHunt.key(p); // いまの あそびは のぞく
            })
            .map((a) => (a.answerSnapshot as { last?: NumberHuntAnswer } | null)?.last)
            .filter((x): x is NumberHuntAnswer => !!x && x.timerOn && x.timeMs > 0)
            .map((x) => x.timeMs);
          const prevBest = prev.length ? Math.min(...prev) : null;
          setBest({ ms: prevBest === null ? ans.timeMs : Math.min(prevBest, ans.timeMs), isNew: prevBest === null || ans.timeMs < prevBest });
        });
      }
      return;
    }
    play('correct');
    setMessage(`できた！${timerOn ? `（${formatClock(ms)}）` : ''}`);
    persist({ round: round + 1, index: 0, found: nextFound, records: nextRec, roundMs: 0, started: false });
  };

  // はじめた ときは、盤 ぜんたいが 下の ボタンに かくれない 位置まで うごかす
  useEffect(() => {
    if (!started) return;
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const dock = document.querySelector<HTMLElement>('[data-testid="dock"]');
    const viewH = window.visualViewport?.height ?? window.innerHeight;
    const over = rect.bottom - (viewH - (dock?.offsetHeight ?? 0) - 6);
    if (over > 0) window.scrollBy(0, Math.min(over, rect.top - 4));
  }, [started, round, ref]);

  const startRound = () => {
    setStarted(true);
    setMessage('');
    persist({ started: true });
  };
  const nextRound = () => {
    setRound(round + 1);
    setIndex(0);
    setRoundDone(false);
    setStarted(false);
    timer.reset(0);
    setMessage(`ラウンド ${round + 2}。「スタート」を おしてね`);
  };
  const restartRound = () => {
    if (solved || roundDone) return;
    const nextFound = [...found.slice(0, round), []];
    const nextRec = records.map((r, k) => (k === round ? { ...r, restarts: r.restarts + 1 } : r));
    setFound(nextFound);
    setIndex(0);
    setRecords(nextRec);
    timer.reset(0);
    setMessage('おなじ ならびで もういちど');
    persist({ found: nextFound, index: 0, records: nextRec, roundMs: 0 });
  };

  const layout = p.rounds[Math.min(round, HUNT_ROUNDS - 1)];
  const target = targets[Math.min(index, targets.length - 1)];
  const targetCell = layout.indexOf(target);
  const tr = Math.floor(targetCell / p.size);
  const tc = targetCell % p.size;
  const showHint2 = hintLevel >= 2 && started && !roundDone && !solved;
  const showHint3 = hintLevel >= 3 && started && !roundDone && !solved;
  const line = hintLine(target);
  const covered = !started || paused;

  return (
    <section className="stack">
      <div className="card stack" style={{ gap: 2, padding: '6px 10px' }}>
        <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'nowrap', gap: 6 }}>
          <strong>
            ラウンド {Math.min(round + 1, HUNT_ROUNDS)}／{HUNT_ROUNDS}
          </strong>
          {timerOn && (
            <span className="num" style={{ fontWeight: 800 }} data-testid="hunt-timer">
              ⏱ {formatClock(timer.ms)}
            </span>
          )}
        </div>
        {p.rule !== 'all' && (
          <div className="center-text" data-testid="hunt-rule" style={{ fontWeight: 800, fontSize: '1.05rem', background: '#f1ebfb', color: '#5b3aa4', borderRadius: 10, padding: '2px 6px' }}>
            {RULE_SHORT[p.rule]}だけ さがそう
          </div>
        )}
        <div className="row center" style={{ gap: 8, flexWrap: 'nowrap' }} aria-live="polite">
          <span style={{ fontWeight: 700 }}>つぎは</span>
          <span
            data-testid="hunt-target"
            className={hintLevel >= 1 && started && !roundDone ? 'pop' : ''}
            style={{ fontSize: hintLevel >= 1 ? '2.6rem' : '2rem', fontWeight: 900, lineHeight: 1.1, minWidth: 56, textAlign: 'center', color: '#d97706' }}
          >
            {roundDone || solved ? '✓' : target}
          </span>
          <span className="small muted">
            {Math.min(index, targets.length)}/{targets.length}
          </span>
        </div>
        <div className="center-text small" style={{ minHeight: '1.3em', fontWeight: 700 }} data-testid="hunt-message">
          {message || (p.rule !== 'all' ? RULE_TEXT[p.rule] : '')}
        </div>
      </div>
      {!started && round === 0 && index === 0 && !solved && (
        <div className="row center" role="radiogroup" aria-label="タイマー" style={{ gap: 6 }}>
          <button type="button" role="radio" className="chip" aria-checked={!timerOn} aria-pressed={!timerOn} onClick={() => setTimerOn(false)}>
            タイマー ださない
          </button>
          <button type="button" role="radio" className="chip" aria-checked={timerOn} aria-pressed={timerOn} onClick={() => setTimerOn(true)}>
            じかんを はかる
          </button>
        </div>
      )}
      <div ref={ref} style={{ position: 'relative' }}>
        <div
          role="grid"
          aria-label="すうじの ばん"
          data-phase={covered ? 'cover' : roundDone ? 'done' : 'play'}
          style={{ display: 'grid', gridTemplateColumns: `repeat(${p.size}, ${cell}px)`, gap: 5, justifyContent: 'center' }}
        >
          {layout.map((v, i) => {
            const r = Math.floor(i / p.size);
            const c = i % p.size;
            const done = curFound.includes(v) || roundDone;
            const isTarget = !done && (p.rule === 'all' || targets.includes(v));
            const band = showHint2 && (line === 'row' ? r === tr : c === tc);
            const glow = showHint3 && i === targetCell;
            return (
              <button
                key={i}
                type="button"
                role="gridcell"
                aria-label={covered ? `うえから ${r + 1}ばんめ ひだりから ${c + 1}ばんめ` : `${v}${done && curFound.includes(v) ? '（みつけた）' : ''}`}
                disabled={covered || solved || roundDone}
                onClick={() => tap(v, i)}
                className={wrongCell === i ? 'shake-soft' : ''}
                style={{
                  width: cell,
                  height: cell,
                  padding: 0,
                  borderRadius: 12,
                  border: glow ? '3px dashed #f4b400' : wrongCell === i ? '3px solid #d9534f' : '2px solid #c6d6e4',
                  background: covered ? '#e8eef5' : curFound.includes(v) ? '#d7f1e3' : band ? '#fff6d6' : '#fff',
                  color: curFound.includes(v) ? '#7aa58e' : '#1b2838',
                  fontSize: Math.round(cell * 0.42),
                  fontWeight: 800,
                  position: 'relative',
                  opacity: !covered && !isTarget && !curFound.includes(v) && p.rule !== 'all' ? 0.92 : 1,
                }}
              >
                {covered ? '' : v}
                {!covered && curFound.includes(v) && (
                  <span aria-hidden style={{ position: 'absolute', right: 4, top: 2, fontSize: Math.round(cell * 0.26), color: '#1f9d6a' }}>
                    ✓
                  </span>
                )}
              </button>
            );
          })}
        </div>
        {paused && (
          <div className="center-text" style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }}>
            <strong style={{ background: '#fff', padding: '6px 12px', borderRadius: 10 }}>おやすみちゅう（じかんは とまって いるよ）</strong>
          </div>
        )}
      </div>
      {solved && timerOn && (
        <p className="center-text pop" style={{ margin: 0, fontWeight: 800 }} data-testid="hunt-result">
          ぜんぶで {formatClock(records.reduce((s, r) => s + r.timeMs, 0))}・まちがい {records.reduce((s, r) => s + r.mistakes, 0)}かい
          {best && (best.isNew ? '　じこベスト！' : `（じこベスト ${formatClock(best.ms)}）`)}
        </p>
      )}
      {solved && !timerOn && (
        <p className="center-text pop" style={{ margin: 0, fontWeight: 800 }}>
          まちがい {records.reduce((s, r) => s + r.mistakes, 0)}かい
        </p>
      )}
      {status}
      <InDock>
        <div className="row center" style={{ gap: 6, flexWrap: 'nowrap' }}>
          {!started && !roundDone && !solved ? (
            <button type="button" className="btn primary big" onClick={startRound}>
              スタート
            </button>
          ) : roundDone && round + 1 < HUNT_ROUNDS ? (
            <button type="button" className="btn primary big" onClick={nextRound}>
              つぎの ラウンド
            </button>
          ) : (
            <>
              <button type="button" className="btn" onClick={restartRound} disabled={solved || roundDone || index === 0}>
                もういちど
              </button>
              {timerOn && (
                <button type="button" className="btn" aria-pressed={paused} onClick={() => setPaused(!paused)} disabled={solved || roundDone}>
                  {paused ? 'つづける' : 'やすむ'}
                </button>
              )}
            </>
          )}
        </div>
      </InDock>
    </section>
  );
}
