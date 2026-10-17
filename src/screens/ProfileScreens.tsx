import { useState } from 'react';
import { useApp } from '../app/AppContext';
import { navigate } from '../app/router';
import { Avatar, AVATAR_LABEL } from '../components/Avatar';
import { APP_NAME } from '../config/theme';
import { nicknameError } from '../persistence/repo';
import { AVATAR_IDS, type AvatarId, type Profile } from '../persistence/types';
import { TopBar } from '../components/ui';

export function ProfileForm({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial?: Pick<Profile, 'nickname' | 'avatarId'>;
  submitLabel: string;
  onSubmit(nickname: string, avatar: AvatarId): Promise<void>;
  onCancel?: () => void;
}) {
  const app = useApp();
  const [name, setName] = useState(initial?.nickname ?? '');
  const [avatar, setAvatar] = useState<AvatarId>(initial?.avatarId ?? 'fox');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const dupName = app.profiles.some((p) => p.nickname === name.trim() && p.nickname !== initial?.nickname);
  const submit = async () => {
    const err = nicknameError(name);
    if (err) {
      setError(err);
      return;
    }
    setBusy(true);
    try {
      await onSubmit(name, avatar);
    } catch (e) {
      setError(e instanceof Error && e.message ? `ほぞん できませんでした（${e.message}）` : 'ほぞん できませんでした');
    } finally {
      setBusy(false);
    }
  };
  return (
    <form
      className="stack"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <label className="field-label" htmlFor="nickname">
        なまえ（ニックネーム・12もじ まで）
      </label>
      <input
        id="nickname"
        className="text-input"
        value={name}
        maxLength={24}
        autoComplete="off"
        onChange={(e) => {
          setName(e.target.value);
          setError(null);
        }}
        placeholder="れい：ゆう"
      />
      {dupName && !error && <div className="banner info small">おなじ なまえの ひとが いるよ。べつの きろくとして わけて のこるので、だいじょうぶ。</div>}
      {error && (
        <div className="banner" role="alert">
          {error}
        </div>
      )}
      <span className="field-label">アイコンを えらぼう</span>
      <div className="avatar-pick" role="group" aria-label="アイコン">
        {AVATAR_IDS.map((id) => (
          <button key={id} type="button" aria-pressed={avatar === id} onClick={() => setAvatar(id)}>
            <Avatar id={id} size={56} />
            {AVATAR_LABEL[id]}
          </button>
        ))}
      </div>
      <div className="row end">
        {onCancel && (
          <button type="button" className="btn" onClick={onCancel}>
            やめる
          </button>
        )}
        <button type="submit" className="btn primary big" disabled={busy}>
          {submitLabel}
        </button>
      </div>
    </form>
  );
}

export function ProfileCreateScreen() {
  const app = useApp();
  const first = app.profiles.length === 0;
  return (
    <main className="screen narrow">
      {first ? (
        <div className="center-text" style={{ marginTop: 16 }}>
          <h1 style={{ margin: '8px 0 4px' }}>{APP_NAME}</h1>
          <p className="muted" style={{ margin: 0 }}>
            はじめまして！ まず なまえと アイコンを きめよう。
          </p>
        </div>
      ) : (
        <TopBar title="あたらしい ひとを ついか" onBack={() => navigate('/', { replace: true })} />
      )}
      <div className="card">
        <ProfileForm
          submitLabel="これで はじめる"
          onSubmit={async (name, avatar) => {
            const p = await app.repo.createProfile(name, avatar);
            await app.refreshProfiles();
            await app.selectProfile(p.id);
            navigate('/home', { replace: true });
          }}
          onCancel={first ? undefined : () => navigate('/', { replace: true })}
        />
      </div>
      <p className="small muted">
        きろくは この ブラウザの なかだけに のこります。メールアドレスや しゃしんは つかいません。
      </p>
    </main>
  );
}

export function ProfileSelectScreen() {
  const app = useApp();
  const [selected, setSelected] = useState<string | null>(app.lastProfileId && app.profiles.some((p) => p.id === app.lastProfileId) ? app.lastProfileId : (app.profiles[0]?.id ?? null));
  const sel = app.profiles.find((p) => p.id === selected);
  return (
    <main className="screen narrow">
      <div className="center-text" style={{ marginTop: 12 }}>
        <h1 style={{ margin: '8px 0 4px' }}>{APP_NAME}</h1>
        <p className="muted" style={{ margin: 0 }}>だれが あそぶ？</p>
      </div>
      <div className="profile-grid" role="list">
        {app.profiles.map((p) => (
          <button key={p.id} role="listitem" type="button" className={`profile-card ${selected === p.id ? 'selected' : ''}`} aria-pressed={selected === p.id} onClick={() => setSelected(p.id)}>
            <Avatar id={p.avatarId} size={72} />
            {p.nickname}
          </button>
        ))}
        <button type="button" className="profile-card" onClick={() => navigate('/create')} style={{ borderStyle: 'dashed', justifyContent: 'center' }}>
          <span style={{ fontSize: '2rem' }} aria-hidden>
            ＋
          </span>
          ついか する
        </button>
      </div>
      {sel && (
        <div className="card row" style={{ justifyContent: 'space-between' }}>
          <div className="row">
            <Avatar id={sel.avatarId} size={48} />
            <div>
              <strong style={{ fontSize: '1.15rem' }}>{sel.nickname}</strong>
              <div className="small muted">の きろくで あそぶよ</div>
            </div>
          </div>
          <button
            type="button"
            className="btn primary big"
            onClick={async () => {
              await app.selectProfile(sel.id);
              navigate('/home', { replace: true });
            }}
          >
            この こで あそぶ
          </button>
        </div>
      )}
    </main>
  );
}
