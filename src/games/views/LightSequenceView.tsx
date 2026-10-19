import { useCallback, useEffect, useRef, useState } from 'react';
import { checkInput, LIGHT_ROUNDS, playbackSchedule, roundLength, roundSequence, type LightRoundRecord, type LightSequenceAnswer, type LightSequencePuzzle } from '../../domain/games/lightSequence';
import { play, playNote } from '../../audio/sfx';
import type { GameViewProps } from '../types';
import { InDock } from '../../components/Dock';

/** ボタンは 色だけでなく マークと 場所でも 見分けられるように */
const BUTTON_COLOR = ['#e8504f', '#3d7fd9', '#2fa36b', '#f2b705', '#7a55c8', '#ef7d57', '#1aa3a3', '#d94f9b', '#6b7c8f'];
const BUTTON_NAME = ['あかの まる', 'あおの さんかく', 'みどりの しかく', 'きいろの ほし', 'むらさきの ひしがた', 'オレンジの ハート', 'みずいろの じゅうじ', 'ピンクの つき', 'はいいろの ろっかく'];
const MARK: string[] = [
  'M50 22a28 28 0 1 0 0.01 0Z',
  'M50 20 L80 76 H20 Z',
  'M24 24 H76 V76 H24 Z',
  'M50 16 L59 40 L84 41 L64 56 L71 82 L50 67 L29 82 L36 56 L16 41 L41 40 Z',
  'M50 16 L82 50 L50 84 L18 50 Z',
  'M50 80 C22 62 18 42 28 32 C37 23 47 28 50 36 C53 28 63 23 72 32 C82 42 78 62 50 80 Z',
  'M42 18 H58 V42 H82 V58 H58 V82 H42 V58 H18 V42 H42 Z',
  'M62 18 A32 32 0 1 0 82 66 A26 26 0 1 1 62 18 Z',
  'M50 16 L79 33 V67 L50 84 L21 67 V33 Z',
];

type Phase = 'ready' | 'playing' | 'input';
interface Draft {
  round: number;
  rounds: LightRoundRecord[];
  inputs: number[][];
  best: number;
}

const freshRounds = (p: LightSequencePuzzle): LightRoundRecord[] => Array.from({ length: LIGHT_ROUNDS }, (_, k) => ({ length: roundLength(p, k), views: 0, retries: 0, cleared: false }));

