import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createBackend } from '../persistence/db';
import { onSaveResult, Repo } from '../persistence/repo';
import type { Profile, UserSettings } from '../persistence/types';
import { setSoundEnabled } from '../audio/sfx';
import { setSpeechEnabled } from '../audio/speech';

const LAST_PROFILE_KEY = 'kazu.lastProfileId';
/** 同じタブでのリロード時だけ、遊んでいたプロフィールを復元する（新しく開いたときは選択画面） */
const TAB_PROFILE_KEY = 'kazu.tabProfileId';

function tabProfile(): string | null {
  try {
    return sessionStorage.getItem(TAB_PROFILE_KEY);
  } catch {
    return null;
  }
}

export interface AppState {
  repo: Repo;
  persistent: boolean;
  profiles: Profile[];
  profile: Profile | null;
  settings: UserSettings | null;
  refreshProfiles(): Promise<Profile[]>;
  selectProfile(id: string | null): Promise<void>;
  updateSettings(patch: Partial<UserSettings>): Promise<void>;
  lastProfileId: string | null;
}

const Ctx = createContext<AppState | null>(null);

export function useApp(): AppState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useApp outside provider');
  return v;
}

/** 現在のプロフィールが必要な画面用 */
export function useProfile(): { profile: Profile; settings: UserSettings; repo: Repo; updateSettings: AppState['updateSettings'] } {
  const app = useApp();
  if (!app.profile || !app.settings) throw new Error('no profile');
  return { profile: app.profile, settings: app.settings, repo: app.repo, updateSettings: app.updateSettings };
}

function readLast(): string | null {
  try {
    return localStorage.getItem(LAST_PROFILE_KEY);
  } catch {
    return null;
  }
}

function applySettingsToDocument(s: UserSettings | null) {
  const root = document.documentElement;
  root.dataset.motion = s?.reducedMotion ? 'reduced' : 'normal';
  root.dataset.text = s?.largeText ? 'large' : 'normal';
  setSoundEnabled(s?.soundOn ?? true);
  setSpeechEnabled(s?.speechOn ?? false);
}

export function AppProvider({ children, repo: injected }: { children: ReactNode; repo?: Repo }) {
  const [repo, setRepo] = useState<Repo | null>(injected ?? null);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [loaded, setLoaded] = useState(false);
  const settingsRef = useRef<UserSettings | null>(null);

  useEffect(() => {
    if (repo) return;
    let alive = true;
    createBackend().then((b) => alive && setRepo(new Repo(b)));
    return () => {
      alive = false;
    };
  }, [repo]);

  const refreshProfiles = useCallback(async () => {
    if (!repo) return [];
    const ps = await repo.listProfiles();
    setProfiles(ps);
    return ps;
  }, [repo]);

  useEffect(() => {
    if (!repo) return;
    refreshProfiles().then(async (ps) => {
      const tab = tabProfile();
      if (tab && ps.some((p) => p.id === tab)) {
        const s = await repo.getSettings(tab);
        settingsRef.current = s;
        setProfile(ps.find((p) => p.id === tab)!);
        setSettings(s);
        applySettingsToDocument(s);
      }
      setLoaded(true);
    });
  }, [repo, refreshProfiles]);

  const selectProfile = useCallback(
    async (id: string | null) => {
      if (!repo) return;
      if (id === null) {
        try {
          sessionStorage.removeItem(TAB_PROFILE_KEY);
        } catch {
          /* noop */
        }
        setProfile(null);
        setSettings(null);
        settingsRef.current = null;
        applySettingsToDocument(null);
        return;
      }
      const p = await repo.getProfile(id);
      if (!p) return;
      const s = await repo.getSettings(id);
      settingsRef.current = s;
      setProfile(p);
      setSettings(s);
      applySettingsToDocument(s);
      try {
        localStorage.setItem(LAST_PROFILE_KEY, id);
        sessionStorage.setItem(TAB_PROFILE_KEY, id);
      } catch {
        /* localStorage が使えなくても続ける */
      }
    },
    [repo],
  );

  const updateSettings = useCallback(
    async (patch: Partial<UserSettings>) => {
      if (!repo || !settingsRef.current) return;
      const next = { ...settingsRef.current, ...patch };
      settingsRef.current = next;
      setSettings(next);
      applySettingsToDocument(next);
      await repo.saveSettings(next);
    },
    [repo],
  );

  // プロフィールが削除・変更されたら追従
  useEffect(() => {
    if (!profile) return;
    const p = profiles.find((x) => x.id === profile.id);
    if (!p) void selectProfile(null);
    else if (p !== profile && p.updatedAt !== profile.updatedAt) setProfile(p);
  }, [profiles, profile, selectProfile]);

  const value = useMemo<AppState | null>(
    () =>
      repo
        ? { repo, persistent: repo.persistent, profiles, profile, settings, refreshProfiles, selectProfile, updateSettings, lastProfileId: readLast() }
        : null,
    [repo, profiles, profile, settings, refreshProfiles, selectProfile, updateSettings],
  );

  if (!value || !loaded) return <div className="screen center-text muted" style={{ justifyContent: 'center' }}>よみこみちゅう…</div>;
  return (
    <Ctx.Provider value={value}>
      {children}
      <SaveErrorToast />
    </Ctx.Provider>
  );
}

function SaveErrorToast() {
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const off = onSaveResult((ok) => {
      if (ok) return;
      setMsg('きろくを ほぞん できませんでした。ブラウザの ようりょうや せっていを たしかめてください。');
      clearTimeout(timer);
      timer = setTimeout(() => setMsg(null), 6000);
    });
    return () => {
      off();
      clearTimeout(timer);
    };
  }, []);
  if (!msg) return null;
  return (
    <div className="toast" role="alert">
      {msg}
    </div>
  );
}
