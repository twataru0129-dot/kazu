import { useState } from 'react';
import { COIN_VALUES, type CoinsPuzzle } from '../../domain/games/coins';
import { parseAnswer } from '../../domain/input';
import { NumberPad } from '../../components/NumberPad';
import { AnswerBox } from '../../components/ui';
import type { GameViewProps } from '../types';
import { Coin } from './Coin';

export function CoinsView({ puzzle: p, submit, solved, status, hintLevel }: GameViewProps<CoinsPuzzle, number | null>) {
  const [value, setValue] = useState('');
  const [grouped, setGrouped] = useState(false);
  const showGroups = grouped || hintLevel >= 3;
  return (
    <section className="stack">
      <div className="card" style={{ background: '#f6efe3', borderColor: '#e6d6bd' }} aria-label="つくえの うえの おかね">
        {!showGroups ? (
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${p.cols}, 1fr)`, gap: 8, justifyItems: 'center', alignItems: 'center' }}>
            {Array.from({ length: p.cols * p.rows }, (_, i) => {
              const c = p.coins.find((k) => k.row * p.cols + k.col === i);
              return <div key={i} style={{ minHeight: 76, display: 'flex', alignItems: 'center' }}>{c && <Coin value={c.value} size={72} />}</div>;
            })}
          </div>
        ) : (
          <div className="stack">
            {[...COIN_VALUES].reverse().map((v) => {
              const n = p.coins.filter((c) => c.value === v).length;
              if (!n) return null;
              return (
                <div key={v} className="row" style={{ gap: 4 }}>
                  {Array.from({ length: n }, (_, i) => (
                    <Coin key={i} value={v} size={52} />
                  ))}
                  <span className="small muted">× {n}まい</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
      <div className="row center">
        <button type="button" className="btn" onClick={() => setGrouped(!grouped)} aria-pressed={showGroups}>
          {showGroups ? 'もとの ならびに もどす' : 'しゅるいごとに まとめる'}
        </button>
      </div>
      {status}
      <div className="row center">
        <span style={{ fontWeight: 700 }}>ぜんぶで</span>
        <AnswerBox value={value} active={!solved} label="きんがく" />
        <span style={{ fontWeight: 700 }}>えん</span>
      </div>
      <NumberPad value={value} onChange={setValue} onSubmit={() => submit(parseAnswer(value))} disabled={solved} maxDigits={5} />
    </section>
  );
}
