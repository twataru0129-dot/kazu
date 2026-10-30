import { expect, test, type Page } from '@playwright/test';
import { createProfile } from './helpers';

/**
 * v1.8：時間制限の「毎日自動回復」。時計は Playwright の clock で うごかし、端末の タイムゾーンは 日本に する
 * （日付は 端末の 現地日付で きまる。0時を またぐ 境目を 23:58・23:59・0:00・0:01・翌朝・数日後で たしかめる）。
 */
test.use({ timezoneId: 'Asia/Tokyo' });

const PIN = '2580';
const MIN = 60_000;
/** 日本時間の 時刻 */
const jst = (s: string) => new Date(`${s}+09:00`);

async function typePin(page: Page, pin: string) {
  for (const d of pin) await page.keyboard.press(d);
  await page.keyboard.press('Enter');
}

/** 長押しで おとなのメニュー → PIN を きめる */
async function firstParent(page: Page) {
  await page.goto('/#/parent');
  const hold = page.getByRole('button', { name: 'ボタンを ながおしして ひらく' });
  const b = (await hold.boundingBox())!;
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await page.clock.runFor(1500);
  await page.mouse.up();
  await page.getByRole('tab', { name: '設定' }).click();
  await page.getByRole('button', { name: '暗証番号を設定' }).click();
  await typePin(page, PIN);
  await typePin(page, PIN);
  await expect(page.getByText('暗証番号を保存しました')).toBeVisible();
}

async function openSettings(page: Page) {
  await page.goto('/#/parent');
  await expect(page.getByText('あんしょうばんごう（4けた）を いれてください')).toBeVisible();
  await typePin(page, PIN);
  await page.getByRole('tab', { name: '設定' }).click();
}

/** 時間制限を きめて 保存（mode：毎日自動回復 / PINで解除） */
async function saveLimit(page: Page, minutes: number, mode: '毎日自動回復' | 'PINで解除（従来方式）') {
  await page.getByRole('radio', { name: '制限する' }).click();
  await page.getByRole('radio', { name: mode }).click();
  await page.getByRole('radio', { name: `${minutes}分`, exact: true }).click();
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect(page.getByTestId('time-limit-status')).toContainText(mode === '毎日自動回復' ? `1日 ${minutes}分・毎日0時に回復` : `1回 ${minutes}分・PINで解除`);
}

/** アプリが表示されている時間を ms 進める（30秒ずつ） */
async function playFor(page: Page, ms: number) {
  for (let t = 0; t < ms; t += 30_000) {
    await page.clock.fastForward(Math.min(30_000, ms - t));
    await page.waitForTimeout(40);
  }
}

async function playUntilLock(page: Page, maxMs: number) {
  for (let t = 0; t < maxMs; t += 30_000) {
    if ((await page.getByTestId('lock-screen').count()) > 0) return;
    await page.clock.fastForward(30_000);
    await page.waitForTimeout(40);
  }
  await expect(page.getByTestId('lock-screen')).toBeVisible();
}

type Stored = { usedMs: number; phase: string; warned: boolean; day?: string };
function readMeta(page: Page): Promise<{ playtime?: Stored; parental?: { mode?: string; enabled: boolean; limitMinutes: number; pin: unknown } }> {
  return page.evaluate(
    () =>
      new Promise((resolve) => {
        const open = indexedDB.open('kazu-asobi');
        open.onsuccess = () => {
          const out: Record<string, unknown> = {};
          const tx = open.result.transaction('meta');
          const st = tx.objectStore('meta');
          // 保存の キー（key）は のぞいて くらべる
          const strip = (r: Record<string, unknown> | undefined) => {
            if (!r) return r;
            const { key: _k, ...rest } = r;
            return rest;
          };
          st.get('playtime').onsuccess = (e) => (out.playtime = strip((e.target as IDBRequest).result));
          st.get('parental').onsuccess = (e) => (out.parental = strip((e.target as IDBRequest).result));
          tx.oncomplete = () => resolve(out);
        };
      }),
  );
}

function countStores(page: Page) {
  return page.evaluate(
    () =>
      new Promise<Record<string, number>>((resolve) => {
        const open = indexedDB.open('kazu-asobi');
        open.onsuccess = () => {
          const names = ['attempts', 'sessions', 'profiles', 'settings'];
          const tx = open.result.transaction(names);
          const out: Record<string, number> = {};
          for (const n of names) tx.objectStore(n).count().onsuccess = (e) => (out[n] = (e.target as IDBRequest).result);
          tx.oncomplete = () => resolve(out);
        };
      }),
  );
}

