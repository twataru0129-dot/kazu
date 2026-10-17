import { useState } from 'react';
import type { DecomposeAnswer, DecomposePuzzle } from '../../domain/games/decompose';
import { parseAnswer } from '../../domain/input';
import { NumberPad } from '../../components/NumberPad';
import { AnswerBox } from '../../components/ui';
import type { GameViewProps } from '../types';
import { InDock } from '../../components/Dock';

export function DecomposeView({ puzzle: p, submit, found, status }: GameViewProps<DecomposePuzzle, DecomposeAnswer>) {
  const [vals, setVals] = useState<string[]>(() => Array(p.parts).fill(''));
  const [focus, setFocus] = useState(0);
  const nums = vals.map((v) => parseAnswer(v));
  const partial = nums.reduce<number>((s, n) => s + (n ?? 0), 0);
  const filled = nums.every((n) => n !== null);

  const onSubmit = () => {
    const j = submit(nums);
    if (j.correct) {
      setVals(Array(p.parts).fill(''));
      setFocus(0);
    }
  };

  return (
    <section className="stack" aria-label="もんだい">
      <div className="card center-text">
        <div className="muted">{p.parts}つの かずに わけよう</div>
        <div className="big-expr" aria-label={`めあての かず ${p.target}`}>
          {p.target}
        </div>
        {p.forbidden.length > 0 && <div className="banner info small" style={{ justifyContent: 'center' }}>{p.forbidden.join('・')} は つかえないよ</div>}
        <div className="row center" style={{ gap: 6, marginTop: 8 }}>
          <span className="num" style={{ fontSize: '1.4rem' }}>
            {p.target} =
          </span>
          {vals.map((v, i) => (
            <span key={i} className="row" style={{ gap: 6 }}>
              {i > 0 && <span className="num" style={{ fontSize: '1.6rem' }}>+</span>}
              <AnswerBox value={v} active={focus === i} onClick={() => setFocus(i)} label={`${i + 1}つめの かず`} small />
            </span>
          ))}
        </div>
        <div className="small muted" style={{ marginTop: 6 }} aria-live="polite">
          いまの ごうけい：<span className="num">{partial}</span>
          {filled && partial !== p.target && (partial < p.target ? `（あと ${p.target - partial}）` : `（${partial - p.target} おおい）`)}
        </div>
      </div>
      {status}
      <InDock>
      <div className="row center">
        <button type="button" className="btn" onClick={() => setFocus((focus + p.parts - 1) % p.parts)} aria-label="まえの はこ">
          ◀
        </button>
        <span className="small muted">{focus + 1}つめの はこに いれる</span>
        <button type="button" className="btn" onClick={() => setFocus((focus + 1) % p.parts)} aria-label="つぎの はこ">
          ▶
        </button>
      </div>
      </InDock>
      <NumberPad
        value={vals[focus]}
        onChange={(v) => setVals((old) => old.map((x, i) => (i === focus ? v : x)))}
        onSubmit={onSubmit}
        allowEmptySubmit
        maxDigits={4}
      />
      {found.length > 0 && (
        <div className="card">
          <h3>みつけた わけかた（{found.length}）</h3>
          <div className="chips">
            {found.map((f) => (
              <span key={f.key} className="chip num" style={{ fontSize: '1rem' }}>
                {(f.answer as number[]).join(' + ')}
              </span>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
