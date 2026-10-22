import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import {
  choiceText,
  hourAngle,
  hourOf,
  minuteAngle,
  minuteOf,
  questionText,
  timeText,
  toTime,
  wrap,
  type ClockAnswer,
  type ClockPuzzle,
} from '../../domain/games/clockMaster';
import { play } from '../../audio/sfx';
import { InDock } from '../../components/Dock';
import { CompactPad } from '../../components/CompactPad';
import type { GameViewProps } from '../types';

const R = 100;
const pt = (deg: number, r: number) => [Math.sin((deg * Math.PI) / 180) * r, -Math.cos((deg * Math.PI) / 180) * r] as const;

/**
 * アナログ時計（SVG）。針の 角度は 時刻から 計算する（長針 6度/分、短針 30度/じ ＋ 0.5度/分）。
 * 短針は 赤くて 太く みじかい（先が 丸い）、長針は 青くて ほそく ながい（先が とがる）。色と 形の 両方で 見わける。
 * onChange を わたすと 針を ドラッグ できる（まんなかの ちかくから うごかすと 短針、そとがわは 長針）。
 */
export function ClockFace({
  time,
  size = 240,
  onChange,
  step = 5,
  guide = false,
  label,
}: {
  time: number;
  size?: number | string;
  onChange?: (t: number) => void;
  step?: number;
  guide?: boolean;
  label: string;
}) {
  const drag = useRef<{ hand: 'hour' | 'minute'; time: number } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const angleAt = (e: ReactPointerEvent) => {
    const r = svgRef.current!.getBoundingClientRect();
    const x = e.clientX - (r.left + r.width / 2);
    const y = e.clientY - (r.top + r.height / 2);
    return { deg: ((Math.atan2(x, -y) * 180) / Math.PI + 360) % 360, dist: (Math.hypot(x, y) / (r.width / 2)) * 125 };
  };
  const moveTo = (e: ReactPointerEvent) => {
    const d = drag.current;
    if (!d || !onChange) return;
    const { deg } = angleAt(e);
    if (!Number.isFinite(deg)) return;
    if (d.hand === 'minute') {
      const m = (Math.round(deg / 6 / step) * step) % 60;
      const prev = minuteOf(d.time);
      let h = hourOf(d.time);
      // 12 を こえたら じ も すすむ・もどる（ほんとうの 時計と おなじ）
      if (prev >= 45 && m < 15) h += 1;
      else if (prev < 15 && m >= 45) h -= 1;
      const t = wrap(h * 60 + m);
      if (t !== d.time) {
        d.time = t;
        onChange(t);
      }
    } else {
      const h = Math.floor(deg / 30) % 12;
      const t = toTime(h, minuteOf(d.time));
      if (t !== d.time) {
        d.time = t;
        onChange(t);
      }
    }
  };
  const [hx, hy] = pt(hourAngle(time), 52);
  const [mx, my] = pt(minuteAngle(time), 84);
  const h = hourOf(time);
  return (
    <svg
      ref={svgRef}
      viewBox="-125 -125 250 250"
      width={size}
      height={size}
      role="img"
      aria-label={label}
      data-hour-angle={hourAngle(time)}
      data-minute-angle={minuteAngle(time)}
      style={{ display: 'block', margin: '0 auto', touchAction: onChange ? 'none' : undefined, cursor: onChange ? 'grab' : undefined, maxWidth: '100%' }}
      onPointerDown={
        onChange
          ? (e) => {
              const { dist } = angleAt(e);
              drag.current = { hand: dist < 55 ? 'hour' : 'minute', time };
              (e.target as Element).setPointerCapture?.(e.pointerId);
              moveTo(e);
            }
          : undefined
      }
      onPointerMove={onChange ? moveTo : undefined}
      onPointerUp={() => (drag.current = null)}
      onPointerCancel={() => (drag.current = null)}
    >
      <circle r={R + 6} fill="#fdf6e3" stroke="#1b2838" strokeWidth="6" />
      {guide && (
        // ヒント3：短針の いる 数字と 数字の あいだを うすく ぬる
        <path d={`M0 0 L${pt(h * 30, R).join(' ')} A${R} ${R} 0 0 1 ${pt(h * 30 + 30, R).join(' ')} Z`} fill="#ffe2d9" />
      )}
      {Array.from({ length: 60 }, (_, i) => {
        const [x1, y1] = pt(i * 6, i % 5 === 0 ? 86 : 92);
        const [x2, y2] = pt(i * 6, 99);
        return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#1b2838" strokeWidth={i % 5 === 0 ? 3.5 : 1.5} />;
      })}
      {Array.from({ length: 12 }, (_, i) => {
        const n = i === 0 ? 12 : i;
        const [x, y] = pt(i * 30, 70);
        return (
          <text key={i} x={x} y={y + 8} textAnchor="middle" fontSize="24" fontWeight="800" fill="#1b2838" fontFamily="ui-rounded, sans-serif">
            {n}
          </text>
        );
      })}
      {guide &&
        Array.from({ length: 12 }, (_, i) => {
          const [x, y] = pt(i * 30, 115);
          return (
            <text key={`m${i}`} x={x} y={y + 5} textAnchor="middle" fontSize="13" fontWeight="800" fill="#2a7fd0">
              {i * 5}
            </text>
          );
        })}
      {/* 短針：赤・太い・みじかい・先が まるい */}
      <line x1={0} y1={0} x2={hx} y2={hy} stroke="#c0392b" strokeWidth="11" strokeLinecap="round" data-hand="hour" />
      {/* 長針：青・ほそい・ながい・先が とがる */}
      <line x1={0} y1={0} x2={mx * 0.9} y2={my * 0.9} stroke="#2a7fd0" strokeWidth="5" strokeLinecap="round" data-hand="minute" />
      <path
        d={(() => {
          const a = minuteAngle(time);
          const [tx, ty] = pt(a, 88);
          const [lx, ly] = pt(a - 5, 72);
          const [rx, ry] = pt(a + 5, 72);
          return `M${tx} ${ty} L${lx} ${ly} L${rx} ${ry} Z`;
        })()}
        fill="#2a7fd0"
      />
      <circle r="8" fill="#1b2838" />
    </svg>
  );
}

