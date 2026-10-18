import { useState } from 'react';
import { evaluateLinear, type AddSubOp } from '../../domain/expr';
import type { Make10Answer, Make10Puzzle } from '../../domain/games/make10';
import { play } from '../../audio/sfx';
import type { GameViewProps } from '../types';
import { InDock } from '../../components/Dock';

export function Make10View({ puzzle: p, submit, solved, status }: GameViewProps<Make10Puzzle, Make10Answer>) {
  const [order, setOrder] = useState<string[]>([]);
  const [ops, setOps] = useState<AddSubOp[]>([]);
  const byId = new Map(p.cards.map((c) => [c.id, c.value]));
  const hand = p.cards.filter((c) => !order.includes(c.id));
  const current = order.length ? evaluateLinear({ nums: order.map((id) => byId.get(id)!), ops }) : null;

  const add = (id: string) => {
    if (solved) return;
    play('tap');
    if (order.length > 0) setOps((o) => [...o, '+']);
    setOrder((o) => [...o, id]);
  };
  const remove = (idx: number) => {
    if (solved) return;
    setOrder((o) => o.filter((_, i) => i !== idx));
    setOps((o) => (idx === 0 ? o.slice(1) : o.filter((_, i) => i !== idx - 1)));
  };
  const toggle = (i: number) => {
    if (solved || p.ops.length < 2) return;
    play('tap');
    setOps((o) => o.map((x, k) => (k === i ? (x === '+' ? '-' : '+') : x)));
  };

  // 3まい＋きごう2つが 375px はばに 1れつで おさまる大きさ
  const cardStyle = { minWidth: 60, minHeight: 80, fontSize: '2rem', borderRadius: 14, padding: '0 8px' } as const;
  return (
    <section className="stack">
      <div className="card center-text">
        <div className="muted">カードを ぜんぶ 1かいずつ つかって</div>
        <div className="big-expr">{p.target} を つくろう</div>
        {p.ops.length > 1 ? (
          <div className="small" style={{ fontWeight: 700, color: '#b85a12' }}>
            <span className="phrase">＋と−を おして</span> <span className="phrase">きりかえよう！</span>
          </div>
        ) : (
          <div className="small muted">たしざんだけ つかうよ</div>
        )}
      </div>
      <div className="card" aria-label="しき">
        <div className="row center" style={{ minHeight: 90, gap: 6, flexWrap: 'nowrap' }}>
          {order.length === 0 && <span className="muted">したの カードを タップして ならべよう</span>}
          {order.map((id, i) => (
            <span key={id} className="row" style={{ gap: 6, flexWrap: 'nowrap' }}>
              {i > 0 &&
                (p.ops.length > 1 ? (
                  <button
                    type="button"
                    className="op-toggle num"
                    data-op={ops[i - 1]}
                    onClick={() => toggle(i - 1)}
                    disabled={solved}
                    aria-label={`きごう ${ops[i - 1] === '+' ? 'たす' : 'ひく'}。おすと ${ops[i - 1] === '+' ? 'ひく' : 'たす'} に かわる`}
                  >
                    {ops[i - 1] === '+' ? '+' : '−'}
                  </button>
                ) : (
                  <span className="num" style={{ fontSize: '1.6rem', minWidth: 24, textAlign: 'center' }} aria-label="たす">
                    +
                  </span>
                ))}
              <button type="button" className="btn num" style={{ ...cardStyle, borderColor: '#f07a2a', background: '#fff7ef' }} onClick={() => remove(i)} aria-label={`${byId.get(id)} の カードを もどす`}>
                {byId.get(id)}
              </button>
            </span>
          ))}
        </div>
        {current && (
          <div className="center-text muted" aria-live="polite">
            いま：<span className="num">{current.value}</span>
          </div>
        )}
      </div>
      {status}
      <InDock>
      <div className="row center" aria-label="てもちの カード" style={{ gap: 6 }}>
        {hand.map((c) => (
          <button key={c.id} type="button" className="btn num" style={{ ...cardStyle, boxShadow: '0 3px 0 #e0c3a8' }} onClick={() => add(c.id)} aria-label={`${c.value} の カード`}>
            {c.value}
          </button>
        ))}
      </div>
      <div className="row center">
        <button
          type="button"
          className="btn"
          onClick={() => {
            setOrder([]);
            setOps([]);
          }}
          disabled={solved || order.length === 0}
        >
          やりなおす
        </button>
        <button type="button" className="btn primary big" disabled={solved || hand.length > 0} onClick={() => submit({ order, ops })}>
          こたえる
        </button>
      </div>
      </InDock>
    </section>
  );
}