/** ロック画面が 一瞬でも 出たら 記録する（ページを ひらく 前に しかける） */
async function watchLock(page: Page) {
  await page.addInitScript(() => {
    (window as unknown as { __lockSeen: number }).__lockSeen = 0;
    new MutationObserver(() => {
      if (document.querySelector('[data-testid="lock-screen"]')) (window as unknown as { __lockSeen: number }).__lockSeen++;
    }).observe(document, { childList: true, subtree: true });
  });
}
const lockSeen = (page: Page) => page.evaluate(() => (window as unknown as { __lockSeen: number }).__lockSeen);

const setVisibility = (page: Page, state: 'hidden' | 'visible') =>
  page.evaluate((s) => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => s });
    document.dispatchEvent(new Event('visibilitychange'));
  }, state);

test('毎日自動回復：同じ日は 合計で数え、再起動・プロフィール変更でも解除されず、23:59 はロック・0:00 に PIN なしで解除してホームへ', async ({ page }) => {
  await page.clock.install({ time: jst('2026-10-30T23:20:00') });
  await page.goto('/');
  await createProfile(page, 'まいにち');
  await firstParent(page);
  // 方式を えらぶと 説明が かわる。保存するまでは 反映しない
  await page.getByRole('radio', { name: '制限する' }).click();
  await expect(page.getByRole('radio', { name: 'PINで解除（従来方式）' })).toHaveAttribute('aria-checked', 'true'); // 初期は 従来方式
  await expect(page.getByTestId('limit-mode-help')).toHaveText('時間を使い切ると、おとなの人が暗証番号で解除するまで遊べません。');
  await page.getByRole('radio', { name: '毎日自動回復' }).click();
  await expect(page.getByTestId('limit-mode-help')).toHaveText('毎日午前0時に、遊べる時間が自動で回復します。');
  await page.getByRole('radio', { name: '15分', exact: true }).click();
  await expect(page.getByTestId('limit-preview')).toHaveText('1日 15分・毎日0時に回復');
  await expect(page.getByTestId('time-limit-status')).toHaveText('現在：時間制限なし');
  expect((await readMeta(page)).parental?.enabled).toBe(false);
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect(page.getByTestId('time-limit-status')).toHaveText('1日 15分・毎日0時に回復（次に遊び始めたときから数えます）');
  expect((await readMeta(page)).parental).toMatchObject({ enabled: true, limitMinutes: 15, mode: 'daily' });
  expect((await readMeta(page)).playtime).toMatchObject({ usedMs: 0, phase: 'waiting', day: '2026-10-30' });

  // 1回目：5分 → とじて 開きなおす
  await page.goto('/#/play/sudoku');
  await page.getByRole('button', { name: 'はじめる' }).click();
  await page.locator('[role=gridcell][aria-label$="れつめ から"]').first().click();
  await page.getByRole('group', { name: 'すうじ' }).getByRole('button', { name: '3' }).click();
  await playFor(page, 5 * MIN);
  await page.reload();
  await openSettings(page);
  await expect(page.getByTestId('time-limit-status')).toHaveText(/1日 15分・毎日0時に回復・今日の残り (9|10)分/);
  // 2回目：べつの プロフィールで 7分（残りは 共通）
  await page.goto('/#/');
  await page.getByRole('button', { name: 'ついか する' }).click();
  await createProfile(page, 'きょうだい', 'パンダ');
  await page.goto('/#/play');
  await playFor(page, 7 * MIN);
  await openSettings(page);
  await expect(page.getByTestId('time-limit-status')).toHaveText(/今日の残り (2|3)分/);
  // 3回目：のこりを つかうと ロック（あしたの 案内つき）
  const before = await countStores(page);
  await page.goto('/#/play');
  await playUntilLock(page, 4 * MIN);
  await expect(page.getByTestId('lock-daily')).toHaveText(/あしたに なったら また あそべるよ/);
  await expect(page.getByText('暗証番号を入れると、今日だけ 15分 追加で遊べます。')).toBeVisible();
  // 同じ 日は 再起動しても・プロフィールを かえようとしても ロックの まま
  await page.reload();
  await expect(page.getByTestId('lock-screen')).toBeVisible();
  for (const p of ['/#/', '/#/play/sudoku', '/#/parent']) {
    await page.goto(p);
    await expect(page.getByTestId('lock-screen')).toBeVisible();
  }
  // 23:58 → 23:59：まだ ロック
  await page.clock.fastForward(jst('2026-10-30T23:58:00').getTime() - (await page.evaluate(() => Date.now())));
  await page.waitForTimeout(100);
  await expect(page.getByTestId('lock-screen')).toBeVisible();
  await page.clock.fastForward(jst('2026-10-30T23:59:58').getTime() - (await page.evaluate(() => Date.now())));
  await page.waitForTimeout(100);
  await expect(page.getByTestId('lock-screen')).toBeVisible();
  expect((await readMeta(page)).playtime).toMatchObject({ phase: 'locked', day: '2026-10-30' });
  // 0:00 → リロードなしで 自動で とけて ホームへ（ロック画面の まま 待って いても）
  await page.clock.fastForward(3000);
  await expect(page.getByTestId('lock-screen')).toHaveCount(0);
  await expect(page.getByRole('navigation', { name: 'モード' })).toBeVisible();
  await expect(page).toHaveURL(/#\/home$/);
  expect((await readMeta(page)).playtime).toEqual({ usedMs: 0, phase: 'waiting', warned: false, day: '2026-10-31' });
  // 0:01：ホームに いる だけでは 数えない
  await playFor(page, 60_000);
  expect((await readMeta(page)).playtime?.usedMs).toBe(0);
  // 記録・プロフィール・途中の 盤面は のこる
  expect(await countStores(page)).toEqual(before);
  await openSettings(page);
  await expect(page.getByTestId('time-limit-status')).toHaveText('1日 15分・毎日0時に回復（次に遊び始めたときから数えます）');
});

test('毎日自動回復：23:58 から遊んで 0:00 をまたいでも 盤面はそのまま。前の日の時間を持ち越さず 新しい日の枠で数える', async ({ page }) => {
  await page.clock.install({ time: jst('2026-10-30T23:40:00') });
  await page.goto('/');
  await createProfile(page, 'よふかし');
  await firstParent(page);
  await saveLimit(page, 15, '毎日自動回復');
  await page.goto('/#/play/sudoku');
  await page.getByRole('button', { name: 'はじめる' }).click();
  await page.locator('[role=gridcell][aria-label$="れつめ から"]').first().click();
  await page.getByRole('group', { name: 'すうじ' }).getByRole('button', { name: '4' }).click();
  const grid = page.getByRole('grid', { name: 'すうどく' });
  const board = await grid.innerText();
  // 23:40 すぎから 13分 遊ぶ（のこり 2分）
  await playFor(page, 13 * MIN);
  const used = (await readMeta(page)).playtime!;
  expect(used.day).toBe('2026-10-30');
  expect(used.usedMs).toBeGreaterThanOrEqual(13 * MIN);
  // 23:59:50 へ（時計の 飛びは 1回 60秒まで しか 数えないので、のこり 1分 ほどで 0時を またぐ）→ ロックせず 新しい 日へ
  await page.clock.setSystemTime(jst('2026-10-30T23:59:50'));
  await page.clock.fastForward(1000);
  await page.waitForTimeout(80);
  await playFor(page, 60_000); // 23:59:51 → 0:00:51
  await expect(page.getByTestId('lock-screen')).toHaveCount(0);
  const p = (await readMeta(page)).playtime!;
  expect(p.day).toBe('2026-10-31');
  expect(p.phase).toBe('running');
  // 0時より 前の 時間は 新しい 日に 入らない（0:00 から の 1分 たらず だけ）
  expect(p.usedMs).toBeGreaterThan(0);
  expect(p.usedMs).toBeLessThanOrEqual(60_000);
  expect(p.warned).toBe(false);
  // 盤面は そのまま、画面も ゲームの まま
  await expect(grid).toBeVisible();
  expect(await grid.innerText()).toBe(board);
  await expect(page).toHaveURL(/#\/play\/sudoku/);
  // 0:01 からも そのまま 数える
  await playFor(page, 2 * MIN);
  expect((await readMeta(page)).playtime!.usedMs).toBeGreaterThanOrEqual(2 * MIN);
  // リロードしても 途中の 盤面から
  await page.reload();
  await page.goto('/#/play/sudoku');
  await expect(page.getByRole('button', { name: 'つづきから' })).toBeVisible();
});

test('毎日自動回復：翌朝・数日後に開くと 古いロック画面を一瞬も出さず 15分に回復。非表示の間は数えない', async ({ page, context }) => {
  await page.clock.install({ time: jst('2026-10-30T21:00:00') });
  await page.goto('/');
  await createProfile(page, 'あさ');
  await firstParent(page);
  await saveLimit(page, 15, '毎日自動回復');
  await page.goto('/#/play');
  await playFor(page, 3 * MIN);
  // バックグラウンドに なって いる 間（1時間）は 数えない
  await setVisibility(page, 'hidden');
  await playFor(page, 60 * MIN);
  await setVisibility(page, 'visible');
  await playFor(page, 30_000);
  expect((await readMeta(page)).playtime!.usedMs).toBeLessThanOrEqual(4 * MIN);
  await playUntilLock(page, 13 * MIN);
  await page.close();

  // 翌朝 7:30 に 開く
  const morning = await context.newPage();
  await watchLock(morning);
  await morning.clock.install({ time: jst('2026-10-31T07:30:00') });
  await morning.goto('/');
  await morning.getByRole('button', { name: 'この こで あそぶ' }).click();
  await expect(morning.getByRole('navigation', { name: 'モード' })).toBeVisible();
  await morning.clock.runFor(2000);
  expect(await lockSeen(morning)).toBe(0);
  expect((await readMeta(morning)).playtime).toEqual({ usedMs: 0, phase: 'waiting', warned: false, day: '2026-10-31' });
  // 15分 つかって ロック
  await morning.goto('/#/play');
  await playUntilLock(morning, 16 * MIN);
  expect((await readMeta(morning)).playtime).toMatchObject({ phase: 'locked', day: '2026-10-31' });
  await morning.close();

  // 3日後（11/3 の あさ）に 開く：その 日の 15分 だけ（ためない）
  const later = await context.newPage();
  await watchLock(later);
  await later.clock.install({ time: jst('2026-11-03T08:00:00') });
  await later.goto('/');
  await later.getByRole('button', { name: 'この こで あそぶ' }).click();
  await expect(later.getByRole('navigation', { name: 'モード' })).toBeVisible();
  await later.clock.runFor(2000);
  expect(await lockSeen(later)).toBe(0);
  expect((await readMeta(later)).playtime).toEqual({ usedMs: 0, phase: 'waiting', warned: false, day: '2026-11-03' });
  await openSettings(later);
  await expect(later.getByTestId('time-limit-status')).toHaveText('1日 15分・毎日0時に回復（次に遊び始めたときから数えます）');

  // スリープ（非表示）の まま 日付が かわって 復帰：もどった とき 新しい 日に
  await later.goto('/#/play');
  await playFor(later, 2 * MIN);
  await setVisibility(later, 'hidden');
  await later.clock.fastForward(jst('2026-11-04T06:00:00').getTime() - (await later.evaluate(() => Date.now())));
  await setVisibility(later, 'visible');
  await later.waitForTimeout(100);
  expect((await readMeta(later)).playtime).toMatchObject({ day: '2026-11-04', warned: false });
  expect((await readMeta(later)).playtime!.usedMs).toBeLessThanOrEqual(1000);
});

test('毎日自動回復：時間切れのあと 保護者の PIN で今日だけ追加。追加ぶんも使い切るとロック、翌日は通常の枠', async ({ page }) => {
  await page.clock.install({ time: jst('2026-10-30T18:00:00') });
  await page.goto('/');
  await createProfile(page, 'ついか');
  await firstParent(page);
  await saveLimit(page, 5, '毎日自動回復');
  await page.goto('/#/play');
  await playUntilLock(page, 6 * MIN);
  // 子どもが まちがった 番号では とけない
  await typePin(page, '1234');
  await expect(page.getByText('ばんごうが ちがいます')).toBeVisible();
  await expect(page.getByTestId('lock-screen')).toBeVisible();
  await typePin(page, PIN);
  await expect(page.getByTestId('lock-screen')).toHaveCount(0);
  await expect(page.getByRole('navigation', { name: 'モード' })).toBeVisible();
  expect((await readMeta(page)).playtime).toEqual({ usedMs: 0, phase: 'waiting', warned: false, day: '2026-10-30' });
  await openSettings(page);
  await expect(page.getByTestId('time-limit-status')).toHaveText('1日 5分・毎日0時に回復（次に遊び始めたときから数えます）');
  await page.goto('/#/play');
  await playFor(page, 2 * MIN);
  await openSettings(page);
  await expect(page.getByTestId('time-limit-status')).toHaveText(/今日の残り (2|3)分/);
  await page.goto('/#/play');
  await playUntilLock(page, 4 * MIN);
  // 翌日 0:00:01 に 通常の 5分
  await page.clock.fastForward(jst('2026-10-31T00:00:01').getTime() - (await page.evaluate(() => Date.now())));
  await expect(page.getByTestId('lock-screen')).toHaveCount(0);
  expect((await readMeta(page)).playtime).toEqual({ usedMs: 0, phase: 'waiting', warned: false, day: '2026-10-31' });
});

test('PINで解除（従来方式）：日付が変わっても・数日後でも自動では解除されない。前の版の設定もそのまま PIN で解除', async ({ page, context }) => {
  await page.clock.install({ time: jst('2026-10-30T23:50:00') });
  await page.goto('/');
  await createProfile(page, 'じゅうらい');
  await firstParent(page);
  // v1.7 までの 保存の 形（方式なし）を そのまま 書く：5分・使い切り・ロック
  const pin = (await readMeta(page)).parental!.pin;
  await page.evaluate(
    (pinRec) =>
      new Promise((res) => {
        const o = indexedDB.open('kazu-asobi');
        o.onsuccess = () => {
          const tx = o.result.transaction('meta', 'readwrite');
          tx.objectStore('meta').put({ key: 'parental', enabled: true, limitMinutes: 5, pin: pinRec, failures: 0, retryAt: 0 });
          tx.objectStore('meta').put({ key: 'playtime', usedMs: 5 * 60_000, phase: 'locked', warned: true });
          tx.oncomplete = () => res(null);
        };
      }),
    pin,
  );
  await page.reload();
  await expect(page.getByTestId('lock-screen')).toBeVisible();
  await expect(page.getByTestId('lock-daily')).toHaveCount(0);
  // 23:59 → 0:00 → 0:01：とけない
  for (const t of ['2026-10-30T23:59:00', '2026-10-31T00:00:00', '2026-10-31T00:01:00']) {
    await page.clock.fastForward(jst(t).getTime() - (await page.evaluate(() => Date.now())));
    await page.waitForTimeout(80);
    await expect(page.getByTestId('lock-screen')).toBeVisible();
  }
  await page.close();
  // 数日後に 開いても ロック
  const later = await context.newPage();
  await later.clock.install({ time: jst('2026-11-02T09:00:00') });
  await later.goto('/');
  await expect(later.getByTestId('lock-screen')).toBeVisible();
  // まちがいが つづくと 待ち時間（従来の まま）
  for (let i = 0; i < 5; i++) {
    await typePin(later, '0000');
    await expect(later.getByRole('img', { name: /0もじ はいっています/ })).toBeVisible();
    await later.waitForTimeout(150);
  }
  await expect(later.getByText(/まってから いれてください/)).toBeVisible();
  await later.clock.fastForward(31_000);
  await expect(later.getByText('もう いれられます。あんしょうばんごうを いれてください。')).toBeVisible();
  await typePin(later, PIN);
  await expect(later.getByTestId('lock-screen')).toHaveCount(0);
  expect((await readMeta(later)).playtime).toEqual({ usedMs: 0, phase: 'waiting', warned: false });
  await later.getByRole('button', { name: 'この こで あそぶ' }).click();
  expect((await readMeta(later)).parental).toMatchObject({ enabled: true, limitMinutes: 5 });
  await openSettings(later);
  await expect(later.getByTestId('time-limit-status')).toHaveText('1回 5分・PINで解除（次に遊び始めたときから数えます）');
  await expect(later.getByRole('radio', { name: 'PINで解除（従来方式）' })).toHaveAttribute('aria-checked', 'true');
});

test('設定：毎日自動回復へ切替・15分→30分・従来方式へ戻す・制限なし。保存前は反映しない。PIN は保持', async ({ page }) => {
  await page.clock.install({ time: jst('2026-10-30T10:00:00') });
  await page.goto('/');
  await createProfile(page, 'せってい');
  await firstParent(page);
  await saveLimit(page, 15, 'PINで解除（従来方式）');
  // 方式・時間を えらんだ だけでは 変わらない（保存ボタンだけが 有効に なる）
  await page.getByRole('radio', { name: '毎日自動回復' }).click();
  await page.getByRole('radio', { name: '30分', exact: true }).click();
  await expect(page.getByTestId('time-limit-status')).toHaveText('1回 15分・PINで解除（次に遊び始めたときから数えます）');
  expect((await readMeta(page)).parental).toMatchObject({ mode: 'pin', limitMinutes: 15 });
  await page.reload();
  await openSettings(page);
  await expect(page.getByRole('radio', { name: 'PINで解除（従来方式）' })).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByRole('radio', { name: '15分', exact: true })).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByRole('button', { name: '保存', exact: true })).toBeDisabled();
  // 毎日自動回復 15分 → 30分
  await saveLimit(page, 15, '毎日自動回復');
  await expect(page.getByText('保存しました。1日 15分・毎日0時に回復です。')).toBeVisible();
  await saveLimit(page, 30, '毎日自動回復');
  expect((await readMeta(page)).parental).toMatchObject({ enabled: true, mode: 'daily', limitMinutes: 30 });
  // 従来方式へ もどす
  await saveLimit(page, 30, 'PINで解除（従来方式）');
  expect((await readMeta(page)).parental).toMatchObject({ enabled: true, mode: 'pin', limitMinutes: 30 });
  expect((await readMeta(page)).playtime).toEqual({ usedMs: 0, phase: 'waiting', warned: false });
  // 制限なし
  await saveLimit(page, 15, '毎日自動回復');
  await page.getByRole('radio', { name: '制限なし' }).click();
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect(page.getByTestId('time-limit-status')).toHaveText('現在：時間制限なし');
  // PIN は のこって いる（おとなのメニューは PIN で ひらく・まちがいでは 開かない）
  expect((await readMeta(page)).parental!.pin).toBeTruthy();
  await page.goto('/#/home');
  await page.goto('/#/parent');
  await typePin(page, '1111');
  await expect(page.getByText('ばんごうが ちがいます')).toBeVisible();
  await expect(page.getByRole('img', { name: /0もじ はいっています/ })).toBeVisible();
  await expect(page.getByRole('tab', { name: '記録' })).toHaveCount(0);
  await typePin(page, PIN);
  await expect(page.getByRole('tab', { name: '記録' })).toBeVisible();
});

