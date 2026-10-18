import { useEffect, useState } from 'react';
import { NumberPad } from '../../components/NumberPad';
import { PIN_LENGTH } from '../../domain/parental/pin';
import type { PinCheck } from '../../app/ParentalContext';

/**
 * 4桁の暗証番号の入力（伏字）。画面の数字キー・PC のテンキー・数字キーで入力できる。
 * 入力した番号は画面・URL・記録には出さない。
 */
export function PinEntry({ onSubmit, submitLabel = 'ひらく', autoFocusLabel }: { onSubmit(pin: string): Promise<PinCheck>; submitLabel?: string; autoFocusLabel?: string }) {
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [waitUntil, setWaitUntil] = useState(0);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (waitUntil <= now) return;
    const id = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(id);
  }, [waitUntil, now]);

  const waiting = waitUntil > now;
  const submit = async () => {
    if (busy || waiting || pin.length !== PIN_LENGTH) return;
    setBusy(true);
    try {
      const r = await onSubmit(pin);
      if (!r.ok) {
        setPin('');
        if (r.waitMs > 0) {
          setWaitUntil(Date.now() + r.waitMs);
          setNow(Date.now());
          setError(`まちがいが つづいたので、${Math.ceil(r.waitMs / 1000)}びょう まってから いれてください。`);
        } else setError('ばんごうが ちがいます。もういちど いれてください。');
      }
    } catch {
      setError('たしかめられませんでした。もういちど ためしてください。');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="stack pin-entry">
      <div className="pin-dots" role="img" aria-label={`${pin.length}もじ はいっています（${PIN_LENGTH}けた）`} aria-live="polite">
        {Array.from({ length: PIN_LENGTH }, (_, i) => (
          <span key={i} className={i < pin.length ? 'on' : ''} />
        ))}
      </div>
      {autoFocusLabel && <p className="sr-only">{autoFocusLabel}</p>}
      {error && (
        <div className="banner" role="alert">
          {waiting ? `まちがいが つづいたので、あと ${Math.ceil((waitUntil - now) / 1000)}びょう まってから いれてください。` : error}
        </div>
      )}
      <NumberPad value={pin} onChange={(v) => setPin(v.slice(0, PIN_LENGTH))} onSubmit={() => void submit()} submitLabel={submitLabel} maxDigits={PIN_LENGTH} keepLeadingZeros disabled={waiting} />
    </div>
  );
}
