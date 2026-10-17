import { useState } from 'react';
import { transformOk, type KufuuAnswer, type KufuuPuzzle } from '../../domain/games/kufuu';
import { parseAnswer } from '../../domain/input';
import { play } from '../../audio/sfx';
import { NumberPad } from '../../components/NumberPad';
import { AnswerBox } from '../../components/ui';
import type { GameViewProps } from '../types';

export function KufuuView({ puzzle: p, submit, solved, status }: GameViewProps<KufuuPuzzle, KufuuAnswer>) {
  const [left, setLeft] = useState(p.a);
  const [right, setRight] = useState(p.b);
  const [stage, setStage] = useState<'move' | 'answer'>('move');
  const [value, setValue] = useState('');
  const t = transformOk(p, left, right);
  const isRound = (n: number) => n % p.unit === 0;

  const move = (toLeft: boolean, k: number) => {
    if (solved) return;
    const nl = toLeft ? left + k : left - k;
    const nr = toLeft ? right - k : right + k;
    if (nl < 1 || nr < 1) return;
    play('move');
    setLeft(nl);
    setRight(nr);
  };

  const block = (n: number, label: string) => (
    <div
      className="num"
      aria-label={label}
      style={{
        minWidth: 96,
        padding: '12px 14px',
        borderRadius: 16,
        fontSize: '2.2rem',
        textAlign: 'center',
        background: isRound(n) ? '#e3f6ec' : '#fff',
        border: `3px solid ${isRound(n) ? '#1f9d6a' : '#cfe0ee'}`,
      }}
    >
      {n}
      {isRound(n) && <div style={{ fontSize: '0.75rem', color: '#146c49' }}>きりのよい かず</div>}
    </div>
  );

  return (
    <section className="stack">
      <div className="card center-text">
        <div className="muted">もとの しき</div>
        <div className="num" style={{ fontSize: '1.8rem' }}>
          {p.a} + {p.b}
        </div>
        <div className="small muted">かずを うつして、どちらかを {p.unit} の まとまりに しよう。こたえは かわらないよ。</div>
      </div>
      <div className="card">
        <div className="row center" style={{ gap: 10 }}>
          {block(left, `ひだりの かず ${left}`)}
          <span className="num" style={{ fontSize: '2rem' }}>
            +
          </span>
          {block(right, `みぎの かず ${right}`)}
        </div>
        {stage === 'move' && (
          <div className="stack" style={{ marginTop: 12 }}>
            {p.steps.map((k) => (
              <div key={k} className="row center">
                <button type="button" className="btn" onClick={() => move(true, k)} disabled={solved || right - k < 1}>
                  ← {k} うつす
                </button>
                <button type="button" className="btn" onClick={() => move(false, k)} disabled={solved || left - k < 1}>
                  {k} うつす →
                </button>
              </div>
            ))}
            <div className="row center">
              <button
                type="button"
                className="btn ghost"
                onClick={() => {
                  setLeft(p.a);
                  setRight(p.b);
                }}
              >
                もとに もどす
              </button>
              <button type="button" className="btn primary" disabled={!t.round} onClick={() => setStage('answer')}>
                この しきで けいさん
              </button>
            </div>
          </div>
        )}
      </div>
      {status}
      {stage === 'answer' && (
        <>
          <div className="row center">
            <span className="num" style={{ fontSize: '1.8rem' }}>
              {left} + {right} =
            </span>
            <AnswerBox value={value} active />
          </div>
          <NumberPad value={value} onChange={setValue} onSubmit={() => submit({ left, right, result: parseAnswer(value) })} disabled={solved} maxDigits={4} />
          {!solved && (
            <button type="button" className="btn ghost" onClick={() => setStage('move')}>
              ← うつしかたを かえる
            </button>
          )}
        </>
      )}
    </section>
  );
}
