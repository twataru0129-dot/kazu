import { useState } from 'react';
import type { SequencePuzzle } from '../../domain/games/sequence';
import { parseAnswer } from '../../domain/input';
import { NumberPad } from '../../components/NumberPad';
import type { GameViewProps } from '../types';

export function SequenceView({ puzzle: p, submit, solved, status }: GameViewProps<SequencePuzzle, number | null>) {
  const [value, setValue] = useState('');
  return (
    <section className="stack">
      <div className="card center-text">
        <div className="banner info" style={{ justifyContent: 'center' }}>
          きまり：{p.premise}
        </div>
        <div className="row center" style={{ gap: 6, marginTop: 12 }} aria-label="かずの ならび">
          {p.values.map((v, i) => (
            <span key={i} className="row" style={{ gap: 6 }}>
              {i > 0 && <span className="muted" aria-hidden>→</span>}
              <span
                className="num"
                style={{
                  minWidth: 56,
                  minHeight: 60,
                  padding: '6px 8px',
                  borderRadius: 14,
                  fontSize: '1.7rem',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: i === p.hidden ? '#fff' : '#e6f1fc',
                  border: i === p.hidden ? '3px dashed #2a7fd0' : '2px solid #b9d6f2',
                  color: i === p.hidden && value === '' ? '#9fb3c6' : undefined,
                }}
                aria-label={i === p.hidden ? 'しかく（こたえを いれる ばしょ）' : String(v)}
              >
                {i === p.hidden ? (solved ? v : value || '□') : v}
              </span>
            </span>
          ))}
        </div>
      </div>
      {status}
      <NumberPad value={value} onChange={setValue} onSubmit={() => submit(parseAnswer(value))} disabled={solved} maxDigits={5} />
    </section>
  );
}
