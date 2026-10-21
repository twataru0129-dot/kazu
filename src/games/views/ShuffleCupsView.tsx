import { useCallback, useEffect, useRef, useState } from 'react';
import { arrangementAfter, BALL_NAME, CUP_ROUNDS, positionOf, type CupRoundRecord, type ShuffleCupsAnswer, type ShuffleCupsPuzzle } from '../../domain/games/shuffleCups';
import { play } from '../../audio/sfx';
import { InDock } from '../../components/Dock';
import type { GameViewProps } from '../types';
import { useFitCell } from '../useFitCell';

type Phase = 'ready' | 'show' | 'shuffle' | 'answer' | 'result';
interface Draft {
  round: number;
  records: CupRoundRecord[];
  picks: number[][];
}

/** ボールは 色だけで なく もようでも 見わける */
const BALL = [
  { fill: '#e8504f', label: 'あかい ボール' },
  { fill: '#3d7fd9', label: 'あおい ボール' },
];
const SHOW_MS = 1400;
/** いれかえと いれかえの あいだ（ミリ秒） */
const GAP_MS = 30;
/** ヒント3：つぎの 再生を ゆっくりに する 倍率 */
const SLOW_FACTOR = 1.7;
/** うごきを へらす 設定：いれかわる 2つを しめす 時間の 下限と、つぎまでの あいだ */
const REDUCED_STEP_MS = 800;
const REDUCED_GAP_MS = 350;
/**
 * 1回の いれかえで かならず 見せる コマの 数。1コマで すすむのは 1/MIN_FRAMES まで。
 * チャレンジ 170ms でも ふつうの 画面（60・30・20fps）では おそく ならない 大きさ（170/3 ≒ 57ms）にし、
 * とても 遅い 端末でも 弧の とちゅうを 2回は 見せる
 */
const MIN_FRAMES = 3;
const LIFT = 44;

const freshRecords = (p: ShuffleCupsPuzzle): CupRoundRecord[] => p.rounds.map((r) => ({ views: 0, wrong: 0, balls: r.balls.length, cleared: false }));

function Ball({ kind, size }: { kind: number; size: number }) {
  return (
    <svg viewBox="0 0 40 40" width={size} height={size} role="img" aria-label={BALL[kind].label}>
      <circle cx="20" cy="20" r="17" fill={BALL[kind].fill} stroke="#1b2838" strokeWidth="2.5" />
      {kind === 0 ? <circle cx="14" cy="14" r="5" fill="#fff" opacity=".7" /> : <path d="M6 16 H34 M6 24 H34" stroke="#fff" strokeWidth="4" opacity=".8" />}
    </svg>
  );
}

