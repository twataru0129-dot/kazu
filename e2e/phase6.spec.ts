import { expect, test, type Page } from '@playwright/test';
import { createProfile } from './helpers';
import { judgeGuess } from '../src/domain/games/numberDetective';

/** 第6弾：31 すうじたんてい。iPhone 相当〜PC で 実際の 操作で（ひみつは 保存された 途中の ゲームから よむ） */

const SIZES = [
  { name: '320×568', width: 320, height: 568, mobile: true },
  { name: '375×667', width: 375, height: 667, mobile: true },
  { name: '390×844', width: 390, height: 844, mobile: true },
  { name: '430×932', width: 430, height: 932, mobile: true },
  { name: '768×1024', width: 768, height: 1024, mobile: true },
  { name: '1280×800', width: 1280, height: 800, mobile: false },
];

function readStore<T>(page: Page, store: string): Promise<T[]> {
  return page.evaluate(
    (name) =>
      new Promise<T[]>((resolve, reject) => {
        const open = indexedDB.open('kazu-asobi');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const req = open.result.transaction(name).objectStore(name).getAll();
          req.onsuccess = () => resolve(req.result as T[]);
          req.onerror = () => reject(req.error);
        };
      }),
    store,
  );
}

/** いま あそんで いる ゲームの ひみつ（いちばん あたらしい 途中保存） */
async function currentSecret(page: Page, not?: string): Promise<string> {
  let secret = '';
  await expect
    .poll(async () => {
      const all = await readStore<{ gameId?: string; status: string; createdAt: string; activeDraft?: { state?: { secret: string } } }>(page, 'sessions');
      secret =
        all
          .filter((x) => x.gameId === 'number-detective' && x.status === 'inProgress' && x.activeDraft?.state)
          .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
          .at(-1)?.activeDraft?.state?.secret ?? '';
      return secret !== '' && secret !== not;
    })
    .toBe(true);
  return secret;
}

async function noOverflow(page: Page, where: string) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), `${where} overflow`).toBeLessThanOrEqual(0);
}

const WRONG = ['012', '345', '678', '901', '234', '567', '890', '123', '456', '789', '102', '304', '506'];
const wrongFor = (secret: string, n: number) => WRONG.filter((g) => g !== secret).slice(0, n);

async function tap(page: Page, g: string) {
  const pad = page.getByRole('group', { name: 'すうじボタン' });
  for (const d of g) await pad.getByRole('button', { name: d, exact: true }).click();
  await page.getByRole('button', { name: 'この すうじで しつもん！' }).click();
}

