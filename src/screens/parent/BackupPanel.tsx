import { useRef, useState } from 'react';
import { useApp } from '../../app/AppContext';
import { Confirm } from '../../components/ui';
import { applyImport, backupFileName, exportBundle, hasRoomFor, previewImport, type ImportPreview } from '../../persistence/backup';
import type { Repo } from '../../persistence/repo';

/** すべてのプロフィール・設定・記録を JSON ファイルとして保存する。成功したら true。 */
export async function downloadBackup(repo: Repo): Promise<boolean> {
  try {
    const bundle = await exportBundle(repo);
    const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = backupFileName();
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    return true;
  } catch {
    return false;
  }
}

export function BackupPanel() {
  const app = useApp();
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [mode, setMode] = useState<'merge' | 'replace'>('merge');
  const [confirm, setConfirm] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const onFile = async (f: File | undefined) => {
    setMsg(null);
    setPreview(null);
    if (!f) return;
    if (f.size > 50 * 1024 * 1024) {
      setMsg({ ok: false, text: 'ファイルが大きすぎます。' });
      return;
    }
    const text = await f.text();
    setPreview(await previewImport(app.repo, text));
  };

  const doImport = async () => {
    if (!preview?.bundle) return;
    setBusy(true);
    setConfirm(false);
    try {
      if (!(await hasRoomFor(preview.bytes ?? 0))) {
        setMsg({ ok: false, text: '端末の空き容量が足りない可能性があります。復元を中止しました（今のデータはそのままです）。' });
        return;
      }
      await applyImport(app.repo, preview.bundle, mode);
      const ps = await app.refreshProfiles();
      if (app.profile && !ps.some((p) => p.id === app.profile!.id)) await app.selectProfile(null);
      else if (app.profile) await app.selectProfile(app.profile.id);
      setMsg({ ok: true, text: mode === 'merge' ? '復元しました（追加）。' : '復元しました（すべて置き換え）。' });
      setPreview(null);
      if (fileRef.current) fileRef.current.value = '';
    } catch (e) {
      setMsg({ ok: false, text: `復元できませんでした。今のデータはそのままです。（${e instanceof Error ? e.message || e.name : '不明なエラー'}）` });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="stack">
      <div className="card stack">
        <h2>バックアップ（書き出し）</h2>
        <p className="small muted" style={{ margin: 0 }}>
          すべてのプロフィール・設定・記録・途中のデータを、1つの JSON ファイルに保存します。
        </p>
        <button
          type="button"
          className="btn primary"
          onClick={async () => {
            const ok = await downloadBackup(app.repo);
            setMsg(ok ? { ok: true, text: `バックアップファイル（${backupFileName()}）を作成しました。保存先はブラウザのダウンロード設定によります。` } : { ok: false, text: 'バックアップを作成できませんでした。' });
          }}
        >
          バックアップを保存（JSON）
        </button>
      </div>
      <div className="card stack">
        <h2>復元（読み込み）</h2>
        <p className="small muted" style={{ margin: 0 }}>
          ファイルを選ぶと、まず中身を確認します（この時点ではまだ何も変わりません）。
        </p>
        <input ref={fileRef} type="file" accept="application/json,.json" aria-label="バックアップファイルを選択" onChange={(e) => void onFile(e.target.files?.[0])} />
        {preview && !preview.ok && (
          <div className="banner" role="alert">
            <div>
              {preview.errors.map((e, i) => (
                <div key={i}>{e}</div>
              ))}
              <div className="small">今のデータは変更していません。</div>
            </div>
          </div>
        )}
        {preview?.ok && (
          <div className="stack">
            {preview.warnings.map((w, i) => (
              <div key={i} className="banner info">
                {w}
              </div>
            ))}
            <table className="data">
              <tbody>
                <tr>
                  <th>作成日時</th>
                  <td>{preview.exportedAt ? new Date(preview.exportedAt).toLocaleString('ja-JP') : '不明'}</td>
                </tr>
                <tr>
                  <th>形式のバージョン</th>
                  <td>v{preview.sourceVersion}</td>
                </tr>
                <tr>
                  <th>プロフィール</th>
                  <td style={{ whiteSpace: 'normal' }}>
                    {preview.profiles!.map((p) => `${p.nickname}${p.exists ? '（この端末に同じIDあり）' : ''}`).join('、')}
                  </td>
                </tr>
                <tr>
                  <th>記録の数</th>
                  <td>
                    {preview.counts!.attempts}件（セッション {preview.counts!.sessions}件）
                  </td>
                </tr>
              </tbody>
            </table>
            <div className="stack" role="radiogroup" aria-label="復元の方法">
              <button type="button" role="radio" aria-checked={mode === 'merge'} className="chip" aria-pressed={mode === 'merge'} style={{ textAlign: 'left' }} onClick={() => setMode('merge')}>
                追加する：新しいプロフィール {preview.merge!.newProfiles}人・記録 {preview.merge!.newAttempts}件を追加。同じIDのもの（プロフィール {preview.merge!.existingProfiles}・記録 {preview.merge!.skippedAttempts}件）は今のデータを残します。
              </button>
              <button type="button" role="radio" aria-checked={mode === 'replace'} className="chip" aria-pressed={mode === 'replace'} style={{ textAlign: 'left' }} onClick={() => setMode('replace')}>
                すべて置き換える：今の端末のデータを全部消して、このファイルの内容にします。
              </button>
            </div>
            {mode === 'replace' && (
              <div className="banner">
                今のデータは消えます。先に今のデータをバックアップしてください。
                <button type="button" className="btn" onClick={() => void downloadBackup(app.repo)}>
                  今のデータをバックアップ
                </button>
              </div>
            )}
            <button type="button" className={`btn ${mode === 'replace' ? 'danger solid' : 'primary'}`} disabled={busy} onClick={() => setConfirm(true)}>
              {mode === 'merge' ? '追加して復元する' : 'すべて置き換えて復元する'}
            </button>
          </div>
        )}
        {msg && (
          <div className={`banner ${msg.ok ? 'info' : ''}`} role={msg.ok ? 'status' : 'alert'}>
            {msg.text}
          </div>
        )}
      </div>
      {confirm && (
        <Confirm
          title={mode === 'merge' ? '追加して復元しますか？' : '本当にすべて置き換えますか？'}
          message={mode === 'merge' ? '今のデータは残したまま、新しいものだけを追加します。' : 'この端末のプロフィールと記録はすべて、ファイルの内容に置き換わります。元に戻せません。'}
          okLabel={mode === 'merge' ? '追加する' : '置き換える'}
          danger={mode === 'replace'}
          onCancel={() => setConfirm(false)}
          onOk={() => void doImport()}
        />
      )}
    </div>
  );
}
