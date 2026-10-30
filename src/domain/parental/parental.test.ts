import { describe, expect, it } from 'vitest';
import { createPinRecord, isValidPin, isWeakPin, lockoutMs, verifyPin, FREE_ATTEMPTS } from './pin';
import {
  advance,
  afterSave,
  afterUnlock,
  initialPlaytime,
  isLockedNow,
  isValidLimit,
  limitSummary,
  LIMIT_OPTIONS,
  localDay,
  msSinceLocalMidnight,
  normalizePlaytime,
  remainingMs,
  rollDay,
  tickPlaytime,
  type LimitConfig,
  type PlaytimeState,
} from './playtime';

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

describe('v1.8 毎日自動回復（端末の 現地日付）', () => {
  const min = 60_000;
  const daily = (m = 15): LimitConfig => ({ enabled: true, limitMinutes: m, mode: 'daily' });
  const pinMode = (m = 15): LimitConfig => ({ enabled: true, limitMinutes: m, mode: 'pin' });
  const play = { visible: true, path: '/play/sudoku' };
  const home = { visible: true, path: '/home' };
  /** 現地時刻（月は 1〜12） */
  const at = (mo: number, d: number, h: number, mi: number, sec = 0) => new Date(2026, mo - 1, d, h, mi, sec);

  /** from から ms ぶん、1秒ずつ 時計を すすめて 数える */
  function runClock(c: LimitConfig, s: PlaytimeState, from: Date, ms: number, ctx = play) {
    let state = s;
    let t = from.getTime();
    let lock = false;
    let resets = 0;
    let warns = 0;
    for (let k = 0; k < ms; k += 1000) {
      t += 1000;
      const r = tickPlaytime(c, state, 1000, ctx, new Date(t));
      state = r.state;
      if (r.lock) lock = true;
      if (r.reset) resets++;
      if (r.warn) warns++;
    }
    return { state, lock, resets, warns, end: new Date(t) };
  }

  it('現地日付は ローカル時刻で きめる（UTC の 日付と まぜない）', () => {
    expect(localDay(at(10, 30, 23, 59, 59))).toBe('2026-10-30');
    expect(localDay(at(10, 31, 0, 0, 0))).toBe('2026-10-31');
    expect(localDay(at(1, 1, 0, 30))).toBe('2026-01-01');
    expect(localDay(at(12, 31, 23, 59))).toBe('2026-12-31');
    expect(msSinceLocalMidnight(at(10, 31, 0, 1))).toBe(min);
    expect(msSinceLocalMidnight(at(10, 30, 23, 58))).toBe((23 * 60 + 58) * min);
  });

  it('表示：「1日15分・毎日0時に回復」「1回15分・PINで解除」。前の 版の 設定（方式なし）は PIN', () => {
    expect(limitSummary(daily())).toBe('1日 15分・毎日0時に回復');
    expect(limitSummary(pinMode())).toBe('1回 15分・PINで解除');
    expect(limitSummary({ enabled: true, limitMinutes: 30 })).toBe('1回 30分・PINで解除');
  });

  it('例1：同じ 日に 何回 ひらいても 合計で 数える（5分＋7分＋3分で ロック）。再起動・プロフィールを かえても もどらない', () => {
    let s = afterSave(daily(), at(10, 30, 9, 0));
    expect(s.day).toBe('2026-10-30');
    let r = runClock(daily(), s, at(10, 30, 10, 0), 5 * min);
    expect(remainingMs(daily(), r.state)).toBe(10 * min);
    // アプリを とじて 開きなおす（保存から よむ）
    s = normalizePlaytime(JSON.parse(JSON.stringify(r.state)));
    r = runClock(daily(), s, at(10, 30, 15, 0), 7 * min);
    expect(remainingMs(daily(), r.state)).toBe(3 * min);
    // プロフィール選択画面でも 数える（遊びはじめた あと）
    s = normalizePlaytime(JSON.parse(JSON.stringify(r.state)));
    r = runClock(daily(), s, at(10, 30, 18, 0), 30_000, { visible: true, path: '/' });
    r = runClock(daily(), r.state, r.end, 3 * min);
    expect(r.lock).toBe(true);
    expect(r.state.phase).toBe('locked');
    expect(r.resets).toBe(0);
    // 同じ 日の うちは 何回 開いても ロックの まま
    const saved = normalizePlaytime(JSON.parse(JSON.stringify(r.state)));
    for (const t of [at(10, 30, 18, 10), at(10, 30, 21, 0), at(10, 30, 23, 59, 59)]) {
      expect(isLockedNow(daily(), saved, t)).toBe(true);
      expect(rollDay(daily(), saved, localDay(t)).reset).toBe(false);
      expect(tickPlaytime(daily(), saved, 1000, play, t).state).toEqual(saved);
    }
  });

  it('例2・3：23:59 に ロック → 0:00 に 自動で とける（ロック画面の まま でも）。0:00 から 次に 遊ぶまで 数えない', () => {
    // 23:44:01 から 15分 遊ぶ → 23:59:01 で ロック
    const r = runClock(daily(), afterSave(daily(), at(10, 30, 23, 0)), at(10, 30, 23, 44), 15 * min);
    expect(r.state.phase).toBe('locked');
    // 23:59 台は ロック（ロック画面で 1秒ごとに たしかめても とけない）
    const lockedTick = runClock(daily(), r.state, at(10, 30, 23, 59, 0), 59_000, home);
    expect(lockedTick.state.phase).toBe('locked');
    expect(lockedTick.resets).toBe(0);
    expect(isLockedNow(daily(), lockedTick.state, at(10, 30, 23, 59, 59))).toBe(true);
    // 0:00 → 新しい 日の 枠（PIN なし）
    const t0 = tickPlaytime(daily(), lockedTick.state, 1000, home, at(10, 31, 0, 0, 0));
    expect(t0.reset).toBe(true);
    expect(t0.state).toEqual({ usedMs: 0, phase: 'waiting', warned: false, day: '2026-10-31' });
    // ロック画面の うしろが ゲームの 画面でも、とけた 瞬間からは 数えない
    const onGame = tickPlaytime(daily(), lockedTick.state, 1000, play, at(10, 31, 0, 0, 0));
    expect(onGame.state).toEqual({ usedMs: 0, phase: 'waiting', warned: false, day: '2026-10-31' });
    // 保存が まだ 古くても、0:00 を すぎたら ロックと しない（古い ロック画面を 出さない）
    expect(isLockedNow(daily(), lockedTick.state, at(10, 31, 0, 0, 0))).toBe(false);
    // ホームに いる 間は 数えない。0:01 に 遊びはじめたら そこから
    let n = runClock(daily(), t0.state, at(10, 31, 0, 0, 0), 60_000, home);
    expect(n.state.usedMs).toBe(0);
    n = runClock(daily(), n.state, at(10, 31, 0, 1), 2 * min);
    expect(n.state.usedMs).toBe(2 * min);
    expect(n.resets).toBe(0); // 二重に もどさない
  });

  it('例4：23:58 から 遊んで いて 0:00 を むかえる → 前の 日の 時間を もちこさず、新しい 日の 枠で そのまま 数える', () => {
    // その 日は もう 13分 つかって いる（23:58 から 2分で ちょうど 15分）
    let s: PlaytimeState = { usedMs: 13 * min, phase: 'running', warned: true, day: '2026-10-30' };
    // 23:58:00 → 23:59:58 まで（1分58秒）
    let r = runClock(daily(), s, at(10, 30, 23, 58), 118_000);
    expect(r.state.usedMs).toBe(13 * min + 118_000);
    expect(r.state.phase).toBe('running');
    // 23:59:58 → 0:00:02 を 1回の 4秒の 更新で（タイマーが 間引かれた）：0時より 前の 2秒は 新しい 日に 足さない
    s = r.state;
    const cross = tickPlaytime(daily(), s, 4000, play, at(10, 31, 0, 0, 2));
    expect(cross.reset).toBe(true);
    expect(cross.lock).toBe(false);
    expect(cross.state).toEqual({ usedMs: 2000, phase: 'running', warned: false, day: '2026-10-31' });
    // そのまま 遊びつづけると 新しい 日の 15分で 数える（5分前の 案内も もういちど 出る）
    r = runClock(daily(), cross.state, at(10, 31, 0, 0, 2), 15 * min);
    expect(r.warns).toBe(1);
    expect(r.lock).toBe(true);
    expect(r.resets).toBe(0);
  });

  it('例5：数日 あいても 1日ぶん だけ（のこりを ためない）。あさ・数日後に 開くと 15分から', () => {
    const locked: PlaytimeState = { usedMs: 15 * min, phase: 'locked', warned: true, day: '2026-10-30' };
    for (const t of [at(10, 31, 7, 30), at(11, 2, 9, 0), at(12, 25, 0, 1)]) {
      const r = rollDay(daily(), locked, localDay(t));
      expect(r.reset).toBe(true);
      expect(remainingMs(daily(), r.state)).toBe(15 * min);
      expect(r.state.day).toBe(localDay(t));
    }
    // 前の 日に つかわなかった ぶんも ためない
    const unused: PlaytimeState = { usedMs: 1 * min, phase: 'running', warned: false, day: '2026-10-28' };
    expect(remainingMs(daily(), rollDay(daily(), unused, '2026-11-02').state)).toBe(15 * min);
  });

  it('端末の 時計を 過去に もどしても、同じ 日の 枠は 復活しない', () => {
    const locked: PlaytimeState = { usedMs: 15 * min, phase: 'locked', warned: true, day: '2026-10-31' };
    for (const t of [at(10, 30, 23, 59), at(10, 30, 12, 0), at(10, 1, 9, 0)]) {
      expect(rollDay(daily(), locked, localDay(t)).reset).toBe(false);
      expect(isLockedNow(daily(), locked, t)).toBe(true);
      expect(tickPlaytime(daily(), locked, 1000, play, t).state).toEqual(locked);
    }
    // 時計を もどした あとに PIN で 追加しても、日付は さがらない
    expect(afterUnlock(daily(), locked, at(10, 30, 12, 0)).day).toBe('2026-10-31');
  });

  it('保護者の PIN で 今日の 追加の 1枠（日付は そのまま）→ 次の 日は ふつうの 15分に もどる', () => {
    const locked: PlaytimeState = { usedMs: 15 * min, phase: 'locked', warned: true, day: '2026-10-30' };
    const extra = afterUnlock(daily(), locked, at(10, 30, 19, 0));
    expect(extra).toEqual({ usedMs: 0, phase: 'waiting', warned: false, day: '2026-10-30' });
    expect(remainingMs(daily(), extra)).toBe(15 * min);
    // 追加の 15分も 使いきると また ロック
    const r = runClock(daily(), extra, at(10, 30, 19, 0), 15 * min);
    expect(r.state.phase).toBe('locked');
    // 次の 日は 追加ぶんを もちこさず ふつうの 15分
    const next = rollDay(daily(), { ...r.state, usedMs: 3 * min, phase: 'running' }, '2026-10-31');
    expect(remainingMs(daily(), next.state)).toBe(15 * min);
  });

  it('バックグラウンド（非表示）の 間は 数えない。日付が 変わる 間 かくれて いても 前の 日の 時間を もちこさない', () => {
    let r = runClock(daily(), afterSave(daily(), at(10, 30, 20, 0)), at(10, 30, 20, 0), 5 * min);
    r = runClock(daily(), r.state, r.end, 60 * min, { visible: false, path: '/play/sudoku' });
    expect(r.state.usedMs).toBe(5 * min);
    // 23:00 に かくれて 翌朝 7:00 に もどる（もどった 直後の 差は 0 で 数える：ParentalContext と 同じ）
    const back = tickPlaytime(daily(), { ...r.state, day: '2026-10-30' }, 0, play, at(10, 31, 7, 0));
    expect(back.reset).toBe(true);
    expect(back.state.usedMs).toBe(0);
    // 万一 大きな 差が きても 1回で 数えるのは 0時から の ぶん・60秒まで
    const big = tickPlaytime(daily(), { ...r.state, day: '2026-10-30' }, 8 * 3600_000, play, at(10, 31, 0, 0, 10));
    expect(big.state.usedMs).toBe(10_000);
  });

  it('PIN 方式（従来）：日付が 変わっても とけない。PIN で 解除すると 設定の 時間から（日付は もたない）', () => {
    const locked: PlaytimeState = { usedMs: 15 * min, phase: 'locked', warned: true };
    for (const t of [at(10, 31, 0, 0), at(11, 2, 9, 0)]) {
      expect(isLockedNow(pinMode(), locked, t)).toBe(true);
      const r = tickPlaytime(pinMode(), locked, 1000, play, t);
      expect(r.reset).toBe(false);
      expect(r.state).toEqual(locked);
    }
    // 前の 版の 保存（日付 あり でも なし でも）でも とけない
    expect(isLockedNow({ enabled: true, limitMinutes: 15 }, { ...locked, day: '2020-01-01' }, at(10, 31, 0, 0))).toBe(true);
    expect(afterUnlock(pinMode(), locked, at(10, 31, 0, 0))).toEqual(initialPlaytime());
    expect(afterUnlock()).toEqual(initialPlaytime());
    expect(afterSave(pinMode(), at(10, 31, 0, 0))).toEqual(initialPlaytime());
  });

  it('方式を 切りかえた 直後（日付 なし）は 今日の 枠として 日付だけ つける。制限なしでは 何も しない', () => {
    const s: PlaytimeState = { usedMs: 4 * min, phase: 'running', warned: false };
    const r = rollDay(daily(), s, '2026-10-30');
    expect(r).toEqual({ state: { ...s, day: '2026-10-30' }, reset: false });
    const off: LimitConfig = { enabled: false, limitMinutes: 15, mode: 'daily' };
    expect(rollDay(off, { ...s, day: '2026-10-01' }, '2026-10-30').reset).toBe(false);
    expect(isLockedNow(off, { ...s, phase: 'locked' }, at(10, 30, 12, 0))).toBe(false);
  });

  it('同じ 日付で 何回 よんでも 同じ（別の タブと 同時でも 二重に もどさない）', () => {
    const s: PlaytimeState = { usedMs: 15 * min, phase: 'locked', warned: true, day: '2026-10-30' };
    const once = rollDay(daily(), s, '2026-10-31');
    // 片方の タブが もどして 保存 → もう片方は その 保存を よみなおして 同じ 処理（変わらない）
    const twice = rollDay(daily(), once.state, '2026-10-31');
    expect(twice.reset).toBe(false);
    expect(twice.state).toBe(once.state);
    // もどした あと 遊んだ 時間は 消えない
    const played = { ...once.state, usedMs: 3 * min, phase: 'running' as const };
    expect(rollDay(daily(), played, '2026-10-31').state).toBe(played);
  });
});