for (const size of SIZES) {
  test.describe(size.name, () => {
    test.use({ viewport: { width: size.width, height: size.height }, isMobile: size.mobile, hasTouch: size.mobile });

    test('31 すうじたんてい：むずかしさ なしで はじめ、あそびかたを 見て、しつもんして、リロード後も つづきから クリア', async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(String(e)));
      await page.goto('/');
      await createProfile(page, 'たんてい');
      await page.goto('/#/play');
      // 一覧に 31 が ある
      await expect(page.getByRole('link', { name: /すうじたんてい/ }).or(page.getByRole('button', { name: /すうじたんてい/ })).first()).toBeVisible();
      await page.goto('/#/play/number-detective');
      await expect(page.getByRole('button', { name: 'すぐに あそぶ' })).toBeVisible();
      await expect(page.getByRole('radiogroup', { name: 'むずかしさ' })).toHaveCount(0);
      await expect(page.getByTestId('detective-howto')).toHaveCount(0);
      await noOverflow(page, 'intro');

      // あそびかた（えらんだ 人だけ）→ ゲームを はじめる
      await page.getByRole('button', { name: 'あそびかたを みる' }).click();
      await expect(page.getByTestId('detective-howto')).toContainText('「ぴったり」は すうじも ばしょも あっている！');
      await expect(page.getByTestId('detective-howto')).toContainText('「ばしょちがい」は すうじは あっているけど、ばしょが ちがう！');
      await noOverflow(page, 'howto');
      await page.getByRole('button', { name: 'ゲームを はじめる' }).click();
      const pad = page.getByRole('group', { name: 'すうじボタン' });
      await expect(pad).toBeVisible();
      await expect(page.getByRole('button', { name: /ヒント/ })).toHaveCount(0);
      await expect(page.getByTestId('detective-left')).toContainText('10');
      // すうじボタン・しつもん ボタンが 画面の 中（ホームバーの 上）に ある
      for (const name of ['1', '0']) await expect(pad.getByRole('button', { name, exact: true })).toBeInViewport({ ratio: 1 });
      await expect(page.getByRole('button', { name: 'この すうじで しつもん！' })).toBeInViewport({ ratio: 1 });
      await noOverflow(page, 'play');

      const secret = await currentSecret(page);
      const wrong = wrongFor(secret, 3);
      await tap(page, wrong[0]);
      const r0 = judgeGuess(secret, wrong[0]);
      await expect(page.getByTestId('detective-message')).toHaveText(`ぴったり ${r0.eat}！ ばしょちがい ${r0.bite}！`);
      await expect(page.getByTestId('detective-row')).toHaveCount(1);
      await expect(page.getByTestId('detective-left')).toContainText('9');
      // まえと おなじ ならびは 回数を へらさない
      await tap(page, wrong[0]);
      await expect(page.getByTestId('detective-message')).toHaveText('この ならびは もう しつもんしたよ');
      await expect(page.getByTestId('detective-left')).toContainText('9');
      await page.getByRole('button', { name: 'ぜんぶ けす' }).click();
      // キーボード（PC）・ボタン（スマホ）
      if (!size.mobile) {
        await page.locator('body').click({ position: { x: 5, y: 5 } });
        for (const d of wrong[1]) await page.keyboard.press(d);
        await page.keyboard.press('Backspace');
        await page.keyboard.press(wrong[1][2]);
        await page.locator('body').click({ position: { x: 5, y: 5 } });
        await page.keyboard.press('Enter');
      } else await tap(page, wrong[1]);
      await expect(page.getByTestId('detective-row')).toHaveCount(2);
      // ？ あそびかた を ひらいて とじても かわらない
      await pad.getByRole('button', { name: wrong[2][0], exact: true }).click();
      await page.getByRole('button', { name: '？ あそびかた' }).click();
      await expect(page.getByRole('dialog', { name: 'あそびかた' })).toBeVisible();
      await page.getByRole('button', { name: 'とじる' }).click();
      await expect(page.getByTestId('detective-slot-0')).toHaveText(wrong[2][0]);
      await expect(page.getByTestId('detective-left')).toContainText('8');
      // ひみつは 画面に 出て いない
      // （見える 文字と 読みあげの ラベルだけを 見る。HTML の 色の 指定などの 数字とは まぎれない ように）
      const shown = await page.locator('main').evaluate((root) => {
        const out: string[] = [(root as HTMLElement).innerText];
        const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        for (let n = tw.nextNode(); n; n = tw.nextNode()) out.push(n.textContent ?? '');
        root.querySelectorAll('[aria-label], [title], [alt]').forEach((el) => out.push(el.getAttribute('aria-label') ?? '', el.getAttribute('title') ?? '', el.getAttribute('alt') ?? ''));
        return out;
      });
      expect(shown.filter((t) => t.includes(secret) || t.includes(secret.split('').join(' ')))).toEqual([]);

      // リロード → つづきから：同じ ひみつ・履歴・入力中・回数
      await page.waitForTimeout(500);
      await page.reload();
      await page.goto('/#/play');
      await page.goto('/#/play/number-detective');
      await page.getByRole('button', { name: 'つづきから' }).click();
      await expect(page.getByTestId('detective-row')).toHaveCount(2);
      await expect(page.getByTestId('detective-left')).toContainText('8');
      await expect(page.getByTestId('detective-slot-0')).toHaveText(wrong[2][0]);
      expect(await currentSecret(page)).toBe(secret);
      await page.getByRole('button', { name: 'ぜんぶ けす' }).click();
      await tap(page, secret);
      await expect(page.getByTestId('detective-result')).toContainText('せいかい！');
      await expect(page.getByTestId('detective-result')).toContainText('3かいで あてたよ！');
      await expect(page.getByTestId('detective-secret')).toHaveText(secret);
      await expect(page.getByRole('button', { name: 'もういちど あそぶ' })).toBeInViewport({ ratio: 1 });
      await expect(page.getByRole('button', { name: 'ゲーム いちらんへ' })).toBeInViewport({ ratio: 1 });
      await noOverflow(page, 'cleared');
      await expect
        .poll(async () => (await readStore<{ gameId?: string; finalCorrect?: boolean }>(page, 'attempts')).filter((a) => a.gameId === 'number-detective').map((a) => a.finalCorrect))
        .toEqual([true]);
      expect(errors).toEqual([]);
    });

    test('31 すうじたんてい：10かい まちがえると おしまい。10けんの 履歴が 見られ、もういちど あそぶ で つぎの ひみつ', async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(String(e)));
      await page.goto('/');
      await createProfile(page, 'ざんねん');
      await page.goto('/#/play');
      await page.goto('/#/play/number-detective');
      await page.getByRole('button', { name: 'すぐに あそぶ' }).click();
      const secret = await currentSecret(page);
      for (const g of wrongFor(secret, 10)) await tap(page, g);
      await expect(page.getByTestId('detective-result')).toContainText('おしかったね！');
      await expect(page.getByTestId('detective-result')).toContainText(`こたえは ${secret} だったよ！`);
      await expect(page.getByTestId('detective-row')).toHaveCount(10);
      await expect(page.getByTestId('detective-left')).toContainText('0');
      await expect(page.getByRole('button', { name: 'この すうじで しつもん！' })).toHaveCount(0);
      // さいごの 履歴が 見えて、さいしょの 履歴も スクロールで 見られる
      const list = page.getByTestId('detective-history');
      await page.getByTestId('detective-row').last().scrollIntoViewIfNeeded();
      await expect(page.getByTestId('detective-row').last()).toBeInViewport();
      await page.getByTestId('detective-row').first().scrollIntoViewIfNeeded();
      await expect(page.getByTestId('detective-row').first()).toBeInViewport();
      await expect(list).toBeVisible();
      await noOverflow(page, 'over');
      await expect
        .poll(async () => (await readStore<{ gameId?: string; finalCorrect?: boolean; skipped?: boolean }>(page, 'attempts')).filter((a) => a.gameId === 'number-detective').map((a) => [a.finalCorrect, a.skipped ?? null]))
        .toEqual([[false, null]]);
      await page.getByRole('button', { name: 'もういちど あそぶ' }).click();
      await expect(page.getByTestId('detective-left')).toContainText('10');
      await expect(page.getByTestId('detective-row')).toHaveCount(0);
      const next = await currentSecret(page, secret);
      expect(next).not.toBe(secret);
      await page.getByRole('button', { name: 'もどる' }).click();
      await page.getByRole('button', { name: 'つづきを けす' }).click();
      await expect(page.getByRole('button', { name: 'つづきから' })).toHaveCount(0);
      expect(errors).toEqual([]);
    });
  });
}
