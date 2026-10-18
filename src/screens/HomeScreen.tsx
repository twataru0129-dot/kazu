import { useApp, useProfile } from '../app/AppContext';
import { navigate } from '../app/router';
import { applyUpdate, useUpdateState } from '../app/pwa';
import { Avatar } from '../components/Avatar';
import { IconGear, IconSwitch, ModeIcon } from '../components/Icons';
import { SoundToggle } from '../components/ui';
import { APP_NAME, MODES, type ModeKey } from '../config/theme';

export function HomeScreen() {
  const { profile } = useProfile();
  const app = useApp();
  const update = useUpdateState();
  return (
    <main className="screen">
      <header className="topbar">
        <Avatar id={profile.avatarId} size={44} />
        <h1>
          {profile.nickname}
          <span className="small muted" style={{ display: 'block', fontWeight: 400 }}>
            {APP_NAME}
          </span>
        </h1>
        <SoundToggle />
        <button type="button" className="icon-btn" aria-label="あそぶ ひとを かえる" onClick={() => navigate('/')}>
          <IconSwitch />
        </button>
        <button type="button" className="icon-btn" aria-label="おとなの メニュー" onClick={() => navigate('/parent')}>
          <IconGear />
        </button>
      </header>
      {!app.persistent && (
        <div className="banner" role="alert">
          この ブラウザでは きろくを ほぞん できません（とじると きえます）。あそぶ ことは できます。
        </div>
      )}
      {update === 'applying' && (
        <div className="banner info" role="status">
          あたらしい バージョンに しています…（きろくは きえません）
        </div>
      )}
      {update === 'waiting' && (
        <div className="banner info">
          あたらしい バージョンが あります。
          <button type="button" className="btn" onClick={applyUpdate}>
            こうしん する
          </button>
          <span className="small">（きろくは きえません）</span>
        </div>
      )}
      <nav className="mode-grid" aria-label="モード">
        {(Object.keys(MODES) as ModeKey[]).map((k) => {
          const m = MODES[k];
          return (
            <button
              key={k}
              type="button"
              className="mode-card"
              style={{ ['--soft' as string]: m.soft, ['--accent' as string]: m.color, borderColor: m.color + '33' }}
              onClick={() => navigate(m.path)}
            >
              <ModeIcon mode={k} />
              <strong>{m.label}</strong>
              <span>{m.sub}</span>
            </button>
          );
        })}
      </nav>
      <p className="center-text small muted" style={{ marginTop: 'auto' }}>
        じかんの せいげんは ないよ。ゆっくり かんがえよう。
      </p>
    </main>
  );
}
