import { useState } from 'react';
import { useApp } from '../../app/AppContext';
import { useParental } from '../../app/ParentalContext';
import { NumberPad } from '../../components/NumberPad';
import { Confirm } from '../../components/ui';
import { isValidPin, isWeakPin, PIN_LENGTH } from '../../domain/parental/pin';
import { DEFAULT_LIMIT_MINUTES, formatMinutes, LIMIT_OPTIONS } from '../../domain/parental/playtime';

/** 新しい PIN を2回入れて決める（保護者メニューを開いている＝認証済みのときだけ表示） */
function PinSetup({ onDone, onCancel }: { onDone(): void; onCancel(): void }) {
  const parental = useParental();
  const [first, setFirst] = useState<string | null>(null);
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!isValidPin(value)) {
      setError(`${PIN_LENGTH}けたの すうじを いれてください。`);
      return;
    }
    if (first === null) {
      setFirst(value);
      setValue('');
      setError(null);
      return;
    }
    if (value !== first) {
      setFirst(null);
      setValue('');
      setError('1かいめと 2かいめが ちがいました。はじめから いれてください。');
      return;
    }
    setBusy(true);
    try {
      await parental.setPin(value);
      onDone();
    } catch {
      setError('ほぞん できませんでした。');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="stack" aria-label="あんしょうばんごうを きめる">
      <strong>{first === null ? 'あたらしい あんしょうばんごう（4けた）を いれてください' : 'かくにんのため、もういちど いれてください'}</strong>
      <div className="pin-dots" aria-label={`${value.length}もじ はいっています`}>
        {Array.from({ length: PIN_LENGTH }, (_, i) => (
          <span key={i} className={i < value.length ? 'on' : ''} />
        ))}
      </div>
      {first !== null && isWeakPin(first) && <div className="banner info small">かんたんに あてられやすい ばんごうです。べつの ばんごうに すると あんしんです。</div>}
      {error && (
        <div className="banner" role="alert">
          {error}
        </div>
      )}
      <NumberPad value={value} onChange={(v) => setValue(v.slice(0, PIN_LENGTH))} onSubmit={() => void submit()} submitLabel={first === null ? 'つぎへ' : 'きめる'} maxDigits={PIN_LENGTH} keepLeadingZeros disabled={busy} />
      <button type="button" className="btn ghost" onClick={onCancel}>
        やめる
      </button>
    </div>
  );
}

