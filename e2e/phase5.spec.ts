import { expect, test, type Locator, type Page } from '@playwright/test';
import { createProfile } from './helpers';
import { slicesNeeded, type PizzaPuzzle } from '../src/domain/games/pizzaFractions';
import type { BlockPuzzle } from '../src/domain/games/blockBuilder';
import { solveMagic, type MagicPuzzle } from '../src/domain/games/magicSquare';

/** 第5弾：28 ピザで分数パズル・29 ブロック建築パズル・30 魔法陣パズル。iPhone 相当〜PC で 実際の 操作で */

const SIZES = [
  { name: '320×568', width: 320, height: 568, mobile: true },
  { name: '375×667', width: 375, height: 667, mobile: true },
  { name: '390×844', width: 390, height: 844, mobile: true },
  { name: '430×932', width: 430, height: 932, mobile: true },
  { name: '768×1024', width: 768, height: 1024, mobile: true },
  { name: '1280×800', width: 1280, height: 800, mobile: false },
];

async function startGame(page: Page, id: string, level: string) {
  await page.goto('/#/play');
  await page.goto(`/#/play/${id}`);
  await page.getByRole('radio', { name: new RegExp(level) }).click();
  await page.getByRole('button', { name: 'はじめる' }).click();
  await expect(page.getByRole('button', { name: 'ちがう もんだいに する' })).toBeVisible();
  // ヒントは 魔法陣の むずかしい・チャレンジ だけ なし（v1.7.1）
  if (id === 'magic-square' && (level === 'むずかしい' || level === 'チャレンジ')) await expect(page.getByRole('button', { name: /ヒント/ })).toHaveCount(0);
  else await expect(page.getByRole('button', { name: /ヒント/ })).toBeVisible();
}

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

async function readDraftPuzzle<T>(page: Page, gameId: string, match: (p: T) => boolean = () => true): Promise<T> {
  let found: T | undefined;
  await expect
    .poll(async () => {
      const all = await readStore<{ gameId?: string; status: string; createdAt: string; activeDraft?: { round: { puzzle: T } } }>(page, 'sessions');
      found = all
        .filter((x) => x.gameId === gameId && x.status === 'inProgress' && x.activeDraft && match(x.activeDraft.round.puzzle))
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
        .at(-1)?.activeDraft?.round.puzzle;
      return !!found;
    })
    .toBe(true);
  return found!;
}

async function lastSnapshot<T>(page: Page, gameId: string, before: number): Promise<T> {
  let snap: T | undefined;
  await expect
    .poll(async () => {
      const list = (await readStore<{ gameId?: string; answeredAt: string; questionSnapshot: T }>(page, 'attempts')).filter((a) => a.gameId === gameId);
      snap = list.sort((a, b) => a.answeredAt.localeCompare(b.answeredAt)).at(-1)?.questionSnapshot;
      return list.length > before;
    })
    .toBe(true);
  return snap!;
}
const attemptCount = async (page: Page, gameId: string) => (await readStore<{ gameId?: string }>(page, 'attempts')).filter((a) => a.gameId === gameId).length;

async function noOverflow(page: Page, where: string) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), `${where} overflow`).toBeLessThanOrEqual(0);
}
async function aboveDock(page: Page, el: Locator, where: string) {
  const box = (await el.boundingBox())!;
  const dock = (await page.getByTestId('dock').boundingBox())!;
  expect(box.y + box.height, `${where} hidden by dock`).toBeLessThanOrEqual(dock.y + 1);
}

