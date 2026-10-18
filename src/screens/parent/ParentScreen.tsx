import { useEffect, useState } from 'react';
import { useApp } from '../../app/AppContext';
import { navigate } from '../../app/router';
import { HoldButton, TopBar } from '../../components/ui';
import { useParental } from '../../app/ParentalContext';
import { PinEntry } from '../parental/PinEntry';
import { BackupPanel } from './BackupPanel';
import { ProfilesPanel } from './ProfilesPanel';
import { RecordsPanel } from './RecordsPanel';
import { SettingsPanel } from './SettingsPanel';
import { StoragePanel } from './StoragePanel';
import { TimeLimitPanel } from './TimeLimitPanel';

type Tab = 'records' | 'profiles' | 'settings' | 'backup' | 'storage';

export function ParentScreen() {
  const [unlocked, setUnlocked] = useState(false);
  const [tab, setTab] = useState<Tab>('records');
  const app = useApp();
  const parental = useParental();
  const hasPin = !!parental.config.pin;
  useEffect(() => {
    if (!app.profile) navigate('/', { replace: true });
  }, [app.profile]);
  if (!unlocked)
    return (
      <main className="screen narrow">
        <TopBar title="おとなの メニュー" onBack={() => navigate('/home')} />
        {hasPin ? (
          <div className="card stack">
            <p className="center-text" style={{ margin: 0 }}>
              ここは おうちの ひと むけの ページです。
              <br />
              あんしょうばんごう（4けた）を いれてください。
            </p>
            <PinEntry
              onSubmit={async (pin) => {
                const r = await parental.checkPin(pin);
                if (r.ok) setUnlocked(true);
                return r;
              }}
            />
          </div>
        ) : (
          <div className="card stack center-text">
            <p style={{ margin: 0 }}>ここは おうちの ひと むけの ページです。</p>
            <p className="small muted" style={{ margin: 0 }}>
              まちがって ひらかないための かくにんです（パスワードによる ほごでは ありません。「あそぶ じかん」で あんしょうばんごうを きめると、ばんごうで まもれます）。
            </p>
            <HoldButton className="btn primary big" onDone={() => setUnlocked(true)}>
              ボタンを ながおしして ひらく
            </HoldButton>
          </div>
        )}
      </main>
    );
  return (
    <main className="screen adult-text" style={{ maxWidth: 900 }}>
      <TopBar title="おとなの メニュー" onBack={() => navigate('/home')} />
      <div className="grid-tabs" role="tablist" style={{ ['--n' as string]: 5, ['--cols' as string]: 3 }}>
        {(
          [
            ['records', 'きろく'],
            ['profiles', 'プロフィール'],
            ['settings', 'せってい'],
            ['backup', 'バックアップ'],
            ['storage', 'ほぞんについて'],
          ] as [Tab, string][]
        ).map(([k, l]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} className="chip" onClick={() => setTab(k)}>
            {l}
          </button>
        ))}
      </div>
      {tab === 'records' && <RecordsPanel />}
      {tab === 'profiles' && <ProfilesPanel />}
      {tab === 'settings' && (
        <>
          <TimeLimitPanel />
          <SettingsPanel />
        </>
      )}
      {tab === 'backup' && <BackupPanel />}
      {tab === 'storage' && <StoragePanel />}
    </main>
  );
}
