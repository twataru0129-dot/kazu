import { useState } from 'react';
import { basketMatches, type ShoppingAnswer, type ShoppingPuzzle } from '../../domain/games/shopping';
import { parseAnswer } from '../../domain/input';
import { play } from '../../audio/sfx';
import { NumberPad } from '../../components/NumberPad';
import { AnswerBox, Feedback } from '../../components/ui';
import type { GameViewProps } from '../types';
import { InDock } from '../../components/Dock';
import { ItemIcon } from './ItemIcon';

export function ShoppingView({ puzzle: p, submit, solved, status }: GameViewProps<ShoppingPuzzle, ShoppingAnswer>) {
  const [basket, setBasket] = useState<Record<string, number>>({});
  const [stage, setStage] = useState<'pick' | 'pay'>('pick');
  const [value, setValue] = useState('');
  const [pickMsg, setPickMsg] = useState<string | null>(null);
  const item = (id: string) => p.items.find((i) => i.id === id)!;
  const memo = p.order.map((o) => `${item(o.itemId).name} ${o.qty}こ`).join('、');
  const addItem = (id: string, k: number) => {
    if (stage !== 'pick') return;
    play('tap');
    setPickMsg(null);
    setBasket((b) => {
      const n = Math.max(0, (b[id] ?? 0) + k);
      const next = { ...b, [id]: n };
      if (n === 0) delete next[id];
      return next;
    });
  };
  const toRegister = () => {
    if (basketMatches(p, basket)) {
      setStage('pay');
      setPickMsg(null);
    } else setPickMsg('メモと かごの なかみを くらべてみよう');
  };
  const inBasket = Object.entries(basket).filter(([, n]) => n > 0);
  return (
    <section className="stack">
      <div className="card" style={{ background: '#fffdf4', borderColor: '#f0e2b0' }}>
        <h3>📝 かいものメモ</h3>
        <p style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>{memo}</p>
        <p style={{ margin: '6px 0 0' }}>{p.mode === 'change' ? `${p.pay}えん はらうと、おつりは いくら？` : 'ぜんぶで いくら？'}</p>
      </div>
      {stage === 'pick' ? (
        <>
          <div className="game-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(96px, 1fr))' }} aria-label="おみせの たな">
            {p.items.map((it) => (
              <button key={it.id} type="button" className="game-card" style={{ minHeight: 120 }} onClick={() => addItem(it.id, 1)} aria-label={`${it.name} ${it.price}えん を かごに いれる`}>
                <ItemIcon icon={it.icon} />
                <strong>{it.name}</strong>
                <span className="num">{it.price}えん</span>
              </button>
            ))}
          </div>
          <div className="card">
            <h3>🧺 かご</h3>
            {inBasket.length === 0 && <p className="muted" style={{ margin: 0 }}>しょうひんを タップして いれよう</p>}
            <div className="stack">
              {inBasket.map(([id, n]) => (
                <div key={id} className="row" style={{ justifyContent: 'space-between' }}>
                  <span className="row" style={{ gap: 6 }}>
                    <ItemIcon icon={item(id).icon} size={32} />
                    {item(id).name}（{item(id).price}えん）× <span className="num">{n}</span>
                  </span>
                  <span className="row" style={{ gap: 6 }}>
                    <button type="button" className="btn" onClick={() => addItem(id, -1)} aria-label={`${item(id).name} を 1こ へらす`}>
                      −
                    </button>
                    <button type="button" className="btn" onClick={() => addItem(id, 1)} aria-label={`${item(id).name} を 1こ ふやす`}>
                      ＋
                    </button>
                  </span>
                </div>
              ))}
            </div>
          </div>
          {status}
          {pickMsg && <Feedback kind="try">{pickMsg}</Feedback>}
          <InDock>
            <button type="button" className="btn primary big" onClick={toRegister} disabled={inBasket.length === 0}>
              レジへ すすむ
            </button>
          </InDock>
        </>
      ) : (
        <>
          <div className="card">
            <h3>🧺 かいもの</h3>
            {inBasket.map(([id, n]) => (
              <div key={id} className="row">
                <ItemIcon icon={item(id).icon} size={32} />
                <span>
                  {item(id).name} <span className="num">{item(id).price}えん</span>
                  {n > 1 ? ` × ${n}こ` : ''}
                </span>
              </div>
            ))}
          </div>
          {status}
          <InDock>
            <div className="row center">
              <span style={{ fontWeight: 700 }}>{p.mode === 'change' ? 'おつり' : 'ごうけい'}</span>
              <AnswerBox value={value} active={!solved} label="きんがく" />
              <span style={{ fontWeight: 700 }}>えん</span>
            </div>
          </InDock>
          <NumberPad value={value} onChange={setValue} onSubmit={() => submit({ basket, value: parseAnswer(value) })} disabled={solved} maxDigits={5} />
          {!solved && (
            <button type="button" className="btn ghost" onClick={() => setStage('pick')}>
              ← かごに もどる
            </button>
          )}
        </>
      )}
    </section>
  );
}
