import { expect, test, type Page } from '@playwright/test';
import { createProfile, openParent } from './helpers';
import { solveMagic, type MagicPuzzle } from '../src/domain/games/magicSquare';

/** v1.7.1：すうじたんていの 履歴（10かいぶんを 一度に）・長押しで 文字選択しない・魔法陣の 上の むずかしさは ヒントなし */

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
async function draftOf<T>(page: Page, gameId: string, pick: (d: { round?: { puzzle: unknown }; state?: unknown }) => T | undefined): Promise<T> {
  let out: T | undefined;
  await expect
    .poll(async () => {
      const all = await readStore<{ gameId?: string; status: string; createdAt: string; activeDraft?: { round?: { puzzle: unknown }; state?: unknown } }>(page, 'sessions');
      const s = all
        .filter((x) => x.gameId === gameId && x.status === 'inProgress' && x.activeDraft)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
        .at(-1);
      out = s?.activeDraft ? pick(s.activeDraft) : undefined;
      return out !== undefined;
    })
    .toBe(true);
  return out!;
}
async function noOverflow(page: Page, where: string) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), `${where} overflow`).toBeLessThanOrEqual(0);
}
const style = (page: Page, sel: string) =>
  page
    .locator(sel)
    .first()
    .evaluate((el) => {
      const cs = getComputedStyle(el) as CSSStyleDeclaration & { webkitUserSelect?: string; webkitTouchCallout?: string };
      return { select: cs.userSelect || cs.webkitUserSelect, callout: cs.getPropertyValue('-webkit-touch-callout') || cs.webkitTouchCallout || '' };
    });
const selectionText = (page: Page) => page.evaluate(() => window.getSelection()?.toString() ?? '');
/** 指で 長押し（タッチの 開始 → 900ms → 終了） */
async function longPress(page: Page, sel: string) {
  const box = (await page.locator(sel).first().boundingBox())!;
  const cdp = await page.context().newCDPSession(page);
  const p = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [p] });
  await page.waitForTimeout(900);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
}

