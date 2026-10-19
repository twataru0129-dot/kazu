import { expect, test, type Page } from '@playwright/test';
import { createProfile } from './helpers';

/**
 * 保護者の時間制限・PIN・ロック。時計は Playwright の clock で進める（アプリは時刻の差で数える）。
 */
const PIN = '2580';
const MIN = 60_000;

/** 長押しで おとなのメニューを開く（時計を進めて長押しを完了させる） */
async function holdOpenParent(page: Page) {
  await page.goto('/#/parent');
  const hold = page.getByRole('button', { name: 'ボタンを ながおしして ひらく' });
  const b = (await hold.boundingBox())!;
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await page.clock.runFor(1500);
  await page.mouse.up();
  await expect(page.getByRole('tab', { name: '記録' })).toBeVisible();
}

async function typePin(page: Page, pin: string) {
  for (const d of pin) await page.keyboard.press(d);
  await page.keyboard.press('Enter');
}

/** PIN を入れて おとなのメニューを開く */
async function pinOpenParent(page: Page, pin = PIN) {
  await page.goto('/#/parent');
  await expect(page.getByText('あんしょうばんごう（4けた）を いれてください')).toBeVisible();
  await typePin(page, pin);
  await expect(page.getByRole('tab', { name: '記録' })).toBeVisible();
}

async function setupLimit(page: Page, minutes: number) {
  await holdOpenParent(page);
  await page.getByRole('tab', { name: '設定' }).click();
  // PIN 未設定では制限を有効にできない
  await expect(page.getByRole('radio', { name: '制限する' })).toBeDisabled();
  await page.getByRole('button', { name: '暗証番号を設定' }).click();
  await typePin(page, PIN);
  await typePin(page, '1111'); // 1回目と違う → やりなおし
  await expect(page.getByText('1回目と2回目が違いました')).toBeVisible();
  await typePin(page, PIN);
  await typePin(page, PIN);
  await expect(page.getByText('暗証番号を保存しました')).toBeVisible();
  await page.getByRole('radio', { name: '制限する' }).click();
  await expect(page.getByRole('radio', { name: '30分', exact: true })).toHaveAttribute('aria-checked', 'true'); // 初期は30分
  await page.getByRole('radio', { name: `${minutes}分`, exact: true }).click();
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect(page.getByTestId('time-limit-status')).toContainText(`1回 ${minutes}分`);
}

/** アプリが表示されている時間を ms 進める（30秒ずつ） */
async function playFor(page: Page, ms: number) {
  for (let t = 0; t < ms; t += 30_000) {
    await page.clock.fastForward(Math.min(30_000, ms - t));
    await page.waitForTimeout(40); // 保存（IndexedDB）を待つ
  }
}

/** 案内が出るまで 30秒ずつ進める（出たら止める） */
async function playUntilVisible(page: Page, testId: string, maxMs: number) {
  for (let t = 0; t < maxMs; t += 30_000) {
    if ((await page.getByTestId(testId).count()) > 0) return t;
    await page.clock.fastForward(30_000);
    await page.waitForTimeout(40);
  }
  return maxMs;
}

async function remainingText(page: Page) {
  await pinOpenParent(page);
  await page.getByRole('tab', { name: '設定' }).click();
  const t = await page.getByTestId('time-limit-status').innerText();
  return t;
}

async function readStore(page: Page) {
  return page.evaluate(
    () =>
      new Promise<{ attempts: number; sessions: number; profiles: number }>((resolve) => {
        const open = indexedDB.open('kazu-asobi');
        open.onsuccess = () => {
          const tx = open.result.transaction(['attempts', 'sessions', 'profiles']);
          const out = { attempts: 0, sessions: 0, profiles: 0 };
          tx.objectStore('attempts').count().onsuccess = (e) => (out.attempts = (e.target as IDBRequest).result);
          tx.objectStore('sessions').count().onsuccess = (e) => (out.sessions = (e.target as IDBRequest).result);
          tx.objectStore('profiles').count().onsuccess = (e) => (out.profiles = (e.target as IDBRequest).result);
          tx.oncomplete = () => resolve(out);
        };
      }),
  );
}

