import { useState, type KeyboardEvent } from 'react';
import { fracWords, pizzaTarget, reduce, type Frac, type PizzaAnswer, type PizzaPuzzle } from '../../domain/games/pizzaFractions';
import { play } from '../../audio/sfx';
import { InDock } from '../../components/Dock';
import { useRoom } from '../useRoom';
import type { GameViewProps } from '../types';

const R = 100;
const pt = (deg: number, r: number) => [Math.sin((deg * Math.PI) / 180) * r, -Math.cos((deg * Math.PI) / 180) * r] as const;
const wedge = (a0: number, a1: number, r: number) => {
  const [x0, y0] = pt(a0, r);
  const [x1, y1] = pt(a1, r);
  return `M0 0 L${x0.toFixed(2)} ${y0.toFixed(2)} A${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)} Z`;
};

/** ピースの 中の 具（ペパロニ・バジル）。ピースの 角度の 中に 決まった 位置で おく */
function toppings(a0: number, a1: number, k: number) {
  const span = a1 - a0;
  const pep: [number, number, number][] = [];
  const leaf: [number, number, number][] = [];
  const per = k <= 2 ? 4 : k <= 4 ? 3 : k <= 8 ? 2 : 1;
  for (let i = 0; i < per; i++) {
    const a = a0 + span * ((i + 0.5) / per);
    const r = per === 1 ? 58 : i % 2 === 0 ? 62 : 36;
    const [x, y] = pt(a, r);
    pep.push([x, y, k >= 12 ? 8 : 10.5]);
  }
  const [lx, ly] = pt(a0 + span * 0.3, k >= 8 ? 76 : 48);
  leaf.push([lx, ly, a0 + span * 0.3]);
  return { pep, leaf };
}

/**
 * ピザ（SVG）。耳・チーズ・具・切れ目。えらんだ ピースは 少し 浮かせて 縁どり、えらんで いない ピースは うすく する。
 * onToggle を わたすと ピースを タップ・Enter で えらべる。
 */
export function Pizza({
  slices,
  selected,
  onToggle,
  size,
  label,
  strongCuts = false,
  guide,
}: {
  slices: number;
  selected: readonly number[];
  onToggle?: (i: number) => void;
  size: string | number;
  label: string;
  strongCuts?: boolean;
  /** ヒント2：つくる 量の めやす（12時から 時計まわりに この 割合ぶんを 点線で かこむ） */
  guide?: Frac;
}) {
  const step = 360 / slices;
  const sel = new Set(selected);
  return (
    <svg
      viewBox="-118 -118 236 236"
      width={size}
      height={size}
      role="group"
      aria-label={label}
      style={{
        display: 'block',
        maxWidth: '100%',
        touchAction: 'manipulation',
      }}
    >
      <defs>
        <radialGradient id="pz-cheese" cx="50%" cy="45%" r="60%">
          <stop offset="0%" stopColor="#ffe48a" />
          <stop offset="100%" stopColor="#f9c74f" />
        </radialGradient>
        <radialGradient id="pz-crust" cx="50%" cy="50%" r="50%">
          <stop offset="80%" stopColor="#e2a35a" />
          <stop offset="100%" stopColor="#b9772f" />
        </radialGradient>
      </defs>
      {/* おさら */}
      <circle r={112} fill="#f4f6f8" stroke="#dbe3ea" strokeWidth="3" />
      {Array.from({ length: slices }, (_, i) => {
        const a0 = i * step;
        const a1 = (i + 1) * step;
        const on = sel.has(i);
        const lift = on && !!onToggle;
        const [dx, dy] = pt(a0 + step / 2, lift ? 7 : 0);
        const t = toppings(a0, a1, slices);
        const toggle = () => onToggle?.(i);
        return (
          <g
            key={i}
            transform={`translate(${dx.toFixed(2)} ${dy.toFixed(2)})`}
            opacity={on ? 1 : onToggle ? 0.4 : 0.3}
            role={onToggle ? 'button' : undefined}
            aria-label={onToggle ? `${i + 1}ばんめの ピース${on ? '（えらんだ）' : ''}` : undefined}
            aria-pressed={onToggle ? on : undefined}
            tabIndex={onToggle ? 0 : undefined}
            onClick={onToggle ? toggle : undefined}
            onKeyDown={
              onToggle
                ? (e: KeyboardEvent) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      toggle();
                    }
                  }
                : undefined
            }
            style={{
              cursor: onToggle ? 'pointer' : undefined,
              transition: 'transform 140ms ease, opacity 140ms ease',
              outline: 'none',
            }}
            data-selected={on ? 'true' : undefined}
          >
            <path d={wedge(a0, a1, R)} fill="url(#pz-crust)" />
            <path d={wedge(a0, a1, R - 13)} fill="url(#pz-cheese)" />
            {t.pep.map(([x, y, r], j) => (
              <g key={j}>
                <circle cx={x} cy={y} r={r} fill="#c8473b" />
                <circle cx={x - r * 0.3} cy={y - r * 0.3} r={r * 0.28} fill="#e0685b" />
              </g>
            ))}
            {t.leaf.map(([x, y, a], j) => (
              <ellipse key={j} cx={x} cy={y} rx="6" ry="3" fill="#3f9b4f" transform={`rotate(${a} ${x} ${y})`} />
            ))}
            <path d={wedge(a0, a1, R)} fill="none" stroke={lift ? '#e8590c' : strongCuts ? '#7a4b17' : '#a86b2d'} strokeWidth={lift ? 4 : strongCuts ? 3.5 : 1.6} strokeLinejoin="round" />
          </g>
        );
      })}
      {guide && guide.n > 0 && (
        <path
          d={guide.n === guide.d ? `M0 -${R + 8} A${R + 8} ${R + 8} 0 1 1 -0.01 -${R + 8} Z` : wedge(0, (360 * guide.n) / guide.d, R + 8)}
          fill="none"
          stroke="#2a7fd0"
          strokeWidth="4"
          strokeDasharray="8 6"
          pointerEvents="none"
          data-testid="pizza-guide"
        />
      )}
    </svg>
  );
}

