import { describe, expect, it } from 'vitest';
import { createPinRecord, isValidPin, isWeakPin, lockoutMs, verifyPin, FREE_ATTEMPTS } from './pin';
import { advance, afterUnlock, initialPlaytime, isValidLimit, LIMIT_OPTIONS, remainingMs, type PlaytimeState } from './playtime';

describe('PIN', () => {
  it('4桁の半角数字だけ', () => {
    for (const p of ['0000', '1234', '9876', '0505']) expect(isValidPin(p)).toBe(true);
    for (const p of ['123', '12345', '12a4', '１２３４', ' 123', '']) expect(isValidPin(p)).toBe(false);
    expect(isWeakPin('1111')).toBe(true);
    expect(isWeakPin('1234')).toBe(true);
    expect(isWeakPin('8642')).toBe(false);
  });

  it('PIN そのものは保存せず、salt つきの検証用データで照合する', async () => {
    const rec = await createPinRecord('2580', 1000);
    expect(JSON.stringify(rec)).not.toContain('2580');
    expect(rec.algo).toBe('PBKDF2-SHA256');
    expect(await verifyPin('2580', rec)).toBe(true);
    expect(await verifyPin('2581', rec)).toBe(false);
    expect(await verifyPin('abcd', rec)).toBe(false);
    const rec2 = await createPinRecord('2580', 1000);
    expect(rec2.salt).not.toBe(rec.salt); // 同じ PIN でも salt が違う
    expect(rec2.hash).not.toBe(rec.hash);
  });

  it('連続でまちがえると待ち時間がのびる', () => {
    expect(lockoutMs(FREE_ATTEMPTS - 1)).toBe(0);
    expect(lockoutMs(FREE_ATTEMPTS)).toBe(30_000);
    expect(lockoutMs(FREE_ATTEMPTS + 1)).toBe(60_000);
    expect(lockoutMs(100)).toBe(10 * 60_000);
  });
});

describe('あそぶ じかん', () => {
  const on = (m = 30) => ({ enabled: true, limitMinutes: m });
  const min = 60_000;
  const play = { visible: true, path: '/play/sudoku' };
  const home = { visible: true, path: '/home' };

  /** 1秒ずつ ms ぶん進める */
  function run(c: { enabled: boolean; limitMinutes: number }, s: PlaytimeState, ms: number, ctx = play) {
    let state = s;
    let warns = 0;
    let lock = false;
    for (let t = 0; t < ms; t += 1000) {
      const r = advance(c, state, 1000, ctx);
      state = r.state;
      if (r.warn) warns++;
      if (r.lock) lock = true;
    }
    return { state, warns, lock };
  }

  it('5〜60分・5分刻みだけ', () => {
    expect([...LIMIT_OPTIONS]).toEqual([5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60]);
    for (const v of [5, 30, 60]) expect(isValidLimit(v)).toBe(true);
    for (const v of [0, 4, 7, 61, 65, 30.5, '30', null]) expect(isValidLimit(v)).toBe(false);
  });

  it('制限オフ（初期状態）では数えない・ロックしない', () => {
    const r = run({ enabled: false, limitMinutes: 30 }, initialPlaytime(), 90 * min);
    expect(r.state.usedMs).toBe(0);
    expect(r.lock).toBe(false);
  });

  it('解除直後・有効にした直後は、モードを選ぶまで数えない', () => {
    let r = run(on(), afterUnlock(), 10 * min, home);
    expect(r.state.phase).toBe('waiting');
    expect(r.state.usedMs).toBe(0);
    r = run(on(), r.state, 10 * min, { visible: true, path: '/parent' });
    expect(r.state.usedMs).toBe(0);
    r = run(on(), r.state, 2 * min, play);
    expect(r.state.phase).toBe('running');
    expect(r.state.usedMs).toBe(2 * min);
    // 遊びはじめたあとは ホームや プロフィール選択でも数える（プロフィールを変えても回避できない）
    r = run(on(), r.state, 1 * min, { visible: true, path: '/' });
    expect(r.state.usedMs).toBe(3 * min);
  });

  it('30分→10分遊ぶ→保存した状態から再開すると残り約20分（30分に戻らない）', () => {
    const r = run(on(), initialPlaytime(), 10 * min);
    const saved = JSON.parse(JSON.stringify(r.state)) as PlaytimeState; // アプリを閉じて開き直す
    expect(remainingMs(on(), saved)).toBe(20 * min);
    const r2 = run(on(), saved, 1 * min);
    expect(remainingMs(on(), r2.state)).toBe(19 * min);
  });

  it('非表示・おとなのメニューの間は数えない', () => {
    let r = run(on(), initialPlaytime(), 5 * min);
    r = run(on(), r.state, 60 * min, { visible: false, path: '/play/sudoku' });
    expect(r.state.usedMs).toBe(5 * min);
    r = run(on(), r.state, 60 * min, { visible: true, path: '/parent' });
    expect(r.state.usedMs).toBe(5 * min);
  });

  it('残り5分の案内は1回だけ、時間切れでロック', () => {
    const r = run(on(), initialPlaytime(), 30 * min + 5000);
    expect(r.warns).toBe(1);
    expect(r.lock).toBe(true);
    expect(r.state.phase).toBe('locked');
    // ロック中は数えない・解除されない
    const r2 = run(on(), r.state, 10 * min);
    expect(r2.state.phase).toBe('locked');
    // PIN で解除すると 枠が設定値に戻る
    expect(remainingMs(on(), afterUnlock())).toBe(30 * min);
  });

  it('大きく時間が飛んでも 1回で数えるのは最大60秒（スリープ・時計の変更）', () => {
    const r = advance(on(), { ...initialPlaytime(), phase: 'running' }, 3_600_000, play);
    expect(r.state.usedMs).toBe(60_000);
    const neg = advance(on(), { ...initialPlaytime(), phase: 'running' }, -50_000, play);
    expect(neg.state.usedMs).toBe(0);
  });

  it('制限を短くして すでに使い切っていたら すぐロック', () => {
    const r = advance(on(5), { usedMs: 10 * min, phase: 'running', warned: true }, 0, play);
    expect(r.lock).toBe(true);
  });
});