export function TimeLimitPanel() {
  const app = useApp();
  const parental = useParental();
  const { config, playtime } = parental;
  const [enabled, setEnabled] = useState(config.enabled);
  const [minutes, setMinutes] = useState<number>(config.enabled ? config.limitMinutes : config.limitMinutes || DEFAULT_LIMIT_MINUTES);
  const [settingPin, setSettingPin] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const hasPin = !!config.pin;
  const dirty = enabled !== config.enabled || (enabled && minutes !== config.limitMinutes);

  const save = async () => {
    setMsg(null);
    try {
      await parental.setLimit(enabled, minutes);
      setMsg({ ok: true, text: enabled ? `ほぞん しました。1かい ${minutes}ふん です。` : 'じかんの せいげんを オフに しました。' });
    } catch {
      setMsg({ ok: false, text: 'ほぞん できませんでした。' });
    }
  };

  const status = !config.enabled
    ? 'いまは じかんの せいげん なし'
    : playtime.phase === 'waiting'
      ? `1かい ${config.limitMinutes}ふん（つぎに あそびはじめた ときから かぞえます）`
      : `1かい ${config.limitMinutes}ふん・のこり ${formatMinutes(parental.remainingMs)}`;

  return (
    <div className="card stack" aria-labelledby="time-limit-title">
      <h2 id="time-limit-title">あそぶ じかん</h2>
      <p style={{ margin: 0, fontWeight: 700 }} data-testid="time-limit-status">
        {status}
      </p>
      {!app.persistent && (
        <div className="banner" role="alert">
          この ブラウザでは きろくを ほぞん できないため、じかんの せいげんを ただしく つかえません（アプリを とじると のこり時間が きえます）。
        </div>
      )}
      {parental.saveFailed && (
        <div className="banner" role="alert">
          のこり時間を ほぞん できていません。アプリを とじると ただしく かぞえられない ことが あります。
        </div>
      )}

      <section className="stack">
        <h3 style={{ margin: 0 }}>あんしょうばんごう（4けた）</h3>
        {settingPin ? (
          <PinSetup
            onDone={() => {
              setSettingPin(false);
              setMsg({ ok: true, text: 'あんしょうばんごうを ほぞん しました。わすれないように してください。' });
            }}
            onCancel={() => setSettingPin(false)}
          />
        ) : (
          <>
            <p className="small" style={{ margin: 0 }}>
              {hasPin
                ? 'せってい ずみ。おとなの メニューを ひらくときと、じかんぎれの ロックを かいじょ するときに つかいます。'
                : 'まだ ありません。じかんの せいげんを つかうには、さきに きめてください。'}
            </p>
            <div className="row">
              <button type="button" className="btn" onClick={() => setSettingPin(true)}>
                {hasPin ? 'あんしょうばんごうを かえる' : 'あんしょうばんごうを きめる'}
              </button>
              {hasPin && (
                <button type="button" className="btn ghost" disabled={config.enabled} onClick={() => setConfirmClear(true)}>
                  あんしょうばんごうを やめる
                </button>
              )}
            </div>
            <p className="small muted" style={{ margin: 0 }}>
              わすれると、おとなの メニューを ひらけなくなり、ロックも かいじょ できません（ひみつの かいじょ ばんごうは ありません）。メモして あんぜんな ところに しまってください。これは かていむけの かんたんな ほごで、たんまつ ぜんたいを まもるものでは ありません。
            </p>
          </>
        )}
      </section>

      <section className="stack">
        <h3 style={{ margin: 0 }}>1かいに あそべる じかん</h3>
        <div className="row" role="radiogroup" aria-label="じかんの せいげん">
          <button type="button" role="radio" aria-checked={!enabled} className="chip" aria-pressed={!enabled} onClick={() => setEnabled(false)}>
            せいげん なし
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={enabled}
            className="chip"
            aria-pressed={enabled}
            disabled={!hasPin || !app.persistent}
            onClick={() => setEnabled(true)}
          >
            せいげん する
          </button>
        </div>
        {!hasPin && <p className="small muted" style={{ margin: 0 }}>せいげん するには、さきに あんしょうばんごうを きめてください。</p>}
        {enabled && (
          <div className="minutes-grid" role="radiogroup" aria-label="あそべる じかん（ふん）">
            {LIMIT_OPTIONS.map((m) => (
              <button key={m} type="button" role="radio" aria-checked={minutes === m} aria-pressed={minutes === m} className="chip" onClick={() => setMinutes(m)}>
                {m}ふん
              </button>
            ))}
          </div>
        )}
        <p className="small muted" style={{ margin: 0 }}>
          ほぞん すると、のこり時間は えらんだ じかんに もどり、こどもが つぎに モードを えらんで あそびはじめた ときから かぞえます。じかんは アプリが ひょうじ されている あいだだけ へります（おとなの メニューを ひらいている あいだは へりません）。プロフィールを かえても おなじ のこり時間です。
        </p>
        <button type="button" className="btn primary" disabled={!dirty} onClick={() => void save()}>
          ほぞん
        </button>
      </section>
      {msg && (
        <div className={`banner ${msg.ok ? 'info' : ''}`} role={msg.ok ? 'status' : 'alert'}>
          {msg.text}
        </div>
      )}
      {confirmClear && (
        <Confirm
          title="あんしょうばんごうを やめますか？"
          message="おとなの メニューは ながおしで ひらく ように もどります。"
          okLabel="やめる"
          cancelLabel="もどる"
          onCancel={() => setConfirmClear(false)}
          onOk={async () => {
            setConfirmClear(false);
            try {
              await parental.clearPin();
              setMsg({ ok: true, text: 'あんしょうばんごうを やめました。' });
            } catch {
              setMsg({ ok: false, text: 'できませんでした（じかんの せいげんを オフに してから やめてください）。' });
            }
          }}
        />
      )}
    </div>
  );
}