/** 分数の 表示（うえ＝分子・した＝分母） */
export function FracView({ f, size = 1.6, color = '#1b2838' }: { f: Frac; size?: number; color?: string }) {
  return (
    <span
      aria-label={`${f.d}ぶんの${f.n}`}
      style={{
        display: 'inline-flex',
        flexDirection: 'column',
        alignItems: 'center',
        lineHeight: 1,
        fontWeight: 900,
        fontSize: `${size}rem`,
        color,
        verticalAlign: 'middle',
        margin: '0 4px',
      }}
    >
      <span>{f.n}</span>
      <span
        aria-hidden
        style={{
          alignSelf: 'stretch',
          borderTop: `3px solid ${color}`,
          margin: '2px 0',
        }}
      />
      <span>{f.d}</span>
    </span>
  );
}

const range = (n: number) => Array.from({ length: n }, (_, i) => i);

export function PizzaFractionsView({ puzzle: p, difficulty, submit, solved, status, hintLevel }: GameViewProps<PizzaPuzzle, PizzaAnswer>) {
  const [selected, setSelected] = useState<number[]>([]);
  const kidWords = difficulty === 'easy';
  const target = pizzaTarget(p);
  const toggle = (i: number) => {
    if (solved) return;
    play('tap');
    setSelected((s) => (s.includes(i) ? s.filter((x) => x !== i) : [...s, i].sort((a, b) => a - b)));
  };
  const more = () => {
    if (solved) return;
    const free = range(p.slices).find((i) => !selected.includes(i));
    if (free === undefined) return;
    play('tap');
    setSelected([...selected, free].sort((a, b) => a - b));
  };
  const less = () => {
    if (solved || selected.length === 0) return;
    play('tap');
    setSelected(selected.slice(0, -1));
  };
  // 絵の 大きさは 画面の のこりに あわせる（ドックに かくれないように）
  const { ref: stageRef, width: roomW, height: roomH } = useRoom<HTMLDivElement>();
  const clamp = (v: number, lo: number, hi: number) => Math.floor(Math.max(lo, Math.min(hi, v)));
  const big = clamp(Math.min(roomW - 16, roomH - 56), 150, 300);
  // hard：みるだけの ひだりは 小さめ、さわる みぎを 大きく
  const right = clamp(Math.min((roomW - 44) / 1.7, roomH - 64), 100, 200);
  const left = Math.floor(right * 0.7);
  let opSmall = clamp((roomW - 130) / 2, 56, 110);
  if (roomH - opSmall - 66 < 150) opSmall = clamp(roomH - 66 - 150, 56, opSmall);
  const opBig = clamp(Math.min(roomW - 16, roomH - opSmall - 66), 120, 250);
  const guide = hintLevel >= 2 && !solved ? target : undefined;
  const made: Frac = { n: selected.length, d: p.slices };

  const question =
    p.kind === 'make' ? (
      <>ピザの {kidWords ? <strong style={{ fontSize: '1.4rem', color: '#e8590c' }}>{fracWords(p.target)}</strong> : <FracView f={p.target} color="#e8590c" />} を つくろう</>
    ) : p.kind === 'equal' ? (
      <>ひだりの ピザと おなじ おおきさを みぎの ピザで つくろう</>
    ) : (
      <>けいさんの こたえの おおきさを つくろう</>
    );

  const explain = (() => {
    if (!solved) return null;
    const r = reduce(made);
    if (p.kind === 'make') return `${made.n}きれは ${p.slices}きれの ${kidWords ? fracWords(p.target) : `${p.target.n}/${p.target.d}`} だね`;
    if (p.kind === 'equal') return `${p.left.n}/${p.left.d} と ${made.n}/${made.d} は おなじ おおきさ（${r.n}/${r.d}）`;
    return `${p.a.n}/${p.a.d} ${p.op === '+' ? '＋' : '−'} ${p.b.n}/${p.b.d} = ${made.n}/${made.d} = ${r.n}/${r.d}`;
  })();

  return (
    <section className="stack" style={{ gap: 8 }}>
      {explain ? (
        <p
          className="center-text pop"
          style={{
            margin: 0,
            fontWeight: 800,
            fontSize: '1.1rem',
            color: '#1f7a4d',
          }}
          data-testid="pizza-explain"
        >
          {explain}
        </p>
      ) : (
        <p className="center-text" style={{ margin: 0, fontWeight: 800, fontSize: '1.1rem' }} data-testid="pizza-question">
          {question}
        </p>
      )}
      <div ref={stageRef} className="stack" style={{ gap: 8 }}>
        {p.kind === 'equal' && (
          <div className="row center" style={{ gap: 6, flexWrap: 'nowrap', alignItems: 'center' }}>
            <div className="stack" style={{ alignItems: 'center', gap: 2 }}>
              <Pizza slices={p.left.d} selected={range(p.left.n)} size={left} label={`ひだりの ピザ：${p.left.d}きれの うち ${p.left.n}きれ`} />
              <FracView f={p.left} size={1.3} />
            </div>
            <strong style={{ fontSize: '2rem' }} aria-hidden>
              ＝
            </strong>
            <div className="stack" style={{ alignItems: 'center', gap: 2 }}>
              <Pizza slices={p.slices} selected={selected} onToggle={toggle} size={right} label={`みぎの ピザ（${p.slices}きれ）`} strongCuts={hintLevel >= 2} guide={guide} />
              <FracView f={made} size={1.3} color="#e8590c" />
            </div>
          </div>
        )}
        {p.kind === 'op' && (
          <>
            <div className="row center" style={{ gap: 4, flexWrap: 'nowrap', alignItems: 'center' }}>
              <div className="stack" style={{ alignItems: 'center', gap: 2 }}>
                <Pizza slices={p.a.d} selected={range(p.a.n)} size={opSmall} label={`${p.a.d}ぶんの${p.a.n}`} />
                <FracView f={p.a} size={1.2} />
              </div>
              <strong style={{ fontSize: '1.8rem' }} aria-label={p.op === '+' ? 'たす' : 'ひく'}>
                {p.op === '+' ? '＋' : '−'}
              </strong>
              <div className="stack" style={{ alignItems: 'center', gap: 2 }}>
                <Pizza slices={p.b.d} selected={range(p.b.n)} size={opSmall} label={`${p.b.d}ぶんの${p.b.n}`} />
                <FracView f={p.b} size={1.2} />
              </div>
              <strong style={{ fontSize: '1.8rem' }} aria-hidden>
                ＝
              </strong>
              <FracView f={made} size={1.4} color="#e8590c" />
            </div>
            <div className="row center">
              <Pizza slices={p.slices} selected={selected} onToggle={toggle} size={opBig} label={`こたえの ピザ（${p.slices}きれ）`} strongCuts={hintLevel >= 2} guide={guide} />
            </div>
          </>
        )}
        {p.kind === 'make' && (
          <div className="row center" style={{ gap: 10, flexWrap: 'nowrap', alignItems: 'center' }}>
            <Pizza slices={p.slices} selected={selected} onToggle={toggle} size={big} label={`ピザ（${p.slices}きれ）`} strongCuts={hintLevel >= 2} guide={guide} />
          </div>
        )}
        {p.kind === 'make' && (
          <div className="row center" style={{ gap: 8, flexWrap: 'nowrap', alignItems: 'center' }} data-testid="pizza-count">
            <span style={{ fontWeight: 700 }}>えらんだ</span>
            <FracView f={made} size={1.5} color="#e8590c" />
            <span className="small muted">
              {p.slices}きれの うち {made.n}きれ
            </span>
          </div>
        )}
      </div>
      {status}
      <InDock>
        <div className="row center" style={{ gap: 6, flexWrap: 'nowrap' }}>
          <button type="button" className="btn" onClick={less} disabled={solved || selected.length === 0} style={{ flex: 1, minWidth: 0, padding: '0 6px' }}>
            1きれ へらす
          </button>
          <button type="button" className="btn" onClick={more} disabled={solved || selected.length === p.slices} style={{ flex: 1, minWidth: 0, padding: '0 6px' }}>
            1きれ ふやす
          </button>
          <button type="button" className="btn primary" onClick={() => submit({ selected })} disabled={solved || selected.length === 0} style={{ flex: 1.2, minWidth: 0, padding: '0 6px' }}>
            これで できた！
          </button>
        </div>
      </InDock>
    </section>
  );
}
