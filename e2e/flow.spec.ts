import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { calc, createProfile, openParent } from './helpers';

test('first run → calc 5 → mini game → test 5 → history → JSON export', async ({ page }) => {
  await page.goto('/');
  await createProfile(page, 'たろう');

  // 計算 5問（1問目はわざと間違えて、やり直せることを確認）
  await page.getByRole('button', { name: /けいさん/ }).click();
  await page.getByRole('button', { name: 'はじめる' }).click();
  for (let i = 0; i < 5; i++) {
    const expr = (await page.locator('.big-expr').innerText()).replace('=', '');
    const ans = calc(expr);
    if (i === 0) {
      await page.keyboard.type(String(ans + 1));
      await page.keyboard.press('Enter');
      await expect(page.getByText('おしい！', { exact: false })).toBeVisible();
      await page.keyboard.press('Escape');
      await page.waitForTimeout(400);
    }
    await page.keyboard.type(String(ans));
    await page.keyboard.press('Enter');
    await expect(page.getByText('せいかい！')).toBeVisible();
    if (i === 0) {
      await page.getByRole('button', { name: 'ほかの かんがえかたを みる' }).click();
      await expect(page.locator('li.num').first()).toBeVisible();
    }
    await page.waitForTimeout(650);
    await page.getByRole('button', { name: 'つぎへ →' }).click();
  }
  await expect(page.getByText('5もん がんばったね！')).toBeVisible();

  // ミニゲーム：天秤バトル 5問
  await page.goto('/#/play/balance');
  await page.getByRole('button', { name: 'はじめる' }).click();
  for (let i = 0; i < 5; i++) {
    const label = (await page.locator('svg[aria-label^="ひだり"]').getAttribute('aria-label'))!;
    const m = label.match(/ひだり (.+)、みぎ (.+)/)!;
    const l = calc(m[1]);
    const r = calc(m[2]);
    await page.getByRole('button', { name: l > r ? '◀ ひだり' : l < r ? 'みぎ ▶' : '＝ おなじ' }).click();
    await expect(page.getByText('せいかい！')).toBeVisible();
    await page.waitForTimeout(650);
    await page.getByRole('button', { name: /つぎへ|おわり/ }).click();
  }
  await expect(page.getByText('5もん おわったよ！')).toBeVisible();

  // テスト 5問（1問スキップ）
  await page.goto('/#/test');
  await page.getByRole('button', { name: '5もん' }).click();
  await page.getByRole('button', { name: 'この テストを はじめる' }).click();
  for (let i = 0; i < 5; i++) {
    await expect(page.getByRole('heading', { name: `テスト ${i + 1}/5` })).toBeVisible();
    if (i === 4) {
      await page.getByRole('button', { name: 'スキップ' }).click();
      break;
    }
    const expr = (await page.locator('.big-expr').innerText()).replace('=', '');
    await page.keyboard.type(String(calc(expr)));
    await page.getByRole('button', { name: 'けってい' }).click();
  }
  await expect(page.getByText('○ 4 / 5')).toBeVisible();
  await expect(page.getByText('80%（4 ÷ 5）')).toBeVisible();

  // 履歴（おとなのメニュー）
  await openParent(page);
  await expect(page.getByRole('heading', { name: 'テストの履歴' })).toBeVisible();
  await expect(page.locator('table').filter({ hasText: '正答率' }).getByText('4/5')).toBeVisible();
  await expect(page.getByText('天秤バトル')).toBeVisible();

  // JSON エクスポート
  await page.getByRole('tab', { name: 'バックアップ' }).click();
  const dl = page.waitForEvent('download');
  await page.getByRole('button', { name: 'バックアップを ほぞん（JSON）' }).click();
  const file = await (await dl).path();
  const bundle = JSON.parse(readFileSync(file!, 'utf8'));
  expect(bundle.format).toBe('suuji-app-backup');
  expect(bundle.profiles).toHaveLength(1);
  expect(bundle.attempts.filter((a: { mode: string }) => a.mode === 'test')).toHaveLength(5);
  expect(bundle.attempts.filter((a: { mode: string }) => a.mode === 'calculation')).toHaveLength(5);
});

test('profiles A/B with the same name keep separate records; reload keeps data', async ({ page }) => {
  await page.goto('/');
  await createProfile(page, 'ゆう', 'ねこ');
  // A：計算1問
  await page.goto('/#/calc');
  await page.getByRole('button', { name: '5もん' }).click();
  await page.getByRole('button', { name: 'はじめる' }).click();
  const expr = (await page.locator('.big-expr').innerText()).replace('=', '');
  await page.keyboard.type(String(calc(expr)));
  await page.keyboard.press('Enter');
  await expect(page.getByText('せいかい！')).toBeVisible();

  // B：同じ名前で追加
  await page.goto('/#/');
  await page.getByRole('button', { name: 'ついか する' }).click();
  await createProfile(page, 'ゆう', 'パンダ');
  await openParent(page);
  await expect(page.getByText('まだ記録がありません').first()).toBeVisible();

  // リロードしても B のまま・記録は残る。A に切り替えると A の記録だけ
  await page.reload();
  await expect(page.getByRole('tab', { name: 'きろく' }).or(page.getByRole('button', { name: 'ボタンを ながおしして ひらく' }))).toBeVisible();
  await page.goto('/#/home');
  await page.getByRole('button', { name: 'あそぶ ひとを かえる' }).click();
  await page.getByRole('listitem').filter({ hasText: 'ゆう' }).first().click();
  await page.getByRole('button', { name: 'この こで あそぶ' }).click();
  await expect(page.getByRole('navigation', { name: 'モード' })).toBeVisible();
  await expect(page.getByRole('img', { name: 'ねこ' })).toBeVisible();
  await openParent(page);
  const select = page.getByLabel('だれの きろく？');
  const options = await select.locator('option').allTextContents();
  expect(options.filter((o) => o.startsWith('ゆう'))).toHaveLength(2);
  await expect(page.locator('table').filter({ hasText: '1回目で正解' }).locator('tbody tr')).toHaveCount(1);
});

test('sudoku board is saved and can be resumed after reload', async ({ page }) => {
  await page.goto('/');
  await createProfile(page, 'はな');
  await page.goto('/#/play/sudoku');
  await page.getByRole('button', { name: 'はじめる' }).click();
  const empty = page.locator('[role=gridcell][aria-label$="れつめ から"]').first();
  await empty.click();
  await page.getByRole('group', { name: 'すうじ' }).getByRole('button', { name: '3' }).click();
  await page.waitForTimeout(600);
  await page.reload();
  await page.getByRole('button', { name: 'つづきから' }).click();
  await expect(page.locator('[role=gridcell][aria-label$="れつめ 3"]')).toHaveCount(1);
});
