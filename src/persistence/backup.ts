import appConfig from '../../app.config.json';
import { DIFFICULTIES } from '../domain/types';
import type { Repo } from './repo';
import { AVATAR_IDS, SCHEMA_VERSION, defaultSettings, type BackupBundle, type Profile, type Session, type StoredAttempt, type UserSettings } from './types';
import { STORES } from './db';

export const BACKUP_FORMAT = appConfig.backupFormat;

export async function exportBundle(repo: Repo): Promise<BackupBundle> {
  return repo.backend.run(['profiles', 'settings', 'sessions', 'attempts'], 'readonly', async (tx) => {
    const settingsList = await tx.getAll<UserSettings>('settings');
    return {
      format: BACKUP_FORMAT,
      schemaVersion: SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      appName: appConfig.appName,
      profiles: await tx.getAll<Profile>('profiles'),
      sessions: await tx.getAll<Session>('sessions'),
      attempts: await tx.getAll<StoredAttempt>('attempts'),
      settings: Object.fromEntries(settingsList.map((s) => [s.profileId, s])),
    };
  });
}

export function backupFileName(d = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `kazu-asobi-backup-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}.json`;
}

export interface ImportPreview {
  ok: boolean;
  errors: string[];
  warnings: string[];
  bundle?: BackupBundle;
  sourceVersion?: number;
  exportedAt?: string;
  counts?: { profiles: number; sessions: number; attempts: number };
  profiles?: { id: string; nickname: string; exists: boolean }[];
  merge?: { newProfiles: number; existingProfiles: number; newSessions: number; skippedSessions: number; newAttempts: number; skippedAttempts: number };
  bytes?: number;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === 'string' && v.length > 0;

/**
 * 旧形式（v0：開発前の試作形式）からの移行。
 * v0 は settings が配列、attempts に generatorVersion が無い。
 */
function migrate(raw: Record<string, unknown>, warnings: string[]): Record<string, unknown> {
  const v = raw.schemaVersion;
  if (v === 0) {
    warnings.push('ふるい けいしきの バックアップ（v0）を いまの けいしき（v1）に かえて よみこみます。');
    const settingsArr = Array.isArray(raw.settings) ? raw.settings : [];
    return {
      ...raw,
      schemaVersion: 1,
      settings: Object.fromEntries(settingsArr.filter(isObj).map((s) => [String(s.profileId), s])),
      attempts: (Array.isArray(raw.attempts) ? raw.attempts : []).map((a) => (isObj(a) ? { generatorVersion: 0, retryCount: 0, hintsUsed: 0, ...a } : a)),
      sessions: Array.isArray(raw.sessions) ? raw.sessions : [],
    };
  }
  return raw;
}

/** JSON の検証とプレビュー作成。DB には何も書かない。 */
export async function previewImport(repo: Repo, text: string): Promise<ImportPreview> {
  const errors: string[] = [];
  const warnings: string[] = [];
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, errors: ['ファイルが こわれているか、JSON ではありません。'], warnings };
  }
  if (!isObj(raw) || raw.format !== BACKUP_FORMAT) return { ok: false, errors: ['このアプリの バックアップファイルでは ありません。'], warnings };
  const sourceVersion = raw.schemaVersion;
  if (typeof sourceVersion !== 'number' || !Number.isInteger(sourceVersion)) return { ok: false, errors: ['バージョン情報が ありません。'], warnings };
  if (sourceVersion > SCHEMA_VERSION)
    return { ok: false, errors: [`このファイルは あたらしい バージョン（v${sourceVersion}）で つくられました。アプリを こうしんしてから よみこんでください。`], warnings };
  if (sourceVersion < 0) return { ok: false, errors: ['しらない バージョンです。'], warnings };
  const m = migrate(raw, warnings);
  const profiles = m.profiles;
  const sessions = m.sessions;
  const attempts = m.attempts;
  const settings = m.settings;
  if (!Array.isArray(profiles) || !Array.isArray(sessions) || !Array.isArray(attempts) || !isObj(settings))
    return { ok: false, errors: ['ファイルの なかみが たりません（profiles / sessions / attempts / settings）。'], warnings };

  const ids = (xs: unknown[]) => xs.map((x) => (isObj(x) ? x.id : undefined));
  const dupIn = (xs: unknown[]) => {
    const seen = new Set<unknown>();
    const dups = new Set<unknown>();
    for (const id of xs) (seen.has(id) ? dups : seen).add(id);
    return [...dups];
  };
  profiles.forEach((p, i) => {
    if (!isObj(p) || !isStr(p.id) || typeof p.nickname !== 'string' || [...p.nickname].length < 1 || [...p.nickname].length > 12)
      errors.push(`プロフィール ${i + 1} の データが ただしく ありません。`);
    else if (!AVATAR_IDS.includes(p.avatarId as never)) errors.push(`プロフィール「${p.nickname}」の アイコンが ただしく ありません。`);
  });
  const pids = new Set(ids(profiles));
  for (const d of dupIn(ids(profiles))) errors.push(`おなじ ID の プロフィールが ふくまれています（${String(d)}）。`);
  for (const d of dupIn(ids(sessions)).slice(0, 3)) errors.push(`おなじ ID の セッションが ふくまれています（${String(d)}）。`);
  for (const d of dupIn(ids(attempts)).slice(0, 3)) errors.push(`おなじ ID の きろくが ふくまれています（${String(d)}）。`);
  let badRecords = 0;
  for (const s of sessions) if (!isObj(s) || !isStr(s.id) || !pids.has(s.profileId) || !['inProgress', 'completed', 'abandoned'].includes(String(s.status))) badRecords++;
  for (const a of attempts)
    if (!isObj(a) || !isStr(a.id) || !pids.has(a.profileId) || !isStr(a.sessionId) || !DIFFICULTIES.includes(a.difficulty as never) || !isStr(a.answeredAt)) badRecords++;
  if (badRecords > 0) errors.push(`ただしくない きろくが ${badRecords}けん あります。`);
  for (const [k, s] of Object.entries(settings)) if (!isObj(s) || s.profileId !== k || !pids.has(k)) warnings.push('つかわれていない せってい データは むしします。');
  if (errors.length) return { ok: false, errors, warnings };

  const bundle: BackupBundle = {
    format: BACKUP_FORMAT,
    schemaVersion: SCHEMA_VERSION,
    exportedAt: String(m.exportedAt ?? ''),
    profiles: profiles as Profile[],
    sessions: sessions as Session[],
    attempts: attempts as StoredAttempt[],
    settings: Object.fromEntries(Object.entries(settings as Record<string, UserSettings>).filter(([k]) => pids.has(k))),
  };
  const existing = await repo.backend.run(['profiles', 'sessions', 'attempts'], 'readonly', async (tx) => ({
    profiles: new Set((await tx.getAll<Profile>('profiles')).map((p) => p.id)),
    sessions: new Set((await tx.getAll<Session>('sessions')).map((s) => s.id)),
    attempts: new Set((await tx.getAll<StoredAttempt>('attempts')).map((a) => a.id)),
  }));
  const newSessions = bundle.sessions.filter((s) => !existing.sessions.has(s.id)).length;
  const newAttempts = bundle.attempts.filter((a) => !existing.attempts.has(a.id)).length;
  return {
    ok: true,
    errors,
    warnings,
    bundle,
    sourceVersion,
    exportedAt: bundle.exportedAt,
    bytes: text.length,
    counts: { profiles: bundle.profiles.length, sessions: bundle.sessions.length, attempts: bundle.attempts.length },
    profiles: bundle.profiles.map((p) => ({ id: p.id, nickname: p.nickname, exists: existing.profiles.has(p.id) })),
    merge: {
      newProfiles: bundle.profiles.filter((p) => !existing.profiles.has(p.id)).length,
      existingProfiles: bundle.profiles.filter((p) => existing.profiles.has(p.id)).length,
      newSessions,
      skippedSessions: bundle.sessions.length - newSessions,
      newAttempts,
      skippedAttempts: bundle.attempts.length - newAttempts,
    },
  };
}

