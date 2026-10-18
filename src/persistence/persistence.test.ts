import { describe, expect, it, beforeEach } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { indexedDbBackend, memoryBackend, openIndexedDb } from './db';
import { Repo } from './repo';
import { applyImport, exportBundle, previewImport } from './backup';
import type { StoredAttempt } from './types';

let dbName = '';
beforeEach(() => {
  // テストごとに新しい IndexedDB
  globalThis.indexedDB = new IDBFactory();
  dbName = `test-${Math.random()}`;
});

async function openRepo() {
  return new Repo(indexedDbBackend(await openIndexedDb(dbName)));
}

function attempt(profileId: string, i: number, sessionId = 's1'): StoredAttempt {
  return {
    id: `${profileId}-a${i}`,
    profileId,
    sessionId,
    mode: 'calculation',
    op: 'add',
    difficulty: 'easy',
    questionKey: `add:${i}:1`,
    generatorVersion: 1,
    questionSnapshot: { a: i, b: 1 },
    answerSnapshot: i + 1,
    firstTryCorrect: true,
    finalCorrect: true,
    retryCount: 0,
    hintsUsed: 0,
    answeredAt: new Date(2026, 0, 1, 0, 0, i).toISOString(),
  };
}

describe('profiles', () => {
  it('validates nicknames (1-12 chars, trimmed, emoji ok)', async () => {
    const repo = await openRepo();
    await expect(repo.createProfile('   ', 'fox')).rejects.toThrow();
    await expect(repo.createProfile('あいうえおかきくけこさしす', 'fox')).rejects.toThrow();
    const p = await repo.createProfile('  たろう🦊 ', 'fox');
    expect(p.nickname).toBe('たろう🦊');
  });

  it('A and B records stay separate, also with the same nickname, and survive reopening', async () => {
    const repo = await openRepo();
    const a = await repo.createProfile('ゆう', 'cat');
    const b = await repo.createProfile('ゆう', 'panda');
    expect(a.id).not.toBe(b.id);
    for (let i = 0; i < 10; i++) await repo.saveAttempt(attempt(a.id, i));
    for (let i = 0; i < 10; i++) await repo.saveAttempt(attempt(b.id, i));
    await repo.saveSession({ id: 'draftA', profileId: a.id, mode: 'game', gameId: 'sudoku', createdAt: 'x', updatedAt: 'x', status: 'inProgress', settingsSnapshot: {}, activeDraft: { g: 1 } });
    // 「再起動」：DB を開き直す
    const repo2 = await openRepo();
    expect(await repo2.listAttempts(a.id)).toHaveLength(10);
    expect(await repo2.listAttempts(b.id)).toHaveLength(10);
    expect((await repo2.listAttempts(a.id)).every((x) => x.profileId === a.id)).toBe(true);
    expect(await repo2.findDraft(a.id, 'game', 'sudoku')).toBeDefined();
    expect(await repo2.findDraft(b.id, 'game', 'sudoku')).toBeUndefined();
  });

  it('delete removes only that profile and its data', async () => {
    const repo = await openRepo();
    const a = await repo.createProfile('A', 'cat');
    const b = await repo.createProfile('B', 'lion');
    await repo.saveAttempt(attempt(a.id, 1));
    await repo.saveAttempt(attempt(b.id, 1));
    await repo.deleteProfile(a.id);
    expect((await repo.listProfiles()).map((p) => p.id)).toEqual([b.id]);
    expect(await repo.listAttempts(a.id)).toHaveLength(0);
    expect(await repo.listAttempts(b.id)).toHaveLength(1);
  });

  it('memory backend behaves the same and rolls back failed transactions', async () => {
    const repo = new Repo(memoryBackend());
    const a = await repo.createProfile('A', 'cat');
    await expect(
      repo.backend.run(['profiles'], 'readwrite', async (tx) => {
        await tx.delete('profiles', a.id);
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect(await repo.listProfiles()).toHaveLength(1);
  });
});

describe('backup', () => {
  async function seeded() {
    const repo = await openRepo();
    const a = await repo.createProfile('A', 'cat');
    const b = await repo.createProfile('A', 'fox');
    await repo.saveAttempt(attempt(a.id, 1));
    await repo.saveAttempt(attempt(b.id, 2));
    await repo.saveSettings({ ...(await repo.getSettings(a.id)), soundOn: false });
    return { repo, a, b };
  }

  it('export → delete → import restores profiles, records and settings', async () => {
    const { repo, a, b } = await seeded();
    const json = JSON.stringify(await exportBundle(repo));
    await repo.deleteProfile(a.id);
    await repo.deleteProfile(b.id);
    const pv = await previewImport(repo, json);
    expect(pv.ok).toBe(true);
    expect(pv.counts).toEqual({ profiles: 2, sessions: 0, attempts: 2 });
    await applyImport(repo, pv.bundle!, 'merge');
    expect(await repo.listProfiles()).toHaveLength(2);
    expect(await repo.listAttempts(a.id)).toHaveLength(1);
    expect((await repo.getSettings(a.id)).soundOn).toBe(false);
  });

  it('new game ids (17〜19) survive export → replace import, together with older records', async () => {
    const { repo, a } = await seeded();
    for (const [i, gameId] of ['missing-number', 'triangle-pattern', 'dot-connect'].entries()) {
      await repo.saveAttempt({ ...attempt(a.id, 20 + i, 'g1'), mode: 'game', op: undefined, gameId, questionKey: `${gameId}:${i}` });
    }
    await repo.saveSession({ id: 'g1', profileId: a.id, mode: 'game', gameId: 'dot-connect', createdAt: 'x', updatedAt: 'x', status: 'inProgress', settingsSnapshot: {}, activeDraft: { view: { segments: [[0, 0, 1, 0]] } } });
    await repo.saveSettings({ ...(await repo.getSettings(a.id)), preferredDifficultyByGame: { 'triangle-pattern': 'hard' } });
    const json = JSON.stringify(await exportBundle(repo));
    const fresh = new Repo(memoryBackend());
    const pv = await previewImport(fresh, json);
    expect(pv.ok).toBe(true);
    await applyImport(fresh, pv.bundle!, 'replace');
    const list = await fresh.listAttempts(a.id);
    expect(list.map((x) => x.gameId).filter(Boolean).sort()).toEqual(['dot-connect', 'missing-number', 'triangle-pattern']);
    expect(list.filter((x) => x.mode === 'calculation')).toHaveLength(1);
    expect((await fresh.findDraft(a.id, 'game', 'dot-connect'))?.activeDraft).toEqual({ view: { segments: [[0, 0, 1, 0]] } });
    expect((await fresh.getSettings(a.id)).preferredDifficultyByGame['triangle-pattern']).toBe('hard');
  });

  it('merge skips duplicate IDs instead of overwriting', async () => {
    const { repo, a } = await seeded();
    const bundle = await exportBundle(repo);
    bundle.attempts.push(attempt(a.id, 9));
    bundle.attempts[0] = { ...bundle.attempts[0], answerSnapshot: 'CHANGED' };
    const pv = await previewImport(repo, JSON.stringify(bundle));
    expect(pv.merge).toMatchObject({ newProfiles: 0, existingProfiles: 2, newAttempts: 1, skippedAttempts: 2 });
    await applyImport(repo, pv.bundle!, 'merge');
    const list = await repo.listAttempts(a.id);
    expect(list).toHaveLength(2);
    expect(list.some((x) => x.answerSnapshot === 'CHANGED')).toBe(false);
  });

  it('rejects broken JSON, foreign files, newer schema, duplicate IDs and orphan records', async () => {
    const { repo } = await seeded();
    const good = await exportBundle(repo);
    expect((await previewImport(repo, '{oops')).ok).toBe(false);
    expect((await previewImport(repo, JSON.stringify({ hello: 1 }))).ok).toBe(false);
    expect((await previewImport(repo, JSON.stringify({ ...good, schemaVersion: 99 }))).errors[0]).toMatch(/あたらしい/);
    const dup = { ...good, profiles: [good.profiles[0], good.profiles[0]] };
    expect((await previewImport(repo, JSON.stringify(dup))).ok).toBe(false);
    const orphan = { ...good, attempts: [{ ...good.attempts[0], profileId: 'nobody' }] };
    expect((await previewImport(repo, JSON.stringify(orphan))).ok).toBe(false);
  });

  it('migrates the old v0 format', async () => {
    const { repo } = await seeded();
    const good = await exportBundle(repo);
    const v0 = {
      ...good,
      schemaVersion: 0,
      settings: Object.values(good.settings),
      attempts: good.attempts.map(({ generatorVersion: _g, ...rest }) => rest),
    };
    const pv = await previewImport(repo, JSON.stringify(v0));
    expect(pv.ok).toBe(true);
    expect(pv.warnings.join()).toMatch(/v0/);
    expect(pv.bundle!.attempts.every((x) => x.generatorVersion === 0)).toBe(true);
  });

  it('a failing replace keeps the old data intact', async () => {
    const { repo, a } = await seeded();
    const bundle = await exportBundle(repo);
    // keyPath の無い壊れた記録を混ぜると、書き込みの途中で失敗する
    const broken = { ...bundle, attempts: [...bundle.attempts, { notAnId: true } as unknown as StoredAttempt] };
    await expect(applyImport(repo, broken, 'replace')).rejects.toBeTruthy();
    expect(await repo.listProfiles()).toHaveLength(2);
    expect(await repo.listAttempts(a.id)).toHaveLength(1);
  });

  it('replace swaps all data', async () => {
    const { repo } = await seeded();
    const other = await openRepo();
    globalThis.indexedDB = new IDBFactory();
    const fresh = new Repo(indexedDbBackend(await openIndexedDb('other')));
    const c = await fresh.createProfile('C', 'penguin');
    const pv = await previewImport(repo, JSON.stringify(await exportBundle(fresh)));
    await applyImport(repo, pv.bundle!, 'replace');
    expect((await repo.listProfiles()).map((p) => p.id)).toEqual([c.id]);
    expect(other).toBeTruthy();
  });
});

describe('保護者の設定（アプリ全体）', () => {
  it('初期は制限なし。プロフィール削除・バックアップ置換で消えず、バックアップには含まれない', async () => {
    const repo = await openRepo();
    expect((await repo.getParental()).enabled).toBe(false);
    const a = await repo.createProfile('A', 'cat');
    await repo.saveParental({ enabled: true, limitMinutes: 30, pin: { algo: 'PBKDF2-SHA256', iterations: 1, salt: 'c2FsdA==', hash: 'aGFzaA==' }, failures: 0, retryAt: 0 });
    await repo.updatePlaytime(() => ({ state: { usedMs: 30 * 60_000, phase: 'locked', warned: true }, result: null }));
    const bundle = await exportBundle(repo);
    expect(JSON.stringify(bundle)).not.toMatch(/PBKDF2|playtime|parental|locked/);
    await repo.deleteProfile(a.id);
    const fresh = { ...bundle, profiles: [], attempts: [], sessions: [], settings: {} };
    const pv = await previewImport(repo, JSON.stringify(fresh));
    await applyImport(repo, pv.bundle!, 'replace');
    // 復元・削除をしても ロックは解除されない
    expect((await repo.getParental()).enabled).toBe(true);
    expect((await repo.getPlaytime()).phase).toBe('locked');
  });
});
