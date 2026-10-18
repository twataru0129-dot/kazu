import { useEffect, useRef } from 'react';
import { appendDigit, keyToDigit } from '../domain/input';
import { play } from '../audio/sfx';
import { InDock } from './Dock';

interface Props {
  value: string;
  onChange(v: string): void;
  onSubmit?(): void;
  submitLabel?: string;
  maxDigits?: number;
  disabled?: boolean;
  /** 物理キーボード（テンキー・数字キー・Enter・Backspace）を受け付ける */
  keyboard?: boolean;
  /** 空でも送信ボタンを押せるようにする（通常は空だと押せない） */
  allowEmptySubmit?: boolean;
  /** 先頭の 0 を残す（暗証番号の 0123 など。答えの数では 0 を取りのぞく） */
  keepLeadingZeros?: boolean;
}

/**
 * 共通の数字キー。画面のボタンと物理キーボードは同じ処理を通る。
 * 連打・二重送信を防ぐため、送信は短時間に1回だけ。
 */
export function NumberPad({ value, onChange, onSubmit, submitLabel = 'こたえる', maxDigits = 6, disabled, keyboard = true, allowEmptySubmit, keepLeadingZeros }: Props) {
  const append = (cur: string, d: string) => (keepLeadingZeros ? (cur.length >= maxDigits ? cur : cur + d) : appendDigit(cur, d, maxDigits));
  const lastSubmit = useRef(0);
  const appendRef = useRef<(cur: string, d: string) => string>(() => '');
  const valueRef = useRef(value);
  valueRef.current = value;
  const handlers = useRef({ onChange, onSubmit });
  handlers.current = { onChange, onSubmit };

  appendRef.current = append;
  const submit = () => {
    const now = Date.now();
    if (now - lastSubmit.current < 300) return;
    if (!allowEmptySubmit && valueRef.current === '') return;
    lastSubmit.current = now;
    handlers.current.onSubmit?.();
  };
  const submitRef = useRef(submit);
  submitRef.current = submit;

  useEffect(() => {
    if (!keyboard || disabled) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const d = keyToDigit(e.key);
      if (d !== null) {
        e.preventDefault();
        lastSubmit.current = 0; // 新しく入力したら、送信の連打防止を解除
        handlers.current.onChange(appendRef.current(valueRef.current, d));
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        handlers.current.onChange(valueRef.current.slice(0, -1));
      } else if (e.key === 'Delete' || e.key === 'Escape') {
        handlers.current.onChange('');
      } else if (e.key === 'Enter') {
        // ボタンにフォーカスがあるときは、そのボタンの動作にまかせる
        if (t && t.tagName === 'BUTTON' && !t.classList.contains('pad-submit')) return;
        e.preventDefault();
        submitRef.current();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [keyboard, disabled, maxDigits]);

  const key = (d: string) => (
    <button key={d} type="button" onClick={() => press(d)} aria-label={d}>
      {d}
    </button>
  );

  const press = (d: string) => {
    play('tap');
    lastSubmit.current = 0;
    onChange(append(value, d));
  };

  // 使えないとき（正解したあと・一時停止中）は キーを しまって、つぎの操作を 押しやすくする
  if (disabled) return null;

  // 4れつ：7 8 9 けす / 4 5 6 クリア / 1 2 3 こたえる / 0（はば ひろ）こたえる
  return (
    <InDock>
      <div className={`pad ${onSubmit ? '' : 'no-submit'}`} role="group" aria-label="すうじキー">
        {['7', '8', '9'].map((d) => key(d))}
        <button type="button" className="pad-clear" onClick={() => onChange(value.slice(0, -1))} disabled={value === ''} aria-label="1もじ けす">
          ← けす
        </button>
        {['4', '5', '6'].map((d) => key(d))}
        <button type="button" className="pad-clear" onClick={() => onChange('')} disabled={value === ''} aria-label="ぜんぶ けす">
          クリア
        </button>
        {['1', '2', '3'].map((d) => key(d))}
        {onSubmit && (
          <button type="button" className="pad-submit" onClick={submit} disabled={!allowEmptySubmit && value === ''}>
            {submitLabel}
          </button>
        )}
        <button type="button" className="pad-zero" onClick={() => press('0')} aria-label="0">
          0
        </button>
      </div>
    </InDock>
  );
}
