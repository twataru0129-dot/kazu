import { useEffect, useRef, useState } from 'react';
import { evaluateLinear, type AddSubOp } from '../../domain/expr';
import type { Make10Answer, Make10Puzzle } from '../../domain/games/make10';
import { play } from '../../audio/sfx';
import type { GameViewProps } from '../types';
import { InDock } from '../../components/Dock';

export function Make10View({ puzzle: p, submit, solved, status }: GameViewProps<Make10Puzzle, Make10Answer>) {
  const [order, setOrder] = useState<string[]>([]);
  const [ops, setOps] = useState<AddSubOp[]>([]);
  /** つぎに ならべる カードの まえに つける きごう（えらぶまで かわらない） */
  const [nextOp, setNextOp] = useState<AddSubOp>('+');
  const canMinus = p.ops.includes('-');
  const exprRef = useRef<HTMLDivElement>(null);
  // カードを ならべたら、しきが 下の ボタンに かくれないように 見える位置へ（小さい画面向け）
  useEffect(() => {
    const el = exprRef.current;
    if (order.length === 0 || !el) return;
    const r = el.getBoundingClientRect();
    const dockH = document.querySelector<HTMLElement>('[data-testid="dock"]')?.offsetHeight ?? 0;
    const topbarH = document.querySelector<HTMLElement>('.topbar')?.offsetHeight ?? 0;
    // しきの下の はしを ドックの すぐ上へ。ただし しきの上が 上のバーに かくれるほどは 動かさない
    const need = Math.min(r.bottom - (window.innerHeight - dockH - 8), r.top - topbarH - 4);
    if (need > 0) window.scrollBy(0, need);
  }, [order.length]);
  const byId = new Map(p.cards.map((c) => [c.id, c.value]));
  const hand = p.cards.filter((c) => !order.includes(c.id));
  const current = order.length ? evaluateLinear({ nums: order.map((id) => byId.get(id)!), ops }) : null;

  const add = (id: string) => {
    if (solved) return;
    play('tap');
    // 1まいめは そのまま。2まいめから、えらんでいる きごうを つける
    if (order.length > 0) setOps((o) => [...o, canMinus ? nextOp : '+']);
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
      <div className="card">
        <div className="center-text">
          <div className="muted small">カードを ぜんぶ 1かいずつ つかって</div>
          <div className="big-expr" style={{ margin: 0 }}>
            {p.target} を つくろう
          </div>
          {canMinus ? (
            <div className="small" style={{ fontWeight: 700, color: '#b85a12' }}>
              <span className="phrase">＋か −を えらんでから</span> <span className="phrase">カードを タップしよう！</span>
            </div>
          ) : (
            <div className="small muted">たしざんだけ つかうよ</div>
          )}
        </div>
        <div ref={exprRef} aria-label="しき" className="make10-expr" style={{ borderTop: '2px dashed #e3ebf2', marginTop: 8, paddingTop: 8 }}>
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
      </div>
      {status}
      <InDock>
      {canMinus && (
        <div className="row center" role="radiogroup" aria-label="つぎに つかう きごう" style={{ gap: 10, flexWrap: 'nowrap' }}>
          <span className="small muted" aria-hidden>
            つぎの きごう
          </span>
          {(['+', '-'] as const).map((o) => (
            <button
              key={o}
              type="button"
              role="radio"
              aria-checked={nextOp === o}
              aria-label={o === '+' ? 'たす（＋）' : 'ひく（−）'}
              className="op-pick num"
              data-op={o}
              onClick={() => {
                if (solved) return;
                play('tap');
                setNextOp(o);
              }}
              disabled={solved}
            >
              {o === '+' ? '＋' : '−'}
            </button>
          ))}
        </div>
      )}
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
            setNextOp('+');
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