/** 空き容量の確認（分かる環境のみ） */
export async function hasRoomFor(bytes: number): Promise<boolean> {
  try {
    const est = await navigator.storage?.estimate?.();
    if (!est || est.quota === undefined || est.usage === undefined) return true;
    return est.quota - est.usage > bytes * 3;
  } catch {
    return true;
  }
}

/**
 * 復元。1つのトランザクションで行うので、途中で失敗しても元のデータは残る。
 * merge: 同じ ID のプロフィール・記録は いまのものを残し、新しいものだけ追加。
 * replace: すべて消してから入れ替え。
 */
export async function applyImport(repo: Repo, bundle: BackupBundle, mode: 'merge' | 'replace'): Promise<void> {
  await repo.backend.run(STORES.filter((s) => s !== 'meta'), 'readwrite', async (tx) => {
    if (mode === 'replace') {
      await tx.clear('profiles');
      await tx.clear('settings');
      await tx.clear('sessions');
      await tx.clear('attempts');
    }
    const has = async (store: 'profiles' | 'sessions' | 'attempts', id: string) => mode === 'merge' && (await tx.get(store, id)) !== undefined;
    for (const p of bundle.profiles) {
      if (await has('profiles', p.id)) continue;
      await tx.put('profiles', p);
      await tx.put('settings', { ...defaultSettings(p.id), ...(bundle.settings[p.id] ?? {}), profileId: p.id });
    }
    for (const s of bundle.sessions) if (!(await has('sessions', s.id))) await tx.put('sessions', s);
    for (const a of bundle.attempts) if (!(await has('attempts', a.id))) await tx.put('attempts', a);
  });
}
