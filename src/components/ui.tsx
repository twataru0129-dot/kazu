import { useEffect, useRef, useState, type ReactNode } from 'react';
import { back } from '../app/router';
import { IconBack, IconHint, IconSound, IconSpeak } from './Icons';
import { useApp } from '../app/AppContext';
import { speak, speechAvailable } from '../audio/speech';
import { keepMath } from '../domain/text';

export function TopBar({ title, onBack, right, backLabel = 'もどる' }: { title: ReactNode; onBack?: () => void; right?: ReactNode; backLabel?: string }) {
  return (
    <header className="topbar">
      <button type="button" className="icon-btn" onClick={onBack ?? (() => back())} aria-label={backLabel}>
        <IconBack />
      </button>
      <h1>{title}</h1>
      {right}
    </header>
  );
}

/** 音のオン・オフ（すぐミュートできる） */
export function SoundToggle() {
  const app = useApp();
  if (!app.settings) return null;
  const on = app.settings.soundOn;
  return (
    <button type="button" className={`icon-btn ${on ? 'on' : ''}`} aria-pressed={on} aria-label={on ? 'おとを けす' : 'おとを だす'} onClick={() => void app.updateSettings({ soundOn: !on })}>
      <IconSound on={on} />
    </button>
  );
}

export function SpeakButton({ text }: { text: string }) {
  const app = useApp();
  if (!app.settings?.speechOn || !speechAvailable()) return null;
  return (
    <button type="button" className="icon-btn" aria-label="よみあげる" onClick={() => speak(text)}>
      <IconSpeak />
    </button>
  );
}

export function HintButton({ level, max = 3, onClick, disabled }: { level: number; max?: number; onClick(): void; disabled?: boolean }) {
  return (
    <button type="button" className="btn" onClick={onClick} disabled={disabled || level >= max} aria-label={`ヒント（${level}/${max}）`}>
      <span style={{ width: 26, height: 26, display: 'inline-flex' }}>
        <IconHint />
      </span>
      ヒント {level > 0 ? `${level}/${max}` : ''}
    </button>
  );
}

/** 下の操作ドックに隠れないよう、出したときに見える位置まで動かす */
function useRevealOnChange<T extends HTMLElement>(dep: unknown) {
  const ref = useRef<T>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof el.scrollIntoView !== 'function') return;
    const reduce = document.documentElement.dataset.motion === 'reduced' || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    el.scrollIntoView({ block: 'nearest', behavior: reduce ? 'auto' : 'smooth' });
  }, [dep]);
  return ref;
}

export function HintPanel({ hints, level }: { hints: readonly string[]; level: number }) {
  const ref = useRevealOnChange<HTMLDivElement>(level);
  if (level <= 0) return null;
  return (
    <div className="hint-panel" aria-live="polite" ref={ref}>
      <strong>ヒント</strong>
      <ol>
        {hints.slice(0, level).map((h, i) => (
          <li key={i}>{keepMath(h)}</li>
        ))}
      </ol>
    </div>
  );
}

export function Feedback({ kind, children }: { kind: 'good' | 'try'; children: ReactNode }) {
  const ref = useRevealOnChange<HTMLDivElement>(null);
  return (
    <div ref={ref} className={`feedback ${kind} ${kind === 'good' ? 'pop' : 'shake-soft'}`} role="status" aria-live="polite">
      {kind === 'good' ? '◎ ' : ''}
      {typeof children === 'string' ? keepMath(children) : children}
    </div>
  );
}

export function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose?: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>('button, input, [tabindex]')?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose?.();
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      prev?.focus?.();
    };
  }, [onClose]);
  return (
    <div className="modal-back" onClick={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title} ref={ref}>
        <h2>{title}</h2>
        {children}
      </div>
    </div>
  );
}

