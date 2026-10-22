import { useEffect, useRef } from 'react';
import { appendDigit, keyToDigit } from '../domain/input';
import { play } from '../audio/sfx';
import { InDock } from './Dock';

/**
 * 2だんの 数字キー（1〜5・けす / 6〜0・送信）。盤や 時計を 大きく 見せたい 画面で、ふつうの 数字キー（4だん）の かわりに つかう。
 * 物理キーボード：数字・Backspace（1もじ けす）・Delete/Escape（ぜんぶ けす）・Enter（送信）
 */
export function CompactPad({
  value,
  onChange,
  onSubmit,
  submitLabel,
  maxDigits = 3,
  disabled,
  allowEmptySubmit,
}: {
  value: string;
  onChange(v: string): void;
  onSubmit(): void;
  submitLabel: string;
  maxDigits?: number;
  disabled?: boolean;
  allowEmptySubmit?: boolean;
}) {
  const valueRef = useRef(value);
  valueRef.current = value;
  const h = useRef({ onChange, onSubmit, maxDigits, allowEmptySubmit });
  h.current = { onChange, onSubmit, maxDigits, allowEmptySubmit };
  const disabledRef = useRef(disabled);
  disabledRef.current = disabled;
  const lastSubmit = useRef(0);
  const submit = () => {
    const now = Date.now();
    if (now - lastSubmit.current < 250) return; // 連打で 2回 すすまない
    if (!h.current.allowEmptySubmit && valueRef.current === '') return;
    lastSubmit.current = now;
    h.current.onSubmit();
  };
  const submitRef = useRef(submit);
  submitRef.current = submit;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (disabledRef.current) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const d = keyToDigit(e.key);
      if (d !== null) {
        e.preventDefault();
        lastSubmit.current = 0;
        h.current.onChange(appendDigit(valueRef.current, d, h.current.maxDigits));
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        h.current.onChange(valueRef.current.slice(0, -1));
      } else if (e.key === 'Delete' || e.key === 'Escape') {
        h.current.onChange('');
      } else if (e.key === 'Enter') {
        if (t && t.tagName === 'BUTTON' && !t.classList.contains('pad-submit')) return;
        e.preventDefault();
        submitRef.current();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  if (disabled) return null;
  const key = (d: string) => (
    <button
      key={d}
      type="button"
      aria-label={d}
      onClick={() => {
        play('tap');
        lastSubmit.current = 0;
        onChange(appendDigit(value, d, maxDigits));
      }}
    >
      {d}
    </button>
  );
  return (
    <InDock>
      <div className="pad grid-pad" role="group" aria-label="すうじキー">
        {['1', '2', '3', '4', '5'].map(key)}
        <button type="button" className="pad-clear" aria-label="1もじ けす" onClick={() => onChange(value.slice(0, -1))} disabled={value === ''}>
          ← けす
        </button>
        {['6', '7', '8', '9', '0'].map(key)}
        <button type="button" className="pad-submit" onClick={submit} disabled={!allowEmptySubmit && value === ''}>
          {submitLabel}
        </button>
      </div>
    </InDock>
  );
}
