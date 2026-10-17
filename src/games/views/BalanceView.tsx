import { useState } from 'react';
import { correctSide, formatSide, sideValue, type BalanceAnswer, type BalancePuzzle } from '../../domain/games/balance';
import type { GameViewProps } from '../types';

export function BalanceView({ puzzle: p, submit, solved, status }: GameViewProps<BalancePuzzle, BalanceAnswer>) {
  const [picked, setPicked] = useState<BalanceAnswer | null>(null);
  // 天秤は、正解したあとに本当の重さ（答え）どおりに傾く
  const result = solved ? correctSide(p) : 'equal';
  const angle = result === 'left' ? -10 : result === 'right' ? 10 : 0;
  const choose = (a: BalanceAnswer) => {
    if (solved) return;
    setPicked(a);
    submit(a);
  };
  const L = formatSide(p.left);
  const R = formatSide(p.right);
  return (
    <section className="stack">
      <div className="card" style={{ padding: 8 }}>
        <svg viewBox="0 0 320 210" width="100%" role="img" aria-label={`ひだり ${L}、みぎ ${R}`} style={{ maxHeight: 260 }}>
          <rect x="140" y="190" width="40" height="10" rx="4" fill="#8aa0b5" />
          <path d="M160 190 L160 60" stroke="#8aa0b5" strokeWidth="8" strokeLinecap="round" />
          <g style={{ transform: `rotate(${angle}deg)`, transformOrigin: '160px 60px', transition: 'transform .6s cubic-bezier(.3,1.4,.6,1)' }}>
            <rect x="30" y="54" width="260" height="12" rx="6" fill="#5b6b7d" />
            <g style={{ transform: `rotate(${-angle}deg)`, transformOrigin: '60px 60px', transition: 'transform .6s' }}>
              <path d="M60 62 L20 130 M60 62 L100 130" stroke="#9fb3c6" strokeWidth="2" />
              <path d="M10 130 Q60 160 110 130 Z" fill="#8fd3ff" stroke="#4aa3df" strokeWidth="2" />
              <text x="60" y="122" textAnchor="middle" fontSize="22" fontWeight="800" fill="#1b2838">
                {L}
              </text>
              {solved && (
                <text x="60" y="178" textAnchor="middle" fontSize="18" fontWeight="800" fill="#146c49">
                  = {sideValue(p.left)}
                </text>
              )}
            </g>
            <g style={{ transform: `rotate(${-angle}deg)`, transformOrigin: '260px 60px', transition: 'transform .6s' }}>
              <path d="M260 62 L220 130 M260 62 L300 130" stroke="#9fb3c6" strokeWidth="2" />
              <path d="M210 130 Q260 160 310 130 Z" fill="#ffc2a8" stroke="#ef7d57" strokeWidth="2" />
              <text x="260" y="122" textAnchor="middle" fontSize="22" fontWeight="800" fill="#1b2838">
                {R}
              </text>
              {solved && (
                <text x="260" y="178" textAnchor="middle" fontSize="18" fontWeight="800" fill="#146c49">
                  = {sideValue(p.right)}
                </text>
              )}
            </g>
          </g>
          <circle cx="160" cy="60" r="9" fill="#5b6b7d" />
        </svg>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <span className="num" style={{ fontSize: '1.4rem' }}>{L}</span>
          <span className="num" style={{ fontSize: '1.4rem' }}>{R}</span>
        </div>
      </div>
      <p className="center-text" style={{ margin: 0, fontWeight: 700 }}>
        どちらが おおきい？
      </p>
      {status}
      <div className="row center" role="group" aria-label="こたえ" style={{ flexWrap: 'nowrap', gap: 6 }}>
        {(
          [
            ['left', '◀ ひだり'],
            ['equal', '＝ おなじ'],
            ['right', 'みぎ ▶'],
          ] as const
        ).map(([k, label]) => (
          <button key={k} type="button" className={`btn big ${picked === k && solved ? 'good' : ''}`} style={{ flex: '1 1 0', minWidth: 0, padding: '10px 6px', fontSize: '1rem' }} onClick={() => choose(k)} disabled={solved}>
            {label}
          </button>
        ))}
      </div>
    </section>
  );
}