export function ShuffleCupsView({ puzzle: p, submit, solved, status, draft, saveDraft, reportProgress, hintLevel }: GameViewProps<ShuffleCupsPuzzle, ShuffleCupsAnswer, Draft>) {
  const [round, setRound] = useState(draft?.round ?? 0);
  const [records, setRecords] = useState<CupRoundRecord[]>(() => draft?.records ?? freshRecords(p));
  const [picks, setPicks] = useState<number[][]>(() => draft?.picks ?? []);
  // 再開したときは かならず「みる」を まつ（カップは はじめの ならび）
  const [phase, setPhase] = useState<Phase>('ready');
  const [arr, setArr] = useState<number[]>(() => arrangementAfter(p.cups, []));
  /** いま うごいている いれかえ（i 番目・すすみぐあい 0..1） */
  const [move, setMove] = useState<{ i: number; t: number } | null>(null);
  const [lifted, setLifted] = useState<'none' | 'all' | 'picked'>('none');
  const [sel, setSel] = useState<number[]>([]);
  const [ok, setOk] = useState(false);
  const [message, setMessage] = useState(draft ? 'つづきから。「みる」を おしてね' : '「みる」を おすと ボールが みえるよ');
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const raf = useRef<number | null>(null);
  const playId = useRef(0);
  const reduced = typeof document !== 'undefined' && document.documentElement.dataset.motion === 'reduced';
  const cur = p.rounds[Math.min(round, CUP_ROUNDS - 1)];
  const balls = cur.balls.length;
  const { ref, cell: slot } = useFitCell<HTMLDivElement>(p.cups, { min: 48, max: 96, rows: 2 });

  useEffect(() => reportProgress({ round, phase }), [round, phase, reportProgress]);

  const clearAll = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    if (raf.current !== null) cancelAnimationFrame(raf.current);
    raf.current = null;
    playId.current++;
  };
  const later = (ms: number, fn: () => void) => {
    const id = playId.current;
    timers.current.push(setTimeout(() => playId.current === id && fn(), ms));
  };

  /** 画面が かくれたら とめて、はじめの ならびで「みる」待ちに もどす */
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const stop = useCallback(() => {
    clearAll();
    setMove(null);
    if (phaseRef.current !== 'show' && phaseRef.current !== 'shuffle') return;
    setLifted('none');
    setArr(arrangementAfter(p.cups, []));
    setMessage('とちゅうで とまったよ。「もういちど みる」を おしてね');
    setPhase('ready');
  }, [p.cups]);

  useEffect(() => {
    const onHide = () => document.visibilityState === 'hidden' && stop();
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', stop);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', stop);
      clearAll();
    };
  }, [stop]);

  const persist = (next: Partial<Draft>) => saveDraft({ round, records, picks, ...next });

  const runSwap = (i: number) => {
    const swaps = cur.swaps;
    if (i >= swaps.length) {
      setMove(null);
      setPhase('answer');
      setMessage(balls > 1 ? 'あかの ボールは どこ？' : 'ボールは どの カップ？');
      return;
    }
    const slow = hintLevel >= 3 ? SLOW_FACTOR : 1;
    const ms = p.swapMs * slow;
    const id = playId.current;
    const done = () => {
      setArr(arrangementAfter(p.cups, swaps, i + 1));
      setMove(null);
      // つぎの いれかえは、いまの いれかえが おわってから（かさならない）
      later(document.documentElement.dataset.motion === 'reduced' ? REDUCED_GAP_MS : GAP_MS, () => runSwap(i + 1));
    };
    play('move');
    // 設定は その時点の ものを つかう（とちゅうで かわっても つぎの いれかえから したがう）
    if (document.documentElement.dataset.motion === 'reduced') {
      // うごきを へらす：いれかわる 2つを しめしてから、ならびを 1回で かえる（1つずつ おえる）。
      // 速い 難易度でも おいかけられる ように、しめす 時間は 下げすぎない
      setMove({ i, t: 0 });
      later(Math.max(p.swapMs, REDUCED_STEP_MS) * slow, done);
      return;
    }
    // すすみぐあいは 1コマごとの 時間を たして きめる（いれかえを はじめた 時刻から 数える ので、
    // さいしょの コマも むだに ならない）。iPhone などで コマが とんでも、1コマで すすむのは 1/MIN_FRAMES まで
    // （瞬間移動に 見えない。弧の とちゅうを かならず 通る）
    let elapsed = 0;
    let last = performance.now();
    setMove({ i, t: 0 });
    const step = (now: number) => {
      if (playId.current !== id) return;
      elapsed += Math.min(Math.max(0, now - last), ms / MIN_FRAMES);
      last = Math.max(last, now);
      const t = Math.min(1, elapsed / ms);
      setMove({ i, t });
      if (t < 1) raf.current = requestAnimationFrame(step);
      else done();
    };
    raf.current = requestAnimationFrame(step);
  };

  const watch = () => {
    if (solved || phase === 'show' || phase === 'shuffle') return;
    clearAll();
    const nextRecords = records.map((r, k) => (k === round ? { ...r, views: r.views + 1 } : r));
    setRecords(nextRecords);
    persist({ records: nextRecords });
    setSel([]);
    setArr(arrangementAfter(p.cups, []));
    setPhase('show');
    setLifted('all');
    setMessage(balls > 1 ? 'あかと あおの ボールを よく みてね' : 'ボールの ばしょを よく みてね');
    later(SHOW_MS, () => {
      setLifted('none');
      setPhase('shuffle');
      setMessage('カップを おいかけてね…');
      later(500, () => runSwap(0));
    });
  };

  const check = (chosen: number[]) => {
    const right = chosen.every((c, i) => c === cur.balls[i]);
    const nextPicks = [...picks.slice(0, round), chosen];
    if (!right) {
      const nextRecords = records.map((r, k) => (k === round ? { ...r, wrong: r.wrong + 1, firstTry: r.firstTry ?? false } : r));
      setRecords(nextRecords);
      setLifted('all');
      setOk(false);
      setPhase('result');
      setMessage('ざんねん！ ボールは ここ だったよ。もういちど みて やってみよう');
      persist({ records: nextRecords });
      submit({ picks: nextPicks, rounds: nextRecords });
      return;
    }
    const nextRecords = records.map((r, k) => (k === round ? { ...r, cleared: true, firstTry: r.firstTry ?? true } : r));
    setRecords(nextRecords);
    setPicks(nextPicks);
    setLifted('picked');
    setOk(true);
    setPhase('result');
    if (round + 1 >= CUP_ROUNDS) {
      setMessage('あたり！ ぜんぶ できた！');
      persist({ records: nextRecords, picks: nextPicks });
      submit({ picks: nextPicks, rounds: nextRecords });
      return;
    }
    play('correct');
    setMessage('あたり！');
    persist({ round: round + 1, records: nextRecords, picks: nextPicks });
  };

  const tapCup = (cup: number) => {
    if (solved || phase !== 'answer') return;
    play('tap');
    if (sel.includes(cup)) {
      setSel(sel.filter((c) => c !== cup));
      return;
    }
    if (balls === 1) {
      setSel([cup]);
      check([cup]);
      return;
    }
    const next = sel.length >= balls ? sel : [...sel, cup];
    setSel(next);
    setMessage(next.length < balls ? 'あおの ボールは どこ？' : '「こたえる」を おしてね');
  };

  const nextRound = () => {
    setRound(round + 1);
    setPhase('ready');
    setLifted('none');
    setSel([]);
    setArr(arrangementAfter(p.cups, []));
    setMessage(`ラウンド ${round + 2}。「みる」を おしてね`);
  };

  // 2つの ボールの ときは、えらんだ じゅんに あか・あお
  const selKind = (cup: number) => sel.indexOf(cup);
  const width = slot * p.cups;
  const cupW = Math.round(slot * 0.82);
  const cupH = Math.round(slot * 0.95);
  const ballSize = Math.round(slot * 0.5);
  const boardH = cupH + LIFT + 14;
  const swap = move ? cur.swaps[move.i] : null;
  const posX = (cup: number) => {
    const at = positionOf(arr, cup);
    if (!swap || reduced || (cup !== swap[0] && cup !== swap[1])) return { x: at * slot, y: 0 };
    const other = cup === swap[0] ? swap[1] : swap[0];
    const to = positionOf(arr, other);
    const t = move!.t;
    const e = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
    // かたほうは うえ、もう かたほうは した を とおる（かさならない）
    const arc = Math.sin(Math.PI * t) * (cup === swap[0] ? -LIFT * 0.55 : 12);
    return { x: (at + (to - at) * e) * slot, y: arc };
  };
  const isLifted = (cup: number) => lifted === 'all' || (lifted === 'picked' && sel.includes(cup));
  const ballIn = (cup: number) => cur.balls.indexOf(cup);

  return (
    <section className="stack">
      <div className="card stack" style={{ gap: 6, padding: 10 }}>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <strong>
            ラウンド {Math.min(round + 1, CUP_ROUNDS)}／{CUP_ROUNDS}
          </strong>
          <span className="muted small">
            {p.cups}こ・{cur.swaps.length}かい いれかえ{balls > 1 ? '・ボール 2こ' : ''}
          </span>
        </div>
        <div className="center-text" aria-live="polite" style={{ fontWeight: 700, minHeight: '1.5em' }} data-testid="cups-message">
          {message}
        </div>
        {balls > 1 && phase === 'answer' && (
          <div className="row center small" style={{ gap: 12 }}>
            {[0, 1].map((k) => (
              <span key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontWeight: sel.length === k ? 800 : 400, textDecoration: sel.length === k ? 'underline' : undefined }}>
                <Ball kind={k} size={20} /> {BALL_NAME[k]}：{sel[k] !== undefined ? `ひだりから ${positionOf(arr, sel[k]) + 1}ばんめ` : 'まだ'}
              </span>
            ))}
          </div>
        )}
      </div>
      <div style={{ overflowX: 'auto' }}>
        <div ref={ref} role="group" aria-label="カップ" data-phase={phase} data-swap={move ? move.i : undefined} style={{ position: 'relative', width, height: boardH, margin: '0 auto' }}>
          {/* カップ ID ごとに 1つ。ならび順は かえず、場所は 計算で きめる */}
          {Array.from({ length: p.cups }, (_, cup) => {
            const { x, y } = posX(cup);
            const at = positionOf(arr, cup);
            const k = selKind(cup);
            const b = ballIn(cup);
            const lift = isLifted(cup);
            const showBall = lift && b >= 0;
            const highlight = reduced && swap && (cup === swap[0] || cup === swap[1]);
            return (
              <div key={cup} style={{ position: 'absolute', left: 0, top: 0, width: slot, height: boardH, transform: `translate(${x}px, ${y}px)` }}>
                {showBall && (
                  <div style={{ position: 'absolute', left: (slot - ballSize) / 2, top: boardH - ballSize - 4 }}>
                    <Ball kind={b} size={ballSize} />
                  </div>
                )}
                <button
                  type="button"
                  aria-label={`ひだりから ${at + 1}ばんめの カップ${k >= 0 && balls > 1 ? `（${BALL_NAME[k]}）` : ''}`}
                  aria-pressed={k >= 0}
                  disabled={solved || phase !== 'answer'}
                  onClick={() => tapCup(cup)}
                  style={{
                    position: 'absolute',
                    left: (slot - cupW) / 2,
                    top: LIFT + 10 - (lift ? LIFT : 0),
                    width: cupW,
                    height: cupH,
                    padding: 0,
                    border: 'none',
                    background: 'transparent',
                    transition: reduced ? 'none' : 'top 260ms ease',
                    outline: highlight ? '4px dashed #f4b400' : k >= 0 ? `4px solid ${BALL[k].fill}` : undefined,
                    outlineOffset: 2,
                    borderRadius: 10,
                    cursor: phase === 'answer' ? 'pointer' : 'default',
                  }}
                >
                  <svg viewBox="0 0 60 64" width="100%" height="100%" aria-hidden style={{ display: 'block' }}>
                    <path d="M12 4 H48 L56 58 Q30 66 4 58 Z" fill="#c0584c" stroke="#1b2838" strokeWidth="3" strokeLinejoin="round" />
                    <path d="M9 50 Q30 56 51 50" stroke="#8e3a31" strokeWidth="3" fill="none" />
                    <ellipse cx="30" cy="6" rx="18" ry="3.5" fill="#d9786c" stroke="#1b2838" strokeWidth="2" />
                  </svg>
                  {k >= 0 && balls > 1 && (
                    <span style={{ position: 'absolute', left: '50%', top: '45%', transform: 'translate(-50%, -50%)', background: '#fff', borderRadius: 8, padding: '0 4px', fontSize: '0.8rem', fontWeight: 800, color: BALL[k].fill }}>{BALL_NAME[k]}</span>
                  )}
                </button>
              </div>
            );
          })}
          {reduced && swap && <div className="center-text small" style={{ position: 'absolute', left: 0, right: 0, top: 0, fontWeight: 800 }}>⇄ いれかわるよ</div>}
        </div>
      </div>
      {status}
      <InDock>
        <div className="row center" style={{ flexWrap: 'nowrap' }}>
          {phase === 'result' && ok && round + 1 < CUP_ROUNDS ? (
            <button type="button" className="btn primary big" onClick={nextRound}>
              つぎの ラウンド
            </button>
          ) : (
            <button type="button" className={phase === 'answer' && balls > 1 ? 'btn' : 'btn primary big'} onClick={watch} disabled={solved || phase === 'show' || phase === 'shuffle' || (phase === 'result' && ok)}>
              {records[round]?.views ? 'もういちど みる' : 'みる'}
            </button>
          )}
          {phase === 'answer' && balls > 1 && (
            <button type="button" className="btn primary big" onClick={() => check(sel)} disabled={solved || sel.length < balls}>
              こたえる
            </button>
          )}
        </div>
      </InDock>
    </section>
  );
}