export function Confirm({
  title,
  message,
  okLabel = 'はい',
  cancelLabel = 'やめる',
  danger,
  onOk,
  onCancel,
}: {
  title: string;
  message: ReactNode;
  okLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onOk(): void;
  onCancel(): void;
}) {
  return (
    <Modal title={title} onClose={onCancel}>
      <div className="stack">
        <div>{message}</div>
        <div className="row end">
          <button type="button" className="btn" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button type="button" className={`btn ${danger ? 'danger solid' : 'primary'}`} onClick={onOk}>
            {okLabel}
          </button>
        </div>
      </div>
    </Modal>
  );
}

/**
 * 長押しで実行するボタン（おとなメニューの誤操作防止用。認証ではない）。
 * iPhone Safari で長押し中に文字選択・「コピー」のメニューが出ないよう、このボタンの中だけ
 * user-select / -webkit-touch-callout を止め（CSS .hold-btn）、selectstart・dragstart・contextmenu を抑える。
 * 指が少し動いても（16px まで）止めない。タッチ・マウス・キーボード（Enter / Space を押し続ける）で使える。
 */
export function HoldButton({ ms = 1200, onDone, children, className = 'btn' }: { ms?: number; onDone(): void; children: ReactNode; className?: string }) {
  const [progress, setProgress] = useState(0);
  const timer = useRef<number | null>(null);
  const start = useRef(0);
  const origin = useRef<{ x: number; y: number } | null>(null);
  const stop = () => {
    if (timer.current) cancelAnimationFrame(timer.current);
    timer.current = null;
    origin.current = null;
    setProgress(0);
  };
  const tick = () => {
    const p = Math.min(1, (performance.now() - start.current) / ms);
    setProgress(p);
    if (p >= 1) {
      stop();
      onDone();
    } else timer.current = requestAnimationFrame(tick);
  };
  const begin = () => {
    if (timer.current) return;
    start.current = performance.now();
    timer.current = requestAnimationFrame(tick);
  };
  useEffect(() => () => {
    if (timer.current) cancelAnimationFrame(timer.current);
  }, []);
  return (
    <button
      type="button"
      className={`${className} hold-btn`}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        // ボタンの外に少しはみ出しても続けられるように
        e.currentTarget.setPointerCapture?.(e.pointerId);
        origin.current = { x: e.clientX, y: e.clientY };
        begin();
      }}
      onPointerMove={(e) => {
        if (!origin.current) return;
        if (Math.hypot(e.clientX - origin.current.x, e.clientY - origin.current.y) > 16) stop();
      }}
      onPointerUp={stop}
      onPointerCancel={stop}
      onLostPointerCapture={stop}
      onContextMenu={(e) => e.preventDefault()}
      onDragStart={(e) => e.preventDefault()}
      onSelect={(e) => e.preventDefault()}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          begin();
        }
      }}
      onKeyUp={stop}
      onBlur={stop}
      style={{ position: 'relative', overflow: 'hidden' }}
    >
      <span aria-hidden style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${progress * 100}%`, background: 'rgba(42,127,208,.2)' }} />
      <span style={{ position: 'relative' }}>{children}</span>
    </button>
  );
}

export function ProgressDots({ total, done, current }: { total: number; done: number; current: number }) {
  return (
    <div className="progress-dots" aria-label={`${total}もんちゅう ${done}もん できた`}>
      {Array.from({ length: total }, (_, i) => (
        <i key={i} className={i < done ? 'done' : i === current ? 'now' : ''} />
      ))}
    </div>
  );
}

/** 答えの表示箱（タップで選択できる複数入力用にも使う） */
export function AnswerBox({ value, active, onClick, label, placeholder = '?', small }: { value: string; active?: boolean; onClick?: () => void; label?: string; placeholder?: string; small?: boolean }) {
  const cls = `answer-box ${small ? 'sm' : ''} ${active ? 'active' : ''} ${value === '' ? 'empty' : ''}`;
  if (onClick)
    return (
      <button type="button" className={cls} onClick={onClick} aria-label={label} aria-pressed={active}>
        {value === '' ? placeholder : value}
      </button>
    );
  return (
    <span className={cls} aria-label={label} aria-live="polite">
      {value === '' ? placeholder : value}
    </span>
  );
}