export function LightSequenceView({ puzzle: p, submit, solved, status, draft, saveDraft, reportProgress, hintLevel }: GameViewProps<LightSequencePuzzle, LightSequenceAnswer, Draft>) {
  const [round, setRound] = useState(draft?.round ?? 0);
  const [rounds, setRounds] = useState<LightRoundRecord[]>(() => draft?.rounds ?? freshRounds(p));
  const [inputs, setInputs] = useState<number[][]>(() => draft?.inputs ?? []);
  const [best, setBest] = useState(draft?.best ?? 0);
  // 再開したときは かならず「みる」を まつ（順番を 自動で 光らせない）
  const [phase, setPhase] = useState<Phase>('ready');
  const [input, setInput] = useState<number[]>([]);
  const [lit, setLit] = useState<number | null>(null);
  const [pressed, setPressed] = useState<number | null>(null);
  const [message, setMessage] = useState<string>(draft ? 'つづきから。「みる」を おしてね' : '「みる」を おすと ひかるよ');
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const playId = useRef(0);
  const reduced = typeof document !== 'undefined' && document.documentElement.dataset.motion === 'reduced';

  useEffect(() => reportProgress({ round, input }), [round, input, reportProgress]);

  const clearTimers = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    playId.current++;
  };

  /** 再生を とめて「みる」待ちに もどす（画面が かくれた・ほかの画面へ 行った とき） */
  const stopPlayback = useCallback(() => {
    clearTimers();
    setLit(null);
    setPressed(null);
    setPhase((ph) => (ph === 'playing' ? 'ready' : ph));
  }, []);

  useEffect(() => {
    const onHide = () => document.visibilityState === 'hidden' && stopPlayback();
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', stopPlayback);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', stopPlayback);
      clearTimers();
    };
  }, [stopPlayback]);

  const persist = (next: Partial<Draft>) => saveDraft({ round, rounds, inputs, best, ...next });

  const watch = () => {
    if (solved || phase === 'playing') return;
    clearTimers();
    const id = playId.current;
    const nextRounds = rounds.map((r, k) => (k === round ? { ...r, views: r.views + 1 } : r));
    setRounds(nextRounds);
    persist({ rounds: nextRounds });
    setInput([]);
    setPhase('playing');
    setMessage('みててね…');
    const sched = playbackSchedule(p, round);
    const lead = 500; // 「みる」を おしてから すこし まつ
    for (const { button, at } of sched) {
      timers.current.push(
        setTimeout(() => {
          if (playId.current !== id) return;
          setLit(button);
          playNote(button, p.onMs / 1000);
        }, lead + at),
      );
      timers.current.push(setTimeout(() => playId.current === id && setLit(null), lead + at + p.onMs));
    }
    const end = lead + (sched.length - 1) * (p.onMs + p.gapMs) + p.onMs + 250;
    timers.current.push(
      setTimeout(() => {
        if (playId.current !== id) return;
        setPhase('input');
        setMessage('ひかった じゅんに おしてね');
      }, end),
    );
  };

  const tap = (b: number) => {
    if (solved || phase !== 'input') return;
    playNote(b, 0.18);
    setPressed(b);
    const pressId = playId.current;
    timers.current.push(setTimeout(() => playId.current === pressId && setPressed(null), 180));
    const next = [...input, b];
    const res = checkInput(p, round, next);
    if (res === 'ok') {
      setInput(next);
      return;
    }
    if (res === 'wrong') {
      // まちがえたら おなじラウンドを もういちど（つぎへは すすまない）
      const nextRounds = rounds.map((r, k) => (k === round ? { ...r, retries: r.retries + 1 } : r));
      setRounds(nextRounds);
      setInput([]);
      setPhase('ready');
      setMessage('もういちど みて、やってみよう');
      persist({ rounds: nextRounds });
      submit({ inputs: [...inputs.slice(0, round), next], rounds: nextRounds, best });
      return;
    }
    // ラウンド クリア
    const nextInputs = [...inputs.slice(0, round), next];
    const nextRounds = rounds.map((r, k) => (k === round ? { ...r, cleared: true } : r));
    const nextBest = Math.max(best, next.length);
    setInputs(nextInputs);
    setRounds(nextRounds);
    setBest(nextBest);
    setInput([]);
    if (round + 1 >= LIGHT_ROUNDS) {
      setPhase('ready');
      setMessage('ぜんぶ できた！');
      persist({ inputs: nextInputs, rounds: nextRounds, best: nextBest });
      submit({ inputs: nextInputs, rounds: nextRounds, best: nextBest });
      return;
    }
    play('correct');
    setRound(round + 1);
    setPhase('ready');
    setMessage(`できた！ つぎは ${roundLength(p, round + 1)}こ だよ`);
    persist({ round: round + 1, inputs: nextInputs, rounds: nextRounds, best: nextBest });
  };

  const cols = p.buttons === 4 ? 2 : 3;
  const size = `clamp(64px, calc((min(100vw, 560px) - 64px) / ${cols}), 120px)`;
  const len = roundLength(p, round);
  const hintNext = hintLevel >= 3 && phase === 'input' ? roundSequence(p, round)[Math.min(input.length, len - 1)] : null;

  return (
    <section className="stack">
      <div className="card stack" style={{ gap: 6, padding: 10 }}>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <strong>
            ラウンド {Math.min(round + 1, LIGHT_ROUNDS)}／{LIGHT_ROUNDS}
          </strong>
          <span className="muted small">{len}こ ひかる</span>
        </div>
        <div className="center-text" aria-live="polite" style={{ fontWeight: 700, minHeight: '1.5em' }} data-testid="light-message">
          {message}
        </div>
        {phase === 'input' && (
          <div className="row center" aria-label={`${input.length}こ おした（ぜんぶで ${len}こ）`} style={{ gap: 4 }}>
            {Array.from({ length: len }, (_, i) => (
              <span key={i} style={{ width: 14, height: 14, borderRadius: 7, background: i < input.length ? '#2a7fd0' : '#d9e4ee' }} />
            ))}
          </div>
        )}
      </div>
      <div role="group" aria-label="ひかる ボタン" data-phase={phase} style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, ${size})`, gap: 10, justifyContent: 'center' }}>
        {Array.from({ length: p.buttons }, (_, b) => {
          const on = lit === b || pressed === b;
          const color = BUTTON_COLOR[b];
          return (
            <button
              key={b}
              type="button"
              aria-label={BUTTON_NAME[b]}
              data-lit={lit === b ? 'true' : undefined}
              onClick={() => tap(b)}
              disabled={solved || phase !== 'input'}
              style={{
                width: size,
                height: size,
                padding: 0,
                borderRadius: 22,
                border: on ? '5px solid #1b2838' : hintNext === b ? '5px dashed #f4b400' : `3px solid ${color}`,
                background: on ? color : `color-mix(in srgb, ${color} 18%, white)`,
                boxShadow: on ? `0 0 0 6px color-mix(in srgb, ${color} 35%, transparent)` : '0 3px 0 #c6d6e4',
                transform: on && !reduced ? 'scale(1.06)' : undefined,
                transition: reduced ? 'none' : 'transform 80ms, background 80ms',
                opacity: phase === 'playing' && !on ? 0.75 : 1,
                cursor: phase === 'input' ? 'pointer' : 'default',
              }}
            >
              <svg viewBox="0 0 100 100" width="60%" height="60%" aria-hidden style={{ display: 'block', margin: '0 auto' }}>
                <path d={MARK[b]} fill={on ? '#fff' : color} stroke="#1b2838" strokeWidth={on ? 4 : 3} strokeLinejoin="round" />
              </svg>
            </button>
          );
        })}
      </div>
      {status}
      <InDock>
        <div className="row center">
          <button type="button" className="btn primary big" onClick={watch} disabled={solved || phase === 'playing'}>
            {rounds[round]?.views ? 'もういちど みる' : 'みる'}
          </button>
        </div>
      </InDock>
    </section>
  );
}