test('毎日自動回復：2つのタブで時間を共有し、0時の回復は二重にならず 古いロックを書き戻さない', async ({ page, context }) => {
  await page.clock.install({ time: jst('2026-10-30T23:45:00') });
  await page.goto('/');
  await createProfile(page, 'ふたつ');
  await firstParent(page);
  await saveLimit(page, 5, '毎日自動回復');
  await page.goto('/#/play');
  const other = await context.newPage();
  await other.clock.install({ time: jst('2026-10-30T23:45:30') });
  await other.goto('/');
  await expect(other.getByRole('button', { name: 'この こで あそぶ' })).toBeVisible();
  await playUntilLock(page, 6 * MIN);
  await other.clock.fastForward(2000);
  await expect(other.getByTestId('lock-screen')).toBeVisible({ timeout: 5000 });
  // 両方の 時計を 0時 すぎへ
  for (const p of [page, other]) await p.clock.fastForward(jst('2026-10-31T00:00:02').getTime() - (await p.evaluate(() => Date.now())));
  await expect(page.getByTestId('lock-screen')).toHaveCount(0);
  await expect(other.getByTestId('lock-screen')).toHaveCount(0);
  expect((await readMeta(page)).playtime).toEqual({ usedMs: 0, phase: 'waiting', warned: false, day: '2026-10-31' });
  // 片方で 遊んだ 時間を、もう片方が 0 に もどしたり 古い ロックを 書きもどしたり しない
  await page.goto('/#/play');
  await playFor(page, 2 * MIN);
  for (let i = 0; i < 5; i++) {
    await other.clock.fastForward(1000);
    await other.waitForTimeout(40);
  }
  const p = (await readMeta(page)).playtime!;
  expect(p.day).toBe('2026-10-31');
  expect(p.phase).toBe('running');
  expect(p.usedMs).toBeGreaterThanOrEqual(2 * MIN);
  await expect(other.getByTestId('lock-screen')).toHaveCount(0);
});