test('初期状態は時間制限なし。長押しで おとなのメニューが開き、文字選択メニューが出にくい', async ({ page }) => {
  await page.clock.install();
  await page.goto('/');
  await createProfile(page, 'じゆう');
  await page.goto('/#/play/sudoku');
  await page.getByRole('button', { name: 'はじめる' }).click();
  await playFor(page, 70 * MIN);
  await expect(page.getByTestId('lock-screen')).toHaveCount(0);
  await expect(page.getByRole('grid', { name: 'すうどく' })).toBeVisible();
  // 長押しボタン：このボタンの中だけ 文字選択・コールアウトを止める
  await page.goto('/#/parent');
  const hold = page.getByRole('button', { name: 'ボタンを ながおしして ひらく' });
  const css = await hold.evaluate((el) => {
    const s = getComputedStyle(el);
    return { us: s.userSelect || s.webkitUserSelect, callout: s.getPropertyValue('-webkit-touch-callout') };
  });
  expect(css.us).toBe('none');
  // Chromium は -webkit-touch-callout を持たないので、値があるときだけ確認
  if (css.callout) expect(css.callout).toBe('none');
  // 短く押しただけでは開かない
  const b = (await hold.boundingBox())!;
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await page.clock.runFor(300);
  await page.mouse.up();
  await expect(page.getByRole('tab', { name: '記録' })).toHaveCount(0);
  await holdOpenParent(page);
});

test('30分：待機→遊ぶ→閉じて再開で残り約20分→5分前の案内→ロック→PINで解除', async ({ page }) => {
  await page.clock.install();
  await page.goto('/');
  await createProfile(page, 'たろう');
  await setupLimit(page, 30);

  // 設定画面・ホームにいるだけでは数えない
  await playFor(page, 5 * MIN);
  await page.goto('/#/home');
  await playFor(page, 5 * MIN);
  expect(await remainingText(page)).toContain('次に遊び始めたときから');

  // 計算モードで遊ぶ（記録をつくる）
  await page.goto('/#/play/sudoku');
  await page.getByRole('button', { name: 'はじめる' }).click();
  await page.locator('[role=gridcell][aria-label$="れつめ から"]').first().click();
  await page.getByRole('group', { name: 'すうじ' }).getByRole('button', { name: '3' }).click();
  await playFor(page, 10 * MIN);

  // アプリを閉じて開き直す（リロード）→ 残り約20分。30分に戻らない
  await page.reload();
  const t = await remainingText(page);
  expect(t).toMatch(/残り (19|20)分/);

  // おとなのメニューの間は数えない
  await playFor(page, 10 * MIN);
  expect(await page.getByTestId('time-limit-status').innerText()).toMatch(/残り (19|20)分/);

  // 別のプロフィールに変えても 同じ のこり時間（回避できない）
  await page.goto('/#/');
  await page.getByRole('button', { name: 'ついか する' }).click();
  await createProfile(page, 'じろう', 'パンダ');
  await page.goto('/#/play');
  // 残り約20分 → 約15分あそぶと「あと5ふん」
  const waited = await playUntilVisible(page, 'playtime-notice', 20 * MIN);
  expect(waited).toBeGreaterThanOrEqual(14 * MIN);
  expect(waited).toBeLessThanOrEqual(16 * MIN);
  const notice = page.getByTestId('playtime-notice');
  await expect(notice).toHaveText(/あと 5ふんで おしまいだよ/);
  // 案内は くりかえさない（少し後に消えて、もう出ない）
  await playFor(page, 30_000);
  await expect(notice).toHaveCount(0);
  for (let i = 0; i < 4; i++) {
    await playFor(page, 30_000);
    await expect(notice).toHaveCount(0);
  }

  const before = await readStore(page);
  await playUntilVisible(page, 'lock-screen', 5 * MIN);
  const lock = page.getByTestId('lock-screen');
  await expect(lock).toBeVisible();
  await expect(lock.getByText('おしまいの じかんだよ！')).toBeVisible();
  await expect(lock.getByText('かえしてね 😊')).toBeVisible();

  // URL を変えても・戻っても・おとなのメニューにも 進めない
  for (const p of ['/#/play/sudoku', '/#/parent', '/#/home', '/#/test']) {
    await page.goto(p);
    await expect(page.getByTestId('lock-screen')).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'モード' })).toHaveCount(0);
  }
  await page.goBack();
  await expect(page.getByTestId('lock-screen')).toBeVisible();
  // リロードしても ロックのまま（起動直後から）
  await page.reload();
  await expect(page.getByTestId('lock-screen')).toBeVisible();

  // まちがった PIN では解除できない
  await typePin(page, '1234');
  await expect(page.getByText('ばんごうが ちがいます')).toBeVisible();
  await expect(page.getByTestId('lock-screen')).toBeVisible();
  // 正しい PIN で解除 → ホーム
  await typePin(page, PIN);
  await expect(page.getByTestId('lock-screen')).toHaveCount(0);
  await expect(page.getByRole('navigation', { name: 'モード' })).toBeVisible();

  // 解除直後は 数えない（親が持っているだけでは へらない）
  await playFor(page, 10 * MIN);
  expect(await remainingText(page)).toContain('1回 30分（次に遊び始めたときから');

  // 記録・途中の盤面は 残っている
  expect(await readStore(page)).toEqual(before);
  await page.goto('/#/');
  await page.getByRole('listitem').filter({ hasText: 'たろう' }).click();
  await page.getByRole('button', { name: 'この こで あそぶ' }).click();
  await expect(page.getByRole('heading', { name: /たろう/ })).toBeVisible();
  await page.goto('/#/play/sudoku');
  await expect(page.getByRole('button', { name: 'つづきから' })).toBeVisible();
});

