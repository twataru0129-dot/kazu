import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useApp } from '../app/AppContext';
import { speak, stopSpeech } from '../audio/speech';
import { IconPause, IconPlay, IconRestart } from './Icons';

/**
 * 動画のように再生できる説明アニメーション（SVG＋タイムライン）。
 * 再生・一時停止・再開・最初から・場面ジャンプ・字幕に対応。通信は不要。
 */
export interface Scene {
  /** 秒 */
  dur: number;
  caption: string;
  /** t: この場面の進み具合 0〜1 */
  render(t: number): ReactNode;
}

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

export function TimelinePlayer({ scenes, title }: { scenes: Scene[]; title: string }) {
  const app = useApp();
  const reduced = !!app.settings?.reducedMotion || (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
  const total = scenes.reduce((s, x) => s + x.dur, 0);
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [captions, setCaptions] = useState(true);
  const last = useRef<number | null>(null);
  const spokenScene = useRef(-1);

  let acc = 0;
  let idx = 0;
  for (let i = 0; i < scenes.length; i++) {
    if (time < acc + scenes[i].dur || i === scenes.length - 1) {
      idx = i;
      break;
    }
    acc += scenes[i].dur;
  }
  const local = Math.min(1, Math.max(0, (time - acc) / scenes[idx].dur));
  // 動きを減らす設定では、各場面の完成した絵だけを見せる
  const t = reduced ? 1 : local;

  useEffect(() => {
    if (!playing) {
      last.current = null;
      return;
    }
    let raf = 0;
    const tick = (now: number) => {
      if (last.current !== null) {
        const dt = (now - last.current) / 1000;
        setTime((x) => {
          const nx = Math.min(total, x + dt);
          if (nx >= total) setPlaying(false);
          return nx;
        });
      }
      last.current = now;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, total]);

  useEffect(() => {
    if (playing && spokenScene.current !== idx) {
      spokenScene.current = idx;
      speak(scenes[idx].caption);
    }
  }, [idx, playing, scenes]);

  // ほかのタブ・アプリに切り替えたら止める
  useEffect(() => {
    const on = () => document.hidden && setPlaying(false);
    document.addEventListener('visibilitychange', on);
    return () => {
      document.removeEventListener('visibilitychange', on);
      stopSpeech();
    };
  }, []);

  const jump = (i: number) => {
    const start = scenes.slice(0, i).reduce((s, x) => s + x.dur, 0);
    setTime(start);
    spokenScene.current = -1;
  };

  return (
    <div className="card stack" aria-label={title}>
      <div style={{ background: '#fbfdff', borderRadius: 14, border: '1px solid #e3eef7', overflow: 'hidden' }}>
        <svg viewBox="0 0 360 220" width="100%" role="img" aria-label={scenes[idx].caption} style={{ display: 'block' }}>
          {scenes[idx].render(t)}
        </svg>
      </div>
      {captions && (
        <div className="center-text" style={{ minHeight: '3em', fontWeight: 700, fontSize: '1.1rem', background: '#1b2838', color: '#fff', borderRadius: 12, padding: '8px 12px' }} aria-live="polite">
          {scenes[idx].caption}
        </div>
      )}
      <div className="bar" aria-hidden>
        <i style={{ width: `${(time / total) * 100}%` }} />
      </div>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div className="row">
          {playing ? (
            <button type="button" className="icon-btn on" onClick={() => setPlaying(false)} aria-label="いちじ ていし">
              <IconPause />
            </button>
          ) : (
            <button
              type="button"
              className="icon-btn on"
              onClick={() => {
                if (time >= total) jump(0);
                setPlaying(true);
              }}
              aria-label={time > 0 && time < total ? 'つづきから さいせい' : 'さいせい'}
            >
              <IconPlay />
            </button>
          )}
          <button
            type="button"
            className="icon-btn"
            onClick={() => {
              jump(0);
              setPlaying(true);
            }}
            aria-label="さいしょから"
          >
            <IconRestart />
          </button>
          <span className="small muted num">
            {fmt(time)} / {fmt(total)}
          </span>
        </div>
        <button type="button" className="chip" aria-pressed={captions} onClick={() => setCaptions(!captions)}>
          じまく
        </button>
      </div>
      <div className="chips" aria-label="ばめん">
        {scenes.map((s, i) => (
          <button key={i} type="button" className="chip" aria-pressed={i === idx} onClick={() => jump(i)} aria-label={`ばめん ${i + 1}：${s.caption}`} style={{ minWidth: 48 }}>
            {i + 1}
          </button>
        ))}
      </div>
    </div>
  );
}

// ---- 絵の部品 ----
export const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
/** t が a〜b の間で 0→1 に進む */
export const seg = (t: number, a: number, b: number) => clamp01((t - a) / (b - a));
export const ease = (x: number) => 1 - (1 - x) ** 3;

export function Apple({ x, y, s = 1, glow = false }: { x: number; y: number; s?: number; glow?: boolean }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      {glow && <circle r="15" fill="#ffe48a" />}
      <circle r="10" fill="#e8504f" />
      <path d="M0 -10 q1 -5 4 -6" stroke="#6b4a2a" strokeWidth="2" fill="none" />
      <ellipse cx="6" cy="-14" rx="4" ry="2.4" fill="#5cc28b" />
      <circle cx="-4" cy="-3" r="2.5" fill="#fff" opacity=".5" />
    </g>
  );
}

export function Plate({ x, y, w = 70, opacity = 1 }: { x: number; y: number; w?: number; opacity?: number }) {
  return (
    <g opacity={opacity}>
      <ellipse cx={x} cy={y} rx={w / 2} ry={11} fill="#ffffff" stroke="#b9cad9" strokeWidth="2" />
      <ellipse cx={x} cy={y - 1} rx={w / 2 - 9} ry={6} fill="#eef4f9" />
    </g>
  );
}

export function Candy({ x, y, color = '#ff8fb1', s = 1 }: { x: number; y: number; color?: string; s?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <path d="M-14 -6 L-8 0 L-14 6 Z M14 -6 L8 0 L14 6 Z" fill={color} opacity=".8" />
      <circle r="8" fill={color} />
      <path d="M-4 -5 Q0 0 -4 5 M2 -6 Q6 0 2 6" stroke="#fff" strokeWidth="1.5" fill="none" opacity=".7" />
    </g>
  );
}

export function Kid({ x, y, color = '#4aa3df', label }: { x: number; y: number; color?: string; label?: string }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <path d="M-20 34 Q-20 10 0 10 Q20 10 20 34 Z" fill={color} />
      <circle cy="-6" r="16" fill="#ffe0c2" />
      <path d="M-16 -10 Q-12 -24 0 -22 Q14 -24 16 -10 Q8 -16 -16 -10 Z" fill="#5a3b25" />
      <circle cx="-6" cy="-6" r="2.2" fill="#1b2838" />
      <circle cx="6" cy="-6" r="2.2" fill="#1b2838" />
      <path d="M-5 2 Q0 6 5 2" stroke="#1b2838" strokeWidth="1.8" fill="none" strokeLinecap="round" />
      {label && (
        <text y="52" textAnchor="middle" fontSize="13" fontWeight="700" fill="#4b5d72">
          {label}
        </text>
      )}
    </g>
  );
}

export function Bag({ x, y, opacity = 1 }: { x: number; y: number; opacity?: number }) {
  return (
    <g transform={`translate(${x} ${y})`} opacity={opacity}>
      <path d="M-26 -10 L26 -10 L22 30 L-22 30 Z" fill="#f6e3c3" stroke="#c9a77a" strokeWidth="2" />
      <path d="M-26 -10 Q0 -18 26 -10" stroke="#c9a77a" strokeWidth="2" fill="none" />
    </g>
  );
}

export function Txt({ x, y, children, size = 20, color = '#1b2838', opacity = 1, weight = 800 }: { x: number; y: number; children: ReactNode; size?: number; color?: string; opacity?: number; weight?: number }) {
  return (
    <text x={x} y={y} fontSize={size} fontWeight={weight} textAnchor="middle" fill={color} opacity={opacity} fontFamily="ui-rounded, 'Hiragino Maru Gothic ProN', sans-serif">
      {children}
    </text>
  );
}
