import { useState } from 'react';
import { applyRule, type MachinePuzzle } from '../../domain/games/machine';
import { parseAnswer } from '../../domain/input';
import { NumberPad } from '../../components/NumberPad';
import { AnswerBox } from '../../components/ui';
import type { GameViewProps } from '../types';

export function MachineView({ puzzle: p, submit, solved, status }: GameViewProps<MachinePuzzle, number | null>) {
  const [value, setValue] = useState('');
  const row = (input: number, output: string | number, q = false) => (
    <div className="row center" style={{ gap: 10 }}>
      <span className="num" style={{ minWidth: 56, textAlign: 'center', fontSize: '1.8rem', background: '#fff7d6', borderRadius: 12, padding: '4px 8px' }}>
        {input}
      </span>
      <svg viewBox="0 0 90 40" width="90" height="40" aria-hidden>
        <rect x="18" y="4" width="54" height="32" rx="8" fill="#7a55c8" />
        <circle cx="34" cy="16" r="4" fill="#ffd34d" />
        <circle cx="46" cy="16" r="4" fill="#8fe0bd" />
        <circle cx="58" cy="16" r="4" fill="#ff8f8f" />
        <rect x="30" y="25" width="30" height="5" rx="2.5" fill="#cbb8ef" />
        <path d="M2 20h14M74 20h14" stroke="#7a55c8" strokeWidth="4" strokeLinecap="round" />
        <path d="M82 14l6 6-6 6" stroke="#7a55c8" strokeWidth="4" fill="none" strokeLinecap="round" />
      </svg>
      {q ? <AnswerBox value={solved ? String(output) : value} active={!solved} label="こたえ" /> : <span className="num" style={{ minWidth: 56, textAlign: 'center', fontSize: '1.8rem', background: '#e5f7ef', borderRadius: 12, padding: '4px 8px' }}>{output}</span>}
    </div>
  );
  return (
    <section className="stack">
      <div className="card stack">
        <div className="center-text muted">いれた かずが、ひみつの きまりで かわって でてくるよ</div>
        {p.examples.map((e) => (
          <div key={e.input}>{row(e.input, e.output)}</div>
        ))}
        <hr style={{ border: 0, borderTop: '2px dashed #cfe0ee', width: '100%' }} />
        {row(p.query, applyRule(p.rule, p.query), true)}
      </div>
      {status}
      <NumberPad value={value} onChange={setValue} onSubmit={() => submit(parseAnswer(value))} disabled={solved} maxDigits={4} />
    </section>
  );
}
