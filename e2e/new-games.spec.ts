import { expect, test, type Page } from '@playwright/test';
import { createProfile, openParent } from './helpers';

/** ゲーム 17〜19 を、実際の画面操作で さいごまで遊べること */

async function startGame(page: Page, id: string, level = 'かんたん') {
  await page.goto('/#/play');
  await page.goto(`/#/play/${id}`);
  await page.getByRole('radio', { name: new RegExp(level) }).click();
  await page.getByRole('button', { name: 'はじめる' }).click();
  await expect(page.getByRole('button', { name: 'ヒント' })).toBeVisible();
}

/** 「4 + □ = 7」のような しき（かんたん：たしざん・□ は1つ）を解く */
function solveEasy(text: string): number {
  const t = text.replace(/\s/g, '');
  const m = t.match(/^(\d+|□)\+(\d+|□)=(\d+|□)$/);
  if (!m) throw new Error(`cannot parse ${t}`);
  const [a, b, c] = [m[1], m[2], m[3]];
  if (c === '□') return Number(a) + Number(b);
  return Number(c) - Number(a === '□' ? b : a);
}

test('17 むしくい算：5もん とおして遊べて、記録に残る', async ({ page }) => {
  await page.goto('/');
  await createProfile(page, 'むし');
  await page.goto('/#/play');
  await expect(page.getByRole('button', { name: /17\s*むしくい算/ })).toBeVisible();
  await startGame(page, 'missing-number');
  for (let i = 0; i < 5; i++) {
    const eq = page.getByLabel('しき');
    const text = (await eq.innerText()).replace(/\n/g, '');
    const ans = solveEasy(text);
    // まちがえてから なおす（再挑戦は記録に残る）
    if (i === 0) {
      await page.keyboard.type(String(ans === 0 ? 1 : ans - 1 || ans + 1));
      await page.keyboard.press('Enter');
      await expect(page.getByText(/ならないね|おしい/)).toBeVisible();
      await page.getByRole('button', { name: 'ぜんぶ けす' }).click();
      await page.waitForTimeout(350); // 二重送信ふせぎの間
    }
    await page.keyboard.type(String(ans));
    await page.keyboard.press('Enter');
    await expect(page.getByText('せいかい！')).toBeVisible();
    await page.waitForTimeout(650); // 正解直後の連打ふせぎ
    await page.getByRole('button', { name: i === 4 ? 'おわり →' : 'つぎへ →' }).click();
  }
  await expect(page.getByText('5もん おわったよ！')).toBeVisible();
  await expect(page.getByText('せいかい 5もん')).toBeVisible();
  await openParent(page);
  const row = page.locator('tr').filter({ hasText: '17 むしくい算' });
  await expect(row).toBeVisible();
  await expect(row.locator('td').nth(1)).toHaveText('5');
});

test('18 さんかくもよう：みほんを まねて できる。途中で とじても つづきから', async ({ page }) => {
  await page.goto('/');
  await createProfile(page, 'さんかく');
  await startGame(page, 'triangle-pattern', 'ふつう');
  const states = await page.locator('[role="img"][aria-label^="みほん"] [data-state]').evaluateAll((els) => els.map((e) => Number(e.getAttribute('data-state'))));
  expect(states).toHaveLength(9);
  const cells = page.getByRole('gridcell');
  // 1マスめだけ すすめて、リロード → つづきから
  for (let k = 0; k < states[0]; k++) await cells.nth(0).click();
  await page.waitForTimeout(500); // 途中保存（少し待ってから書く）
  await page.reload();
  await page.goto('/#/play');
  await page.goto('/#/play/triangle-pattern');
  await page.getByRole('button', { name: 'つづきから' }).click();
  const after = await page.locator('[role="img"][aria-label^="みほん"] [data-state]').evaluateAll((els) => els.map((e) => Number(e.getAttribute('data-state'))));
  expect(after).toEqual(states); // 同じ もんだい
  for (let i = 1; i < 9; i++) for (let k = 0; k < states[i]; k++) await cells.nth(i).click();
  await page.getByRole('button', { name: 'こたえあわせ' }).click();
  await expect(page.getByText('せいかい！')).toBeVisible();
  await page.waitForTimeout(650);
  await page.getByRole('button', { name: 'おわり →' }).click();
  await expect(page.getByText('できたね！')).toBeVisible();
});

test('19 てんつなぎ：みほんの せんを ひいて できる（ひく順番は 自由）', async ({ page }) => {
  await page.goto('/');
  await createProfile(page, 'てん');
  await startGame(page, 'dot-connect', 'むずかしい');
  const segs = await page.locator('[data-testid="dots-sample"] [data-seg]').evaluateAll((els) => els.map((e) => e.getAttribute('data-seg')!.split(',').map(Number)));
  expect(segs.length).toBeGreaterThan(0);
  const point = (x: number, y: number) => page.getByRole('button', { name: new RegExp(`^うえから ${y + 1}ばんめ ひだりから ${x + 1}ばんめの てん`) });
  for (const [x1, y1, x2, y2] of [...segs].reverse()) {
    await point(x2, y2).click();
    await point(x1, y1).click();
    await point(x1, y1).click(); // えらぶのを やめる
  }
  // よけいな せんを 1本 ひくと まちがい。「もどす」で けして もういちど
  const have = new Set(segs.map((s) => s.join(',')));
  const extra = [0, 1, 2, 3].flatMap((x) => [0, 1, 2, 3, 4].map((y) => [x, y, x + 1, y])).find((s) => !have.has(s.join(',')))!;
  await point(extra[0], extra[1]).click();
  await point(extra[2], extra[3]).click();
  await page.getByRole('button', { name: 'こたえあわせ' }).click();
  await expect(page.getByText(/よけいな せんが 1ほん/).first()).toBeVisible();
  await page.getByRole('button', { name: 'もどす' }).click();
  await page.getByRole('button', { name: 'こたえあわせ' }).click();
  await expect(page.getByText('せいかい！')).toBeVisible();
  await page.waitForTimeout(650);
  await page.getByRole('button', { name: 'おわり →' }).click();
  await expect(page.getByText('できたね！')).toBeVisible();
});
