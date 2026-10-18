import { useState } from 'react';
import { missingPremise, termParts, type MissingAnswer, type MissingPuzzle } from '../../domain/games/missing';
import { OP_SYMBOL } from '../../domain/types';
import { parseAnswer } from '../../domain/input';
import { NumberPad } from '../../components/NumberPad';
import { AnswerBox } from '../../components/ui';
import type { GameViewProps } from '../types';

export function MissingView({ puzzle: p, submit, solved, status }: GameViewProps<MissingPuzzle, MissingAnswer>) {
  const [vals, setVals] = useState<string[]>(() => p.blanks.map(() => ''));
  const [focus, setFocus] = useState(0);
  const many = p.blanks.length > 1;
  const isDigit = p.blanks[focus].digit !== undefined;

  const onChange = (v: string) => {
    // 1けたの □ は、あとから おした すうじで いれかえる
    const next = isDigit ? v.slice(-1) : v;
    setVals((old) => old.map((x, i) => (i === focus ? next : x)));
    if (isDigit && next !== '' && focus + 1 < p.blanks.length && vals[focus + 1] === '') setFocus(focus + 1);
  };

  const term = (t: 0 | 1 | 2) => (
    <span className="row" style={{ gap: 2, flexWrap: 'nowrap' }}>
      {termParts(p, t).map((part, k) =>
        part.kind === 'num' ? (
          <span key={k} className="num" style={{ fontSize: '2rem' }}>
            {part.text}
          </span>
        ) : (
          <AnswerBox
            key={k}
            small
            value={vals[part.index]}
            placeholder="□"
            active={!solved && focus === part.index}
            onClick={solved ? undefined : () => setFocus(part.index)}
            label={many ? `${part.index + 1}つめの しかく` : 'しかく（こたえを いれる ばしょ）'}
          />
        ),
      )}
    </span>
  );

  return (
    <section className="stack">
      <div className="card center-text">
        <div className="banner info" style={{ justifyContent: 'center' }}>
          {missingPremise(p)}
        </div>
        <div className="row center" style={{ gap: 8, marginTop: 12, flexWrap: 'wrap' }} aria-label="しき">
          {term(0)}
          <span className="num" style={{ fontSize: '2rem' }}>
            {OP_SYMBOL[p.op]}
          </span>
          {term(1)}
          <span className="num" style={{ fontSize: '2rem' }}>
            =
          </span>
          {term(2)}
        </div>
        {many && !solved && (
          <p className="small muted" style={{ margin: '8px 0 0' }}>
            □ を タップして えらんでから すうじを いれてね
          </p>
        )}
      </div>
      {status}
      <NumberPad
        value={vals[focus]}
        onChange={onChange}
        onSubmit={() => submit(vals.map((v) => parseAnswer(v)))}
        disabled={solved}
        allowEmptySubmit={many}
        maxDigits={isDigit ? 2 : 3}
      />
    </section>
  );
}
