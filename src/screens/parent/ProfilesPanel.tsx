import { useState } from 'react';
import { useApp } from '../../app/AppContext';
import { Avatar } from '../../components/Avatar';
import { Confirm, Modal } from '../../components/ui';
import type { Profile } from '../../persistence/types';
import { ProfileForm } from '../ProfileScreens';
import { downloadBackup } from './BackupPanel';

export function ProfilesPanel() {
  const app = useApp();
  const [editing, setEditing] = useState<Profile | 'new' | null>(null);
  const [del, setDel] = useState<{ p: Profile; step: 1 | 2 } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className="stack">
      <div className="card stack">
        <h2>プロフィール</h2>
        <p className="small muted" style={{ margin: 0 }}>
          同じ名前でも、プロフィールごとに記録は別々に保存されます（内部ではIDで区別しています）。
        </p>
        {app.profiles.map((p) => (
          <div key={p.id} className="row" style={{ justifyContent: 'space-between', borderBottom: '1px solid #e3eef7', paddingBottom: 8 }}>
            <span className="row">
              <Avatar id={p.avatarId} size={44} />
              <strong>{p.nickname}</strong>
              {app.profile?.id === p.id && <span className="small muted">（使用中）</span>}
            </span>
            <span className="row">
              <button type="button" className="btn" onClick={() => setEditing(p)}>
                編集
              </button>
              <button type="button" className="btn danger" onClick={() => setDel({ p, step: 1 })}>
                削除
              </button>
            </span>
          </div>
        ))}
        <button type="button" className="btn primary" onClick={() => setEditing('new')}>
          ＋ プロフィールを追加
        </button>
        {msg && (
          <div className="banner info" role="status">
            {msg}
          </div>
        )}
      </div>
      {editing && (
        <Modal title={editing === 'new' ? 'プロフィールを追加' : 'プロフィールを編集'} onClose={() => setEditing(null)}>
          <ProfileForm
            initial={editing === 'new' ? undefined : editing}
            submitLabel="保存"
            onCancel={() => setEditing(null)}
            onSubmit={async (name, avatar) => {
              if (editing === 'new') await app.repo.createProfile(name, avatar);
              else {
                await app.repo.updateProfile(editing.id, { nickname: name, avatarId: avatar });
                if (app.profile?.id === editing.id) await app.selectProfile(editing.id);
              }
              await app.refreshProfiles();
              setEditing(null);
              setMsg('保存しました');
            }}
          />
        </Modal>
      )}
      {del?.step === 1 && (
        <Confirm
          title={`「${del.p.nickname}」を削除しますか？`}
          message={
            <div className="stack">
              <span>このプロフィールの記録・設定・途中のデータもすべて消えます。元に戻せません。</span>
              <button type="button" className="btn" onClick={() => void downloadBackup(app.repo).then((ok) => setMsg(ok ? 'バックアップを保存しました' : 'バックアップを保存できませんでした'))}>
                先にバックアップを保存する
              </button>
            </div>
          }
          okLabel="次へ"
          danger
          onCancel={() => setDel(null)}
          onOk={() => setDel({ p: del.p, step: 2 })}
        />
      )}
      {del?.step === 2 && (
        <Confirm
          title="本当に削除しますか？"
          message={`「${del.p.nickname}」のすべての記録が消えます。`}
          okLabel="削除する"
          danger
          onCancel={() => setDel(null)}
          onOk={async () => {
            try {
              await app.repo.deleteProfile(del.p.id);
              await app.refreshProfiles();
              setMsg(`「${del.p.nickname}」を削除しました`);
            } catch {
              setMsg('削除できませんでした');
            }
            setDel(null);
          }}
        />
      )}
    </div>
  );
}
