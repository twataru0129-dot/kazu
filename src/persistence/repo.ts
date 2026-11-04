import { newId } from '../domain/random';
import type { Backend } from './db';
import { defaultParental, defaultSettings, type AvatarId, type ParentalConfig, type Profile, type Session, type StoredAttempt, type UserSettings } from './types';
import { isLimitMode, normalizePlaytime, type PlaytimeState } from '../domain/parental/playtime';

/** 保存失敗を画面に知らせるための通知 */
type SaveListener = (ok: boolean, error?: unknown) => void;
const listeners = new Set<SaveListener>();
export function onSaveResult(fn: SaveListener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
function notify(ok: boolean, error?: unknown) {
  listeners.forEach((fn) => fn(ok, error));
}

export const nowIso = () => new Date().toISOString();

export function normalizeNickname(raw: string): string {
  return raw.replace(/^[\s　]+|[\s　]+$/g, '');
}

/** 1〜12文字（絵文字なども1文字として数える） */
export function nicknameError(raw: string): string | null {
  const n = normalizeNickname(raw);
  const len = [...n].length;
  if (len === 0) return 'なまえを いれてね';
  if (len > 12) return 'なまえは 12もじ までだよ';
  return null;
}

export class Repo {
  constructor(readonly backend: Backend) {}

  get persistent() {
    return this.backend.kind === 'indexeddb';
  }

  /** 書き込みを行い、成否を通知する。失敗は呼び出し側にも返す（保存できたと偽らない）。 */
  private pending = 0;
  private idleWaiters: (() => void)[] = [];

  /** 書き込み中のものがすべて終わったら解決する（アプリ更新の再読み込み前に使う） */
  whenIdle(): Promise<void> {
    if (this.pending === 0) return Promise.resolve();
    return new Promise((resolve) => this.idleWaiters.push(resolve));
  }

  private async write<T>(fn: () => Promise<T>): Promise<T> {
    this.pending++;
    try {
      const r = await fn();
      notify(true);
      return r;
    } catch (e) {
      notify(false, e);
      throw e;
    } finally {
      this.pending--;
      if (this.pending === 0) this.idleWaiters.splice(0).forEach((f) => f());
    }
  }

  // ---- プロフィール ----
  listProfiles(): Promise<Profile[]> {
    return this.backend.run(['profiles'], 'readonly', (tx) => tx.getAll<Profile>('profiles')).then((ps) => ps.sort((a, b) => a.createdAt.localeCompare(b.createdAt)));
  }

  getProfile(id: string): Promise<Profile | undefined> {
    return this.backend.run(['profiles'], 'readonly', (tx) => tx.get<Profile>('profiles', id));
  }

  createProfile(nickname: string, avatarId: AvatarId): Promise<Profile> {
    const err = nicknameError(nickname);
    if (err) return Promise.reject(new Error(err));
    const t = nowIso();
    const p: Profile = { id: newId(), nickname: normalizeNickname(nickname), avatarId, createdAt: t, updatedAt: t };
    return this.write(() =>
      this.backend.run(['profiles', 'settings'], 'readwrite', async (tx) => {
        await tx.put('profiles', p);
        await tx.put('settings', defaultSettings(p.id));
        return p;
      }),
    );
  }

  updateProfile(id: string, changes: { nickname?: string; avatarId?: AvatarId }): Promise<Profile> {
    if (changes.nickname !== undefined) {
      const err = nicknameError(changes.nickname);
      if (err) return Promise.reject(new Error(err));
    }
    return this.write(() =>
      this.backend.run(['profiles'], 'readwrite', async (tx) => {
        const p = await tx.get<Profile>('profiles', id);
        if (!p) throw new Error('profile not found');
        const next: Profile = {
          ...p,
          nickname: changes.nickname !== undefined ? normalizeNickname(changes.nickname) : p.nickname,
          avatarId: changes.avatarId ?? p.avatarId,
          updatedAt: nowIso(),
        };
        await tx.put('profiles', next);
        return next;
      }),
    );
  }

  /** プロフィールと、そのプロフィールの記録・設定・途中データをまとめて削除 */
  deleteProfile(id: string): Promise<void> {
    return this.write(() =>
      this.backend.run(['profiles', 'settings', 'sessions', 'attempts'], 'readwrite', async (tx) => {
        const sessions = await tx.getAllByIndex<Session>('sessions', 'profileId', id);
        const attempts = await tx.getAllByIndex<StoredAttempt>('attempts', 'profileId', id);
        for (const s of sessions) await tx.delete('sessions', s.id);
        for (const a of attempts) await tx.delete('attempts', a.id);
        await tx.delete('settings', id);
        await tx.delete('profiles', id);
      }),
    );
  }

  // ---- 保護者の設定・あそぶ じかん（アプリ全体で1組。meta ストア） ----
  async getParental(): Promise<ParentalConfig> {
    const r = await this.backend.run(['meta'], 'readonly', (tx) => tx.get<ParentalConfig & { key: string }>('meta', 'parental'));
    if (!r) return defaultParental();
    const { key: _key, ...rest } = r;
    // 方式が ない（前の 版）・おかしい ときは 従来の PIN 方式（勝手に 自動回復に しない）
    return { ...defaultParental(), ...rest, mode: isLimitMode(rest.mode) ? rest.mode : 'pin' };
  }

  saveParental(c: ParentalConfig): Promise<void> {
    return this.write(() => this.backend.run(['meta'], 'readwrite', (tx) => tx.put('meta', { key: 'parental', ...c })));
  }

  async getPlaytime(): Promise<PlaytimeState> {
    const r = await this.backend.run(['meta'], 'readonly', (tx) => tx.get<PlaytimeState & { key: string }>('meta', 'playtime'));
    return normalizePlaytime(r);
  }

  /** 読んで・変えて・書くを1つのトランザクションで（複数のタブでも数え直しが混ざらない） */
  updatePlaytime<R>(fn: (s: PlaytimeState) => { state: PlaytimeState; result: R }): Promise<{ state: PlaytimeState; result: R }> {
    return this.write(() =>
      this.backend.run(['meta'], 'readwrite', async (tx) => {
        const r = await tx.get<PlaytimeState & { key: string }>('meta', 'playtime');
        const cur: PlaytimeState = normalizePlaytime(r);
        const out = fn(cur);
        await tx.put('meta', { key: 'playtime', ...out.state });
        return out;
      }),
    );
  }

  // ---- 設定 ----
  async getSettings(profileId: string): Promise<UserSettings> {
    const s = await this.backend.run(['settings'], 'readonly', (tx) => tx.get<UserSettings>('settings', profileId));
    return { ...defaultSettings(profileId), ...(s ?? {}) };
  }

  saveSettings(s: UserSettings): Promise<void> {
    return this.write(() => this.backend.run(['settings'], 'readwrite', (tx) => tx.put('settings', s)));
  }

  // ---- セッション ----
  saveSession(s: Session): Promise<void> {
    return this.write(() => this.backend.run(['sessions'], 'readwrite', (tx) => tx.put('sessions', { ...s, updatedAt: nowIso() })));
  }

  getSession(id: string): Promise<Session | undefined> {
    return this.backend.run(['sessions'], 'readonly', (tx) => tx.get<Session>('sessions', id));
  }

  listSessions(profileId: string): Promise<Session[]> {
    return this.backend
      .run(['sessions'], 'readonly', (tx) => tx.getAllByIndex<Session>('sessions', 'profileId', profileId))
      .then((ss) => ss.sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
  }

  /** 途中のセッション（そのプロフィールのものだけ） */
  async findDraft(profileId: string, mode: Session['mode'], gameId?: string): Promise<Session | undefined> {
    const ss = await this.listSessions(profileId);
    return ss.find((s) => s.status === 'inProgress' && s.mode === mode && (gameId === undefined || s.gameId === gameId) && s.activeDraft !== undefined);
  }

  // ---- 記録 ----
  saveAttempt(a: StoredAttempt): Promise<void> {
    return this.write(() => this.backend.run(['attempts'], 'readwrite', (tx) => tx.put('attempts', a)));
  }

  /** テストの1問の回答と途中状態を同時に保存（片方だけ保存される状態を作らない） */
  saveAttemptAndSession(a: StoredAttempt, s: Session): Promise<void> {
    return this.write(() =>
      this.backend.run(['attempts', 'sessions'], 'readwrite', async (tx) => {
        await tx.put('attempts', a);
        await tx.put('sessions', { ...s, updatedAt: nowIso() });
      }),
    );
  }

  listAttempts(profileId: string): Promise<StoredAttempt[]> {
    return this.backend
      .run(['attempts'], 'readonly', (tx) => tx.getAllByIndex<StoredAttempt>('attempts', 'profileId', profileId))
      .then((as) => as.sort((a, b) => a.answeredAt.localeCompare(b.answeredAt)));
  }

  listAttemptsBySession(sessionId: string): Promise<StoredAttempt[]> {
    return this.backend.run(['attempts'], 'readonly', (tx) => tx.getAllByIndex<StoredAttempt>('attempts', 'sessionId', sessionId));
  }
}