/** 時刻を 数字で 入れる（じ・ふん） */
function TimeEntry({ onSubmit, disabled }: { onSubmit(t: number | null): void; disabled: boolean }) {
  const [hour, setHour] = useState('');
  const [minute, setMinute] = useState('');
  const [focus, setFocus] = useState<'h' | 'm'>('h');
  const [error, setError] = useState('');
  const submit = () => {
    if (focus === 'h' && minute === '') {
      setFocus('m');
      return;
    }
    const h = Number(hour);
    const m = Number(minute);
    if (hour === '' || minute === '' || h < 1 || h > 12 || m > 59) {
      setError('1〜12じ・0〜59ふんで いれてね');
      return;
    }
    setError('');
    onSubmit(toTime(h, m));
  };
  const box = (which: 'h' | 'm', v: string, unit: string) => (
    <button
      type="button"
      className="answer-box"
      aria-label={`${unit === 'じ' ? 'なんじ' : 'なんぷん'}：${v || 'まだ'}`}
      aria-pressed={focus === which}
      onClick={() => setFocus(which)}
      style={{ minWidth: 76, minHeight: 56, fontSize: '1.8rem', fontWeight: 800, border: `3px solid ${focus === which ? 'var(--accent)' : '#c6d6e4'}`, borderRadius: 12, background: '#fff' }}
    >
      {v || '?'}
    </button>
  );
  return (
    <div className="stack" style={{ alignItems: 'center', gap: 6 }} role="group" aria-label="じこくを いれる">
      <div className="row center" style={{ gap: 4, fontSize: '1.3rem', fontWeight: 800, flexWrap: 'nowrap' }}>
        {box('h', hour, 'じ')}
        <span>じ</span>
      </div>
      <div className="row center" style={{ gap: 4, fontSize: '1.3rem', fontWeight: 800, flexWrap: 'nowrap' }}>
        {box('m', minute, 'ふん')}
        <span>ふん</span>
      </div>
      {error && (
        <span className="small" role="alert" style={{ color: '#b8442f' }}>
          {error}
        </span>
      )}
      <CompactPad
        value={focus === 'h' ? hour : minute}
        onChange={(v) => (focus === 'h' ? setHour(v) : setMinute(v))}
        onSubmit={submit}
        submitLabel={focus === 'h' && minute === '' ? 'つぎ' : 'こたえる'}
        maxDigits={2}
        disabled={disabled}
      />
    </div>
  );
}