for (const size of SIZES) {
  test.describe(size.name, () => {
    test.use({ viewport: { width: size.width, height: size.height }, isMobile: size.mobile, hasTouch: size.mobile });

    test('28 ピザ：かんたん・チャレンジの 5もんを ピースを タップして クリア。ピザは ドックに かくれない', async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(String(e)));
      await page.goto('/');
      await createProfile(page, 'ピザ');
      for (const level of ['かんたん', 'チャレンジ']) {
        await startGame(page, 'pizza-fractions', level);
        for (let q = 0; q < 5; q++) {
          await noOverflow(page, `pizza ${level} ${q}`);
          const pieces = page.getByRole('button', { name: /ばんめの ピース/ });
          // 答える ピザ（タップできる ピース）が ドックの うえに ぜんぶ 見える
          await aboveDock(page, pieces.last().locator('xpath=ancestor::*[name()="svg"][1]'), `pizza ${level} ${q}`);
          const before = await attemptCount(page, 'pizza-fractions');
          // ピースを 1つ タップして こたえる → 記録から 問題を よむ
          await pieces.first().click();
          await expect(pieces.first()).toHaveAttribute('aria-pressed', 'true');
          await page.getByRole('button', { name: 'これで できた！' }).click();
          const p = await lastSnapshot<PizzaPuzzle>(page, 'pizza-fractions', before);
          const need = slicesNeeded(p)!;
          if (need > 1) {
            await expect(page.getByText(/たりない/)).toBeVisible();
            // まちがえても えらんだ ピースは のこる。うしろの ピースを タップして たす（位置は 問わない）
            await expect(pieces.first()).toHaveAttribute('aria-pressed', 'true');
            const total = await pieces.count();
            for (let k = 0; k < need - 1; k++) await pieces.nth(total - 1 - k).click();
            await page.getByRole('button', { name: 'これで できた！' }).click();
          }
          await expect(page.getByText('せいかい！')).toBeVisible();
          await expect(page.getByTestId('pizza-explain')).toBeVisible();
          await page.waitForTimeout(650);
          await page.getByRole('button', { name: q < 4 ? 'つぎへ →' : 'おわり →' }).click();
        }
        await expect(page.getByText('5もん おわったよ！')).toBeVisible();
      }
      expect(errors).toEqual([]);
    });

    test('29 ブロック：チャレンジ 4×4 を 地図と ＋で つくる。まわしても かわらない。リロードしても つづきから', async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(String(e)));
      await page.goto('/');
      await createProfile(page, 'ブロック');
      await startGame(page, 'block-builder', 'チャレンジ');
      const map = page.getByTestId('block-map');
      await expect(map.getByRole('gridcell')).toHaveCount(16);
      await aboveDock(page, map, 'block map');
      await aboveDock(page, page.getByRole('button', { name: '1だん へらす' }), 'block minus');
      await noOverflow(page, 'block');
      const cell = (x: number, y: number) => map.locator(`[data-x="${x}"][data-y="${y}"]`);
      const plus = page.getByRole('button', { name: '1だん ふやす' });
      // まず 1つ つんで 下書きを つくる
      await cell(0, 0).click();
      await plus.click();
      const p = await readDraftPuzzle<BlockPuzzle>(page, 'block-builder');
      expect(p.size).toBe(4);
      const build = async (rows: number[]) => {
        for (const y of rows)
          for (let x = 0; x < p.size; x++) {
            await cell(x, y).click();
            const now = Number(await cell(x, y).textContent());
            const want = p.heights[y][x];
            for (let k = now; k < want; k++) await plus.click();
            for (let k = now; k > want; k--) await page.getByRole('button', { name: '1だん へらす' }).click();
            await expect(cell(x, y)).toHaveText(String(want));
          }
      };
      await build([0, 1]);
      // まわす：立体・地図が いっしょに まわり、形の データは そのまま
      await page.getByRole('button', { name: 'みぎに まわす' }).click();
      await expect(page.getByTestId('block-model')).toHaveAttribute('data-rot', '1');
      await expect(page.getByTestId('block-own')).toHaveAttribute('data-rot', '1');
      for (let x = 0; x < p.size; x++) await expect(cell(x, 0)).toHaveText(String(p.heights[0][x]));
      await page.waitForTimeout(500);
      await page.reload();
      await page.goto('/#/play');
      await page.goto('/#/play/block-builder');
      await page.getByRole('button', { name: 'つづきから' }).click();
      await expect(page.getByTestId('block-own')).toHaveAttribute('data-rot', '1');
      for (let x = 0; x < p.size; x++) await expect(cell(x, 1)).toHaveText(String(p.heights[1][x]));
      // まちがった まま こたえあわせ → 形は のこる
      await page.getByRole('button', { name: 'こたえあわせ' }).click();
      await expect(page.getByText(/もうすこし！ ちがう ところが/)).toBeVisible();
      await expect(cell(0, 1)).toHaveText(String(p.heights[1][0]));
      await build([2, 3]);
      await page.getByRole('button', { name: 'ひだりに まわす' }).click();
      await page.getByRole('button', { name: 'ひだりに まわす' }).click();
      await page.getByRole('button', { name: 'こたえあわせ' }).click();
      await expect(page.getByText('せいかい！')).toBeVisible();
      await expect(page.getByTestId('block-solved')).toBeVisible();
      expect(errors).toEqual([]);
    });

    test('29 ブロック：かんたん 2×2 は すうじつき。やりなおすは たしかめてから', async ({ page }) => {
      await page.goto('/');
      await createProfile(page, 'つみき');
      await startGame(page, 'block-builder', 'かんたん');
      const map = page.getByTestId('block-map');
      await expect(map.getByRole('gridcell')).toHaveCount(4);
      await noOverflow(page, 'block easy');
      await map.getByRole('gridcell').first().click();
      await page.getByRole('button', { name: '1だん ふやす' }).click();
      await page.getByRole('button', { name: 'やりなおす' }).click();
      await expect(page.getByRole('dialog')).toBeVisible();
      await page.getByRole('dialog').getByRole('button', { name: 'やりなおす' }).click();
      await expect(map.getByRole('gridcell').first()).toHaveText('0');
      const p = await readDraftPuzzle<BlockPuzzle>(page, 'block-builder');
      for (let y = 0; y < 2; y++)
        for (let x = 0; x < 2; x++) {
          await map.locator(`[data-x="${x}"][data-y="${y}"]`).click();
          for (let k = 0; k < p.heights[y][x]; k++) await page.getByRole('button', { name: '1だん ふやす' }).click();
        }
      await page.getByRole('button', { name: 'こたえあわせ' }).click();
      await expect(page.getByText('せいかい！')).toBeVisible();
    });

    test('29 ブロック：むずかしい・チャレンジで「うえから」。お手本と じぶんが いっしょに きりかわり、まわしても 形と 向きが あう', async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(String(e)));
      await page.goto('/');
      await createProfile(page, 'うえ');
      for (const level of ['むずかしい', 'チャレンジ']) {
        await startGame(page, 'block-builder', level);
        const map = page.getByTestId('block-map');
        const cell = (x: number, y: number) => map.locator(`[data-x="${x}"][data-y="${y}"]`);
        await cell(0, 0).click();
        await page.getByRole('button', { name: '1だん ふやす' }).click();
        const p = await readDraftPuzzle<BlockPuzzle>(page, 'block-builder', (q) => q.size === (level === 'むずかしい' ? 3 : 4));
        const toggle = page.getByRole('button', { name: 'うえから みる（おてほんと じぶん）' });
        await expect(toggle).toBeVisible();
        await aboveDock(page, toggle, `topview toggle ${level}`);
        await toggle.click();
        await expect(toggle).toHaveAttribute('aria-pressed', 'true');
        await expect(page.getByTestId('block-model')).toHaveAttribute('data-view', 'top');
        await expect(page.getByTestId('block-own')).toHaveAttribute('data-view', 'top');
        await noOverflow(page, `topview ${level}`);
        // お手本の 上から 見た 図は どの マスも 高さ どおり（0 は 空きマス）
        for (let y = 0; y < p.size; y++)
          for (let x = 0; x < p.size; x++) {
            const c = page.getByTestId('block-model').locator(`[data-testid="top-cell"][data-x="${x}"][data-y="${y}"]`);
            await expect(c).toHaveAttribute('data-h', String(p.heights[y][x]));
            await expect(c).toHaveAttribute('data-empty', p.heights[y][x] === 0 ? 'true' : 'false');
          }
        // 上から 見たまま まわす → 立体に もどしても 向きは そのまま
        await page.getByRole('button', { name: 'みぎに まわす' }).click();
        await expect(page.getByTestId('block-model')).toHaveAttribute('data-rot', '1');
        await expect(page.getByTestId('block-own')).toHaveAttribute('data-rot', '1');
        // 上から 見た じぶんの マスを タップして えらぶ
        await page.getByTestId('block-own').locator('[data-testid="top-cell"][data-x="1"][data-y="1"]').click();
        await expect(cell(1, 1)).toHaveAttribute('aria-selected', 'true');
        await page.getByRole('button', { name: '1だん ふやす' }).click();
        await expect(cell(1, 1)).toHaveText('1');
        await toggle.click();
        await expect(page.getByTestId('block-model')).toHaveAttribute('data-view', 'iso');
        await expect(page.getByTestId('block-own')).toHaveAttribute('data-rot', '1');
        await expect(cell(0, 0)).toHaveText('1');
        await expect(cell(1, 1)).toHaveText('1');
      }
      expect(errors).toEqual([]);
    });

    test('30 魔法陣：チャレンジ 4×4 を パレットで うめる。とちゅうの 合計、リロードで つづきから', async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(String(e)));
      await page.goto('/');
      await createProfile(page, 'まほう');
      await startGame(page, 'magic-square', 'チャレンジ');
      const palette = page.getByRole('group', { name: 'かずを えらぶ' });
      await expect(palette.getByRole('button')).toHaveCount(16);
      await aboveDock(page, palette, 'magic palette');
      await noOverflow(page, 'magic');
      // あいた マスを えらぶと 下書きが できる
      await page.locator('[data-testid^="magic-cell-"]:not([disabled])').first().click();
      const p = await readDraftPuzzle<MagicPuzzle>(page, 'magic-square');
      const sol = solveMagic(p.givens, 4).first!;
      const blanks = p.givens.map((v, i) => (v === 0 ? i : -1)).filter((i) => i >= 0);
      // はじめの かずは さわれない
      await expect(page.getByTestId(`magic-cell-${p.givens.findIndex((v) => v !== 0)}`)).toBeDisabled();
      const put = async (i: number, v: number) => {
        await page.getByTestId(`magic-cell-${i}`).click();
        await palette.getByRole('button', { name: String(v), exact: true }).click();
        await expect(page.getByTestId(`magic-cell-${i}`)).toHaveText(String(v));
      };
      const half = Math.ceil(blanks.length / 2);
      for (const i of blanks.slice(0, half)) await put(i, sol[i]);
      // うまって いない 列は「とちゅう」
      const partial = page.locator('[data-state="partial"]');
      expect(await partial.count()).toBeGreaterThan(0);
      await expect(partial.first()).toHaveAttribute('aria-label', /とちゅうの ごうけい/);
      await page.waitForTimeout(500);
      await page.reload();
      await page.goto('/#/play');
      await page.goto('/#/play/magic-square');
      await page.getByRole('button', { name: 'つづきから' }).click();
      for (const i of blanks.slice(0, half)) await expect(page.getByTestId(`magic-cell-${i}`)).toHaveText(String(sol[i]));
      for (const i of blanks.slice(half)) await put(i, sol[i]);
      await expect(page.locator('[data-state="partial"]')).toHaveCount(0);
      await expect(page.locator('[data-state="ng"]')).toHaveCount(0);
      await page.getByRole('button', { name: 'こたえあわせ' }).click();
      await expect(page.getByText('せいかい！')).toBeVisible();
      await expect(page.getByTestId('magic-solved')).toBeVisible();
      expect(errors).toEqual([]);
    });

    test('30 魔法陣：かんたん 3×3 は キーボードでも いれられ、まちがうと やさしく おしえる', async ({ page }) => {
      await page.goto('/');
      await createProfile(page, 'じん');
      await startGame(page, 'magic-square', 'かんたん');
      await expect(page.getByTestId('magic-guide')).toContainText('15');
      await page.locator('[data-testid^="magic-cell-"]:not([disabled])').first().click();
      const p = await readDraftPuzzle<MagicPuzzle>(page, 'magic-square');
      const sol = solveMagic(p.givens, 3).first!;
      const blanks = p.givens.map((v, i) => (v === 0 ? i : -1)).filter((i) => i >= 0);
      // まちがった ならび（あいた ところの 答えを ずらす）
      const wrong = blanks.map((_, k) => sol[blanks[(k + 1) % blanks.length]]);
      for (let k = 0; k < blanks.length; k++) {
        await page.getByTestId(`magic-cell-${blanks[k]}`).click();
        await page.keyboard.press(String(wrong[k]));
      }
      await page.getByRole('button', { name: 'こたえあわせ' }).click();
      await expect(page.getByText(/もうすこし！ (よこ|たて|ななめ)の ごうけいを みてみよう/)).toBeVisible();
      for (const i of blanks) {
        await page.getByTestId(`magic-cell-${i}`).click();
        await page.keyboard.press('Backspace');
      }
      for (const i of blanks) {
        await page.getByTestId(`magic-cell-${i}`).click();
        await page.keyboard.press(String(sol[i]));
      }
      await page.getByRole('button', { name: 'こたえあわせ' }).click();
      await expect(page.getByText('せいかい！')).toBeVisible();
    });
  });
}
