import { useEffect, useRef, useState } from 'react';
import { SPEED_MS, type FlashPuzzle, type FlashSpeed } from '../../domain/games/flash';
import { parseAnswer } from '../../domain/input';
import { play } from '../../audio/sfx';
import { NumberPad } from '../../components/NumberPad';
import { AnswerBox } from '../../components/ui';
import type { GameViewProps } from '../types';

const SPEED_LABEL: Record<FlashSpeed, string> = { slow: 'ゆっくり', normal: 'ふつう', fast: 'はやい' };

export function FlashView({ puzzle: p, submit, solved, status }: GameViewProps<FlashPuzzle, number | null>) {
  const [speed, setSpeed] = useState<FlashSpeed>(() => (p.defaultShowMs >= 1300 ? 'slow' : p.defaultShowMs >= 800 ? 'normal' : 'fast'));
  const [phase, setPhase] = useState<'ready' | 'showing' | 'answer'>('ready');
  const [shown, setShown] = useState<number | null>(null);
  const [plays, setPlays] = useState(0);
  const [value, setValue] = useState('');
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const start = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setPhase('showing');
    setPlays((n) => n + 1);
    const show = SPEED_MS[speed];
    const gap = 250; // つぎの数との区切り（同じ数が続いても分かるように）
    let t = 700;
    setShown(null);
    p.numbers.forEach((n) => {
      timers.current.push(
        setTimeout(() => {
          setShown(n);
          play('tap');
        }, t),
      );
      t += show;
      timers.current.push(setTimeout(() => setShown(null), t));
      t += gap;
    });
    timers.current.push(setTimeout(() => setPhase('answer'), t));
  };

  return (
    <section className="stack">
      <div className="card center-text" style={{ minHeight: 210, display: 'flex', flexDirection: 'column', justifyContent: 'center', background: '#1b2838', color: '#fff' }} aria-live="assertive">
        {phase === 'ready' && <div style={{ fontSize: '1.1rem' }}>{p.numbers.length}この かずが でるよ。ぜんぶ たそう！</div>}
        {phase === 'showing' && (
          <div className="num" style={{ fontSize: '5.5rem', color: '#ffd34d', minHeight: '1.2em' }}>
            {shown ?? ''}
          </div>
        )}
        {phase === 'answer' && <div style={{ fontSize: '1.1rem' }}>ぜんぶで いくつ？ ゆっくり かんがえて いいよ。</div>}
      </div>
      {phase !== 'showing' && (
        <div className="row center" role="radiogroup" aria-label="はやさ">
          {(Object.keys(SPEED_MS) as FlashSpeed[]).map((s) => (
            <button key={s} type="button" role="radio" aria-checked={speed === s} aria-pressed={speed === s} className="chip" onClick={() => setSpeed(s)}>
              {SPEED_LABEL[s]}
            </button>
          ))}
        </div>
      )}
      {phase === 'ready' && (
        <button type="button" className="btn primary big" onClick={start}>
          スタート
        </button>
      )}
      {phase === 'answer' && (
        <>
          {status}
          <div className="row center">
            <AnswerBox value={value} active={!solved} label="こたえ" />
            {!solved && (
              <button type="button" className="btn" onClick={start}>
                もういちど みる
              </button>
            )}
          </div>
          {solved && <div className="center-text muted num">{p.numbers.join(' + ')}</div>}
          <NumberPad value={value} onChange={setValue} onSubmit={() => submit(parseAnswer(value))} disabled={solved} maxDigits={4} />
          <div className="center-text small muted">みた かいすう：{plays}</div>
        </>
      )}
    </section>
  );
}