for (const size of SIZES) {
  test.describe(size.name, () => {
    test.use({ viewport: { width: size.width, height: size.height }, isMobile: size.mobile, hasTouch: size.mobile });

    test('長押し対策：ゲームの 文字・数字・ボタンは 選択できず、入力欄・保護者の 情報は 選べる。スクロール・保護者の 長押しは そのまま', async ({ page }) => {
      await page.goto('/');
      // 名前の 入力欄は ふつうに 入力・選択 できる
      const name = page.getByLabel('なまえ（ニックネーム・12もじ まで）');
      expect((await style(page, 'input')).select).toBe('text');
      await name.fill('ながおし');
      await name.selectText();
      expect(await name.evaluate((el: HTMLInputElement) => el.value.slice(el.selectionStart ?? 0, el.selectionEnd ?? 0))).toBe('ながおし');
      await page.getByRole('button', { name: 'きつね' }).click();
      await page.getByRole('button', { name: 'これで はじめる' }).click();
      await expect(page.getByRole('navigation', { name: 'モード' })).toBeVisible();

      // アプリ全体の 標準：文字選択なし・コピーの メニューなし
      expect((await style(page, 'body')).select).toBe('none');
      // -webkit-touch-callout は iPhone（WebKit）だけの 指定で Chromium では 計算されないので、配った CSS の 中身で たしかめる
      const css = await page.evaluate(async () => {
        const hrefs = [...document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')].map((l) => l.href);
        const texts = await Promise.all(hrefs.map((h) => fetch(h).then((r) => r.text())));
        return texts.join('\n') + [...document.querySelectorAll('style')].map((x) => x.textContent).join('\n');
      });
      const flat = css.replace(/\s+/g, '');
      expect(flat).toMatch(/body\{-webkit-user-select:none;user-select:none;-webkit-touch-callout:none\}/);
      expect(flat).toMatch(/\[data-selectable\]\{-webkit-user-select:text;user-select:text;-webkit-touch-callout:default\}/);
      expect((await style(page, 'h1')).select).toBe('none');
      // ゲーム（ピザ）の 問題文・ボタン
      await page.goto('/#/play');
      await page.goto('/#/play/pizza-fractions');
      await page.getByRole('button', { name: 'はじめる' }).click();
      const q = page.getByTestId('pizza-question');
      await expect(q).toBeVisible();
      expect((await style(page, '[data-testid="pizza-question"]')).select).toBe('none');
      expect((await style(page, '.btn')).select).toBe('none');
      await q.dblclick();
      expect(await selectionText(page)).toBe('');
      if (size.mobile) {
        await longPress(page, '[data-testid="pizza-question"]');
        expect(await selectionText(page)).toBe('');
      }
      // すうじたんていの 履歴・数字
      await page.goto('/#/play');
      await page.goto('/#/play/number-detective');
      await page.getByRole('button', { name: 'すぐに あそぶ' }).click();
      const pad = page.getByRole('group', { name: 'すうじボタン' });
      for (const d of '102') await pad.getByRole('button', { name: d, exact: true }).click();
      await page.getByRole('button', { name: 'この すうじで しつもん！' }).click();
      const row = page.getByTestId('detective-history').locator('li').first();
      expect((await style(page, '[data-testid="detective-history"] li')).select).toBe('none');
      await row.dblclick();
      expect(await selectionText(page)).toBe('');
      if (size.mobile) {
        await longPress(page, '[data-testid="detective-history"] li');
        expect(await selectionText(page)).toBe('');
        // 長押ししても 入力は かわらない（タップと して あつかわない）
        await expect(page.getByTestId('detective-row')).toHaveCount(1);
      }
      // ページ全体で タッチを 止めて いない（スクロール・ドラッグは そのまま）
      expect(await page.evaluate(() => getComputedStyle(document.body).touchAction)).toBe('auto');

      // 保護者：長押しで ひらける。アプリの 版・記録の 表は 選んで コピー できる
      await openParent(page);
      await page.getByRole('tab', { name: '記録' }).click();
      const tableWrap = page.locator('.table-wrap.selectable');
      if (await tableWrap.count()) expect((await style(page, '.table-wrap.selectable')).select).toBe('text');
      await page.getByRole('tab', { name: '保存について' }).click();
      const v = page.getByTestId('app-version');
      await expect(v).toBeVisible();
      expect((await style(page, '[data-testid="app-version"]')).select).toBe('text');
      await v.dblclick();
      expect((await selectionText(page)).length).toBeGreaterThan(0);
    });

    test('すうじたんてい：10かいぶんの 履歴が 2れつ × 5だんで 一度に 見え、ふつうの iPhone 縦画面では スクロール なしで 入力も できる', async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(String(e)));
      await page.goto('/');
      await createProfile(page, 'りれき');
      await page.goto('/#/play');
      await page.goto('/#/play/number-detective');
      await page.getByRole('button', { name: 'すぐに あそぶ' }).click();
      const secret = await draftOf(page, 'number-detective', (d) => (d.state as { secret?: string } | undefined)?.secret);
      const wrong = ['012', '345', '678', '901', '234', '567', '890', '123', '456', '789', '102'].filter((g) => g !== secret);
      const pad = page.getByRole('group', { name: 'すうじボタン' });
      const ask = async (g: string) => {
        for (const d of g) await pad.getByRole('button', { name: d, exact: true }).click();
        await page.getByRole('button', { name: 'この すうじで しつもん！' }).click();
      };
      const cells = page.getByTestId('detective-history').locator('li');
      await expect(cells).toHaveCount(10);
      const fits = size.width >= 375; // 320×568 は 最小限の スクロールを みとめる
      for (let k = 0; k < 9; k++) {
        await ask(wrong[k]);
        await expect(page.getByTestId('detective-row')).toHaveCount(k + 1);
        // 枠は 10この まま（ふえても 位置が ずれない）
        await expect(cells).toHaveCount(10);
      }
      // 1〜5 が 左の れつ、6〜10 が 右の れつ。同じ だんは 同じ 高さ
      const boxes = await cells.evaluateAll((els) =>
        els.map((e) => e.getBoundingClientRect()).map((r) => ({ x: Math.round(r.x), y: Math.round(r.y), r: Math.round(r.right), b: Math.round(r.bottom) })),
      );
      for (let i = 0; i < 5; i++) {
        expect(boxes[i].x).toBe(boxes[0].x);
        expect(boxes[i + 5].x).toBe(boxes[5].x);
        expect(boxes[i + 5].x).toBeGreaterThan(boxes[i].r - 1);
        expect(Math.abs(boxes[i + 5].y - boxes[i].y)).toBeLessThanOrEqual(1);
        if (i > 0) expect(boxes[i].y).toBeGreaterThanOrEqual(boxes[i - 1].b - 1); // かさならない
      }
      // 文字が はみ出して かくれない（ぴったり・ばしょちがい を はぶかない）
      expect(await cells.evaluateAll((els) => els.filter((e) => e.scrollWidth > e.clientWidth + 1).length)).toBe(0);
      const firstRow = page.getByTestId('detective-row').first();
      await expect(firstRow.locator('[data-kind="eat"]')).toContainText('ぴったり');
      await expect(firstRow.locator('[data-kind="bite"]')).toContainText('ばしょちがい');
      // 画面・読みあげに 英語・カタカナの よびかたが のこって いない
      const words = await page.locator('main').evaluate((root) => [(root as HTMLElement).innerText, ...[...root.querySelectorAll('[aria-label]')].map((e) => e.getAttribute('aria-label') ?? '')].join('\n'));
      expect(words).not.toMatch(/EAT|BITE|イート|バイト/);
      await expect(page.getByTestId('detective-row').last()).toHaveAttribute('data-latest', 'true');
      if (fits) {
        // スクロール せずに：ひみつ・のこり・10この 枠・入力欄・すうじボタン・しつもん／けす ボタン
        expect(await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight)).toBeLessThanOrEqual(1);
        for (const loc of [
          page.getByTestId('detective-secret'),
          page.getByTestId('detective-left'),
          cells.first(),
          cells.nth(4),
          cells.nth(9),
          page.getByTestId('detective-slot-0'),
          pad.getByRole('button', { name: '1', exact: true }),
          pad.getByRole('button', { name: '0', exact: true }),
          page.getByRole('button', { name: 'この すうじで しつもん！' }),
          page.getByRole('button', { name: 'ぜんぶ けす' }),
        ])
          await expect(loc).toBeInViewport({ ratio: 1 });
        // 枠の いちばん下が ドックの 上
        const dockTop = (await page.getByTestId('dock').boundingBox())!.y;
        expect(Math.max(...boxes.map((b) => b.b))).toBeLessThanOrEqual(dockTop + 1);
      } else {
        // 小さい 画面：スクロールは 最小限（1画面の 1/4 まで）で、さいしょと さいごの 履歴を 見られる
        expect(await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight)).toBeLessThanOrEqual(size.height / 4);
        await cells.first().scrollIntoViewIfNeeded();
        await expect(cells.first()).toBeInViewport();
        await cells.nth(9).scrollIntoViewIfNeeded();
        await expect(cells.nth(9)).toBeInViewport();
      }
      await noOverflow(page, 'detective 9');
      // 10かいめ（まちがい）→ おしまい。けっかは 上に まとめ、10この 履歴は のこる
      await ask(wrong[9]);
      await expect(page.getByTestId('detective-result')).toContainText('おしかったね！');
      await expect(page.getByTestId('detective-result')).toHaveCount(1);
      await expect(page.getByTestId('detective-row')).toHaveCount(10);
      await expect(page.getByTestId('detective-row').first()).toContainText(wrong[0]);
      for (const name of ['もういちど あそぶ', 'ゲーム いちらんへ']) await expect(page.getByRole('button', { name })).toBeInViewport({ ratio: 1 });
      if (fits) expect(await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight)).toBeLessThanOrEqual(1);
      await noOverflow(page, 'detective over');
      // もういちど → つぎの ゲームで 1かい きいて リロード → つづきから 同じ 場所に
      await page.getByRole('button', { name: 'もういちど あそぶ' }).click();
      await expect(page.getByTestId('detective-row')).toHaveCount(0);
      const s2 = await draftOf(page, 'number-detective', (d) => {
        const x = (d.state as { secret?: string } | undefined)?.secret;
        return x && x !== secret ? x : undefined;
      });
      await ask(['012', '345'].find((g) => g !== s2)!);
      await page.waitForTimeout(500);
      await page.reload();
      await page.goto('/#/play');
      await page.goto('/#/play/number-detective');
      await page.getByRole('button', { name: 'つづきから' }).click();
      await expect(page.getByTestId('detective-row')).toHaveCount(1);
      await expect(page.getByTestId('detective-history').locator('li')).toHaveCount(10);
      expect(errors).toEqual([]);
    });

    test('すうじたんてい：「文字を 大きく」でも 横に はみ出さず、履歴の 文字が きれない（375 いじょうは スクロール なし）', async ({ page }) => {
      await page.goto('/');
      await createProfile(page, 'おおきい');
      await page.evaluate(
        () =>
          new Promise((res) => {
            const o = indexedDB.open('kazu-asobi');
            o.onsuccess = () => {
              const tx = o.result.transaction('settings', 'readwrite');
              const st = tx.objectStore('settings');
              const g = st.getAll();
              g.onsuccess = () => {
                for (const x of g.result) st.put({ ...x, largeText: true });
              };
              tx.oncomplete = () => res(null);
            };
          }),
      );
      await page.reload();
      await expect(page.locator('html')).toHaveAttribute('data-text', 'large');
      await page.goto('/#/play');
      await page.goto('/#/play/number-detective');
      await page.getByRole('button', { name: 'すぐに あそぶ' }).click();
      const secret = await draftOf(page, 'number-detective', (d) => (d.state as { secret?: string } | undefined)?.secret);
      const pad = page.getByRole('group', { name: 'すうじボタン' });
      for (const g of ['012', '345', '678', '901', '234', '567', '890', '123', '456'].filter((x) => x !== secret).slice(0, 9)) {
        for (const d of g) await pad.getByRole('button', { name: d, exact: true }).click();
        await page.getByRole('button', { name: 'この すうじで しつもん！' }).click();
      }
      await expect(page.getByTestId('detective-row')).toHaveCount(9);
      await noOverflow(page, 'detective large');
      const cells = page.getByTestId('detective-history').locator('li');
      expect(await cells.evaluateAll((els) => els.filter((e) => e.scrollWidth > e.clientWidth + 1).length)).toBe(0);
      if (size.width >= 375) expect(await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight)).toBeLessThanOrEqual(1);
      await cells.first().scrollIntoViewIfNeeded();
      await expect(cells.first()).toBeInViewport();
      await expect(page.getByRole('button', { name: 'この すうじで しつもん！' })).toBeInViewport({ ratio: 1 });
    });

    test('魔法陣：かんたん・ふつうは ヒントあり、むずかしい・チャレンジは ヒントなし。むずかしいを ヒントなしで クリア・つづきから も ヒントなし', async ({ page }) => {
      await page.goto('/');
      await createProfile(page, 'まほう');
      const open = async (level: string) => {
        await page.goto('/#/play');
        await page.goto('/#/play/magic-square');
        await page.getByRole('radio', { name: new RegExp(level) }).click();
        await page.getByRole('button', { name: 'はじめる' }).click();
        await expect(page.getByRole('button', { name: 'ちがう もんだいに する' })).toBeVisible();
      };
      for (const level of ['かんたん', 'ふつう']) {
        await open(level);
        await expect(page.getByRole('button', { name: /ヒント/ })).toBeVisible();
        await page.getByRole('button', { name: /ヒント/ }).click();
        await expect(page.getByText(/どの せんも ごうけい/)).toBeVisible();
        await page.getByRole('button', { name: 'もどる' }).click();
        if (await page.getByRole('button', { name: 'つづきを けす' }).count()) await page.getByRole('button', { name: 'つづきを けす' }).click();
      }
      await open('チャレンジ');
      await expect(page.getByRole('button', { name: /ヒント/ })).toHaveCount(0);
      await expect(page.getByTestId('sum-9')).toBeVisible();
      await page.getByRole('button', { name: 'もどる' }).click();
      if (await page.getByRole('button', { name: 'つづきを けす' }).count()) await page.getByRole('button', { name: 'つづきを けす' }).click();

      await open('むずかしい');
      await expect(page.getByRole('button', { name: /ヒント/ })).toHaveCount(0);
      // キーボードで ヒントを よぶ 方法も ない（h・?）
      await page.keyboard.press('h');
      await page.keyboard.press('?');
      await expect(page.getByText(/どの せんも ごうけい/)).toHaveCount(0);
      // 合計（「とちゅう」）は 見える
      await expect(page.locator('[data-state="partial"]').first()).toBeVisible();
      await page.locator('[data-testid^="magic-cell-"]:not([disabled])').first().click();
      const p = await draftOf<MagicPuzzle>(page, 'magic-square', (d) => d.round?.puzzle as MagicPuzzle | undefined);
      const sol = solveMagic(p.givens, 3).first!;
      const blanks = p.givens.map((v, i) => (v === 0 ? i : -1)).filter((i) => i >= 0);
      const palette = page.getByRole('group', { name: 'かずを えらぶ' });
      const put = async (i: number) => {
        await page.getByTestId(`magic-cell-${i}`).click();
        await palette.getByRole('button', { name: String(sol[i]), exact: true }).click();
      };
      await put(blanks[0]);
      await page.waitForTimeout(500);
      await page.reload();
      await page.goto('/#/play');
      await page.goto('/#/play/magic-square');
      await page.getByRole('button', { name: 'つづきから' }).click();
      await expect(page.getByRole('button', { name: 'ちがう もんだいに する' })).toBeVisible();
      await expect(page.getByRole('button', { name: /ヒント/ })).toHaveCount(0);
      for (const i of blanks.slice(1)) await put(i);
      await page.getByRole('button', { name: 'こたえあわせ' }).click();
      await expect(page.getByText(/せいかい！/)).toBeVisible();
      await noOverflow(page, 'magic hard');
    });
  });
}