export function ClockMasterView({ puzzle: p, submit, solved, status, hintLevel }: GameViewProps<ClockPuzzle, ClockAnswer>) {
  const guide = hintLevel >= 3 && !solved;
  const [setTime, setSetTime] = useState(p.kind === 'set' ? p.start : 0);
  const [minutes, setMinutes] = useState('');
  const [picked, setPicked] = useState<number | null>(null);

  const answer = (a: ClockAnswer) => {
    if (solved) return;
    play('tap');
    submit(a);
  };
  const bump = (d: number) => {
    play('tap');
    setSetTime((t) => wrap(t + d));
  };
  const clockSize = 'min(72vw, 260px)';

  return (
    <section className="stack">
      <p className="center-text" style={{ margin: 0, fontWeight: 800, fontSize: '1.15rem' }} data-testid="clock-question">
        {questionText(p)}
      </p>
      {p.kind === 'read' && p.choices && <ClockFace time={p.time} size={clockSize} guide={guide} label="とけい" />}
      {((p.kind === 'read' && !p.choices) || p.kind === 'after' || p.kind === 'before') && (
        <div className="row center" style={{ gap: 10, flexWrap: 'nowrap', alignItems: 'center' }}>
          <div style={{ flex: '0 1 auto', width: 'min(52vw, 230px)' }}>
            <ClockFace time={p.kind === 'read' ? p.time : p.start} size="100%" guide={guide} label={p.kind === 'read' ? 'とけい' : `とけい：${timeText(p.start)}`} />
          </div>
          <TimeEntry key={JSON.stringify(p)} onSubmit={answer} disabled={solved} />
        </div>
      )}
      {p.kind === 'set' && (
        <>
          <ClockFace time={solved ? p.time : setTime} size={clockSize} guide={guide} step={p.step} onChange={solved ? undefined : setSetTime} label={`とけい：${timeText(setTime)}`} />
          <div className="stack" style={{ gap: 6 }} role="group" aria-label="はりを うごかす ボタン">
            <div className="row center" style={{ gap: 6, flexWrap: 'nowrap' }}>
              <button type="button" className="btn" onClick={() => bump(-60)} disabled={solved}>
                じかん −1
              </button>
              <button type="button" className="btn" onClick={() => bump(60)} disabled={solved}>
                じかん ＋1
              </button>
            </div>
            <div className="row center" style={{ gap: 6, flexWrap: 'nowrap' }}>
              <button type="button" className="btn" onClick={() => bump(-5)} disabled={solved}>
                ふん −5
              </button>
              <button type="button" className="btn" onClick={() => bump(5)} disabled={solved}>
                ふん ＋5
              </button>
            </div>
            {p.step === 1 && (
              <div className="row center" style={{ gap: 6, flexWrap: 'nowrap' }}>
                <button type="button" className="btn" onClick={() => bump(-1)} disabled={solved}>
                  ふん −1
                </button>
                <button type="button" className="btn" onClick={() => bump(1)} disabled={solved}>
                  ふん ＋1
                </button>
              </div>
            )}
          </div>
          <p className="small muted center-text" style={{ margin: 0 }}>
            はりを ゆびで うごかしても いいよ（まんなかの ちかくは みじかい はり）
          </p>
        </>
      )}
      {p.kind === 'between' && (
        <div className="row center" style={{ gap: 8, flexWrap: 'nowrap' }}>
          <div className="stack" style={{ gap: 2, alignItems: 'center', flex: 1, minWidth: 0 }}>
            <span className="small" style={{ fontWeight: 800 }}>
              はじめ
            </span>
            <ClockFace time={p.start} size="min(40vw, 160px)" guide={guide} label={`はじめ：${timeText(p.start)}`} />
          </div>
          <div className="stack" style={{ gap: 2, alignItems: 'center', flex: 1, minWidth: 0 }}>
            <span className="small" style={{ fontWeight: 800 }}>
              おわり
            </span>
            <ClockFace time={p.end} size="min(40vw, 160px)" guide={guide} label={`おわり：${timeText(p.end)}`} />
          </div>
        </div>
      )}
      {status}
      {p.kind === 'read' && p.choices && (
        <InDock>
          <div className="grid-tabs" role="group" aria-label="こたえを えらぶ" style={{ ['--cols' as string]: p.choices.length > 3 ? 2 : 3, ['--n' as string]: p.choices.length }}>
            {p.choices.map((c) => (
              <button
                key={c}
                type="button"
                className="chip"
                aria-pressed={picked === c}
                disabled={solved}
                onClick={() => {
                  setPicked(c);
                  answer(c);
                }}
                style={{ minHeight: 56, fontSize: '1.25rem' }}
              >
                {choiceText(p, c)}
              </button>
            ))}
          </div>
        </InDock>
      )}
      {p.kind === 'set' && (
        <InDock>
          <div className="row center">
            <button type="button" className="btn primary big" onClick={() => answer(setTime)} disabled={solved}>
              これで できた！
            </button>
          </div>
        </InDock>
      )}
      {p.kind === 'between' && (
        <div className="stack" style={{ alignItems: 'center', gap: 4 }}>
          <div className="row center" style={{ gap: 6, fontSize: '1.4rem', fontWeight: 800 }}>
            <span className="answer-box" aria-label={`なんぷん：${minutes || 'まだ'}`} style={{ minWidth: 88, minHeight: 56, display: 'inline-grid', placeItems: 'center', border: '3px solid var(--accent)', borderRadius: 12, background: '#fff', fontSize: '1.8rem' }}>
              {minutes || '?'}
            </span>
            <span>ふん</span>
          </div>
          <CompactPad value={minutes} onChange={setMinutes} onSubmit={() => answer(Number(minutes))} submitLabel="こたえる" maxDigits={3} disabled={solved} />
        </div>
      )}
      {solved && p.kind !== 'between' && (
        <p className="center-text pop" style={{ margin: 0, fontWeight: 800 }}>
          こたえ：{timeText(p.kind === 'read' || p.kind === 'set' ? p.time : p.kind === 'after' ? wrap(p.start + p.delta) : wrap(p.start - p.delta))}
        </p>
      )}
    </section>
  );
}
