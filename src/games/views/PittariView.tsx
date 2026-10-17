import { useState } from 'react';
import type { AddSubOp } from '../../domain/expr';
import { formatLinear } from '../../domain/expr';
import type { PittariAnswer, PittariPuzzle } from '../../domain/games/pittari';
import { parseAnswer } from '../../domain/input';
import { NumberPad } from '../../components/NumberPad';
import { AnswerBox } from '../../components/ui';
import type { GameViewProps } from '../types';

const sym = (o: AddSubOp) => (o === '+' ? '+' : '−');

export function PittariView({ puzzle: p, submit, found, status }: GameViewProps<PittariPuzzle, PittariAnswer>) {
  const [vals, setVals] = useState<string[]>(() => Array(p.terms).fill(''));
  const [ops, setOps] = useState<AddSubOp[]>(() => Array(p.terms - 1).fill('+'));
  const [focus, setFocus] = useState(0);
  const toggle = (i: number) => {
    if (p.ops.length < 2) return;
    setOps((o) => o.map((x, k) => (k === i ? (x === '+' ? '-' : '+') : x)));
  };
  const onSubmit = () => {
    const j = submit({ nums: vals.map((v) => parseAnswer(v)), ops });
    if (j.correct) {
      setVals(Array(p.terms).fill(''));
      setFocus(0);
    }
  };
  return (
    <section className="stack">
      <div className="card center-text">
        <div className="muted">こたえが この かずに なる しきを つくろう</div>
        <div className="big-expr">{p.target}</div>
        <div className="small muted">
          つかえる かず：{p.min}〜{p.max}
          {p.forbidden.length > 0 && `（${p.forbidden.join('・')} は つかえない）`}
          {p.ops.length > 1 && '・きごうを タップで ＋／− を かえられるよ'}
        </div>
        <div className="row center" style={{ gap: 6, marginTop: 10 }}>
          {vals.map((v, i) => (
            <span key={i} className="row" style={{ gap: 6 }}>
              {i > 0 &&
                (p.ops.length > 1 ? (
                  <button type="button" className="btn" style={{ fontSize: '1.6rem', minWidth: 52 }} onClick={() => toggle(i - 1)} aria-label={`きごう ${ops[i - 1] === '+' ? 'たす' : 'ひく'}（タップで かえる）`}>
                    {sym(ops[i - 1])}
                  </button>
                ) : (
                  <span className="num" style={{ fontSize: '1.6rem' }}>
                    +
                  </span>
                ))}
              <AnswerBox value={v} active={focus === i} onClick={() => setFocus(i)} label={`${i + 1}つめの かず`} small />
            </span>
          ))}
          <span className="num" style={{ fontSize: '1.6rem' }}>
            = {p.target}
          </span>
        </div>
      </div>
      {status}
      <div className="row center">
        <button type="button" className="btn" onClick={() => setFocus((focus + p.terms - 1) % p.terms)} aria-label="まえの はこ">
          ◀
        </button>
        <span className="small muted">{focus + 1}つめの かず</span>
        <button type="button" className="btn" onClick={() => setFocus((focus + 1) % p.terms)} aria-label="つぎの はこ">
          ▶
        </button>
      </div>
      <NumberPad value={vals[focus]} onChange={(v) => setVals((o) => o.map((x, i) => (i === focus ? v : x)))} onSubmit={onSubmit} allowEmptySubmit maxDigits={3} />
      {found.length > 0 && (
        <div className="card">
          <h3>みつけた しき（{found.length}）</h3>
          <div className="chips">
            {found.map((f) => {
              const a = f.answer as PittariAnswer;
              return (
                <span key={f.key} className="chip num" style={{ fontSize: '1rem' }}>
                  {formatLinear({ nums: a.nums as number[], ops: a.ops })} = {p.target}
                </span>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