test('画面が非表示の間は数えない。もどると つづきから数える', async ({ page }) => {
  await page.clock.install();
  await page.goto('/');
  await createProfile(page, 'かくれる');
  await setupLimit(page, 10);
  await page.goto('/#/play');
  await playFor(page, 3 * MIN);
  const setVisibility = (state: 'hidden' | 'visible') =>
    page.evaluate((s) => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => s });
      document.dispatchEvent(new Event('visibilitychange'));
    }, state);
  await setVisibility('hidden');
  await playFor(page, 30 * MIN);
  await setVisibility('visible');
  await playFor(page, 1 * MIN);
  expect(await remainingText(page)).toMatch(/残り (5|6)分/);
});

test('別のタブでも同じ制限（片方で時間切れ → もう片方もロック）', async ({ page, context }) => {
  await page.clock.install();
  await page.goto('/');
  await createProfile(page, 'ふたつ');
  await setupLimit(page, 5);
  await page.goto('/#/play');
  const other = await context.newPage();
  await other.clock.install();
  // 新しいタブは プロフィール選択から（ここも 数える画面）
  await other.goto('/');
  await expect(other.getByRole('button', { name: 'この こで あそぶ' })).toBeVisible();
  await playFor(page, 6 * MIN);
  await expect(page.getByTestId('lock-screen')).toBeVisible();
  await other.clock.fastForward(2000);
  await expect(other.getByTestId('lock-screen')).toBeVisible({ timeout: 5000 });
});

test('PIN を決めたあとは、おとなのメニューは タップ→PIN。まちがいが続くと待ち時間', async ({ page }) => {
  await page.clock.install();
  await page.goto('/');
  await createProfile(page, 'まもる');
  await setupLimit(page, 30);
  await page.goto('/#/home');
  await page.getByRole('button', { name: 'おとなの メニュー' }).click();
  await expect(page.getByText('あんしょうばんごう（4けた）を いれてください')).toBeVisible();
  await expect(page.getByRole('button', { name: 'ボタンを ながおしして ひらく' })).toHaveCount(0);
  for (let i = 0; i < 5; i++) {
    await typePin(page, '0000');
    // 照合（PBKDF2）が終わって入力欄が空にもどるのを待つ
    await expect(page.getByRole('img', { name: /0もじ はいっています/ })).toBeVisible();
    await page.waitForTimeout(150);
  }
  await expect(page.getByText(/まってから いれてください/)).toBeVisible();
  // 待ち時間中は 正しい番号でも入れない
  await expect(page.getByRole('group', { name: 'すうじキー' })).toHaveCount(0);
  // リロードしても待ち時間は消えない（端末に保存）
  await page.reload();
  await expect(page.getByText('あんしょうばんごう（4けた）を いれてください')).toBeVisible();
  await typePin(page, PIN);
  await expect(page.getByText(/まってから いれてください/)).toBeVisible();
  await page.clock.fastForward(31_000);
  // 待ち時間が おわると 数字キーが もどる（キーボード入力も そこで受け付けはじめる）。
  // 決まった時間（以前は 100ms）だけ待つと、遅い CI では キーが もどる前に 打ってしまうので、表示を待つ
  await expect(page.getByText(/まってから いれてください/)).toHaveCount(0);
  await expect(page.getByText('もう いれられます。あんしょうばんごうを いれてください。')).toBeVisible();
  await expect(page.getByRole('group', { name: 'すうじキー' })).toBeVisible();
  await typePin(page, PIN);
  await expect(page.getByRole('tab', { name: '記録' })).toBeVisible();
});

for (const vp of [
  { width: 320, height: 480 },
  { width: 820, height: 1180 },
  { width: 1280, height: 800 },
]) test(`ロック画面の PIN 入力が押せる（${vp.width}×${vp.height}）`, async ({ page }) => {
  await page.setViewportSize(vp);
  await page.clock.install();
  await page.goto('/');
  await createProfile(page, 'ちいさい');
  await setupLimit(page, 5);
  await page.goto('/#/play');
  await playFor(page, 6 * MIN);
  await expect(page.getByTestId('lock-screen')).toBeVisible();
  const submit = page.getByRole('button', { name: 'かいじょ' });
  await submit.scrollIntoViewIfNeeded();
  await expect(submit).toBeInViewport({ ratio: 1 });
  for (const d of PIN) await page.getByRole('button', { name: d, exact: true }).click();
  await submit.click();
  await expect(page.getByTestId('lock-screen')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
});
