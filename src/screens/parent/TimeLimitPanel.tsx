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
      setError(`${PIN_LENGTH}桁の数字を入力してください。`);
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
      setError('1回目と2回目が違いました。最初から入力してください。');
      return;
    }
    setBusy(true);
    try {
      await parental.setPin(value);
      onDone();
    } catch {
      setError('保存できませんでした。');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="stack" aria-label="暗証番号の設定">
      <strong>{first === null ? '新しい暗証番号（4桁）を入力してください' : '確認のため、もう一度入力してください'}</strong>
      <div className="pin-dots" aria-label={`${value.length}桁 入力済み`}>
        {Array.from({ length: PIN_LENGTH }, (_, i) => (
          <span key={i} className={i < value.length ? 'on' : ''} />
        ))}
      </div>
      {first !== null && isWeakPin(first) && <div className="banner info small">推測されやすい番号です。別の番号にすると安心です。</div>}
      {error && (
        <div className="banner" role="alert">
          {error}
        </div>
      )}
      <NumberPad value={value} onChange={(v) => setValue(v.slice(0, PIN_LENGTH))} onSubmit={() => void submit()} submitLabel={first === null ? '次へ' : '決定'} maxDigits={PIN_LENGTH} keepLeadingZeros disabled={busy} />
      <button type="button" className="btn ghost" onClick={onCancel}>
        キャンセル
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
      setMsg({ ok: true, text: enabled ? `保存しました。1回 ${minutes}分です。` : '時間制限をオフにしました。' });
    } catch {
      setMsg({ ok: false, text: '保存できませんでした。' });
    }
  };

  const status = !config.enabled
    ? '現在：時間制限なし'
    : playtime.phase === 'waiting'
      ? `1回 ${config.limitMinutes}分（次に遊び始めたときから数えます）`
      : `1回 ${config.limitMinutes}分・残り ${formatMinutes(parental.remainingMs)}`;

  return (
    <div className="card stack" aria-labelledby="time-limit-title">
      <h2 id="time-limit-title">遊ぶ時間</h2>
      <p style={{ margin: 0, fontWeight: 700 }} data-testid="time-limit-status">
        {status}
      </p>
      {!app.persistent && (
        <div className="banner" role="alert">
          このブラウザでは記録を保存できないため、時間制限を正しく使えません（アプリを閉じると残り時間が消えます）。
        </div>
      )}
      {parental.saveFailed && (
        <div className="banner" role="alert">
          残り時間を保存できていません。アプリを閉じると正しく数えられないことがあります。
        </div>
      )}

      <section className="stack">
        <h3 style={{ margin: 0 }}>暗証番号（4桁）</h3>
        {settingPin ? (
          <PinSetup
            onDone={() => {
              setSettingPin(false);
              setMsg({ ok: true, text: '暗証番号を保存しました。忘れないようにしてください。' });
            }}
            onCancel={() => setSettingPin(false)}
          />
        ) : (
          <>
            <p className="small" style={{ margin: 0 }}>
              {hasPin
                ? '設定済み。おとなのメニューを開くときと、時間切れのロックを解除するときに使います。'
                : '未設定です。時間制限を使うには、先に設定してください。'}
            </p>
            <div className="row">
              <button type="button" className="btn" onClick={() => setSettingPin(true)}>
                {hasPin ? '暗証番号を変更' : '暗証番号を設定'}
              </button>
              {hasPin && (
                <button type="button" className="btn ghost" disabled={config.enabled} onClick={() => setConfirmClear(true)}>
                  暗証番号を削除
                </button>
              )}
            </div>
            <p className="small muted" style={{ margin: 0 }}>
              忘れると、おとなのメニューを開けなくなり、ロックも解除できません（秘密の解除番号はありません）。メモして安全な場所に保管してください。これは家庭向けの簡単な保護で、端末全体を守るものではありません。
            </p>
          </>
        )}
      </section>

      <section className="stack">
        <h3 style={{ margin: 0 }}>1回に遊べる時間</h3>
        <div className="row" role="radiogroup" aria-label="時間制限">
          <button type="button" role="radio" aria-checked={!enabled} className="chip" aria-pressed={!enabled} onClick={() => setEnabled(false)}>
            制限なし
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
            制限する
          </button>
        </div>
        {!hasPin && <p className="small muted" style={{ margin: 0 }}>制限するには、先に暗証番号を設定してください。</p>}
        {enabled && (
          <div className="minutes-grid" role="radiogroup" aria-label="遊べる時間（分）">
            {LIMIT_OPTIONS.map((m) => (
              <button key={m} type="button" role="radio" aria-checked={minutes === m} aria-pressed={minutes === m} className="chip" onClick={() => setMinutes(m)}>
                {m}分
              </button>
            ))}
          </div>
        )}
        <p className="small muted" style={{ margin: 0 }}>
          保存すると、残り時間は選んだ時間に戻り、子どもが次にモードを選んで遊び始めたときから数えます。時間はアプリが表示されている間だけ減ります（おとなのメニューを開いている間は減りません）。プロフィールを切り替えても残り時間は共通です。
        </p>
        <button type="button" className="btn primary" disabled={!dirty} onClick={() => void save()}>
          保存
        </button>
      </section>
      {msg && (
        <div className={`banner ${msg.ok ? 'info' : ''}`} role={msg.ok ? 'status' : 'alert'}>
          {msg.text}
        </div>
      )}
      {confirmClear && (
        <Confirm
          title="暗証番号を削除しますか？"
          message="おとなのメニューは、長押しで開く方式に戻ります。"
          okLabel="削除する"
          cancelLabel="戻る"
          onCancel={() => setConfirmClear(false)}
          onOk={async () => {
            setConfirmClear(false);
            try {
              await parental.clearPin();
              setMsg({ ok: true, text: '暗証番号を削除しました。' });
            } catch {
              setMsg({ ok: false, text: '削除できませんでした（時間制限をオフにしてから削除してください）。' });
            }
          }}
        />
      )}
    </div>
  );
}
