import { expect, test, type Locator, type Page } from '@playwright/test';
import { createProfile, openParent } from './helpers';
import { clockAnswer, hourOf, minuteOf, wrap, type ClockPuzzle } from '../src/domain/games/clockMaster';
import { huntTargets, type NumberHuntPuzzle } from '../src/domain/games/numberHunt';

/** 第4弾：100マス計算・26 とけいマスター・27 数字をさがせ！・ホームの 版の 表示と 歯車。iPhone 相当〜PC で 実際の 操作で */

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
  await expect(page.getByRole('button', { name: /ヒント/ })).toBeVisible();
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

async function readDraftPuzzle<T>(page: Page, gameId: string): Promise<T> {
  let found: T | undefined;
  await expect
    .poll(async () => {
      const all = await readStore<{ gameId?: string; status: string; createdAt: string; activeDraft?: { round: { puzzle: T } } }>(page, 'sessions');
      found = all
        .filter((x) => x.gameId === gameId && x.status === 'inProgress' && x.activeDraft)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
        .at(-1)?.activeDraft?.round.puzzle;
      return !!found;
    })
    .toBe(true);
  return found!;
}

/** いちばん あたらしい 記録の 問題（5問セットの ゲームで、1回 こたえた あとに よむ） */
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

    test('ホーム：右下に 版（v1.5.0 + ビルドID）、設定は 歯車。かさならず はみ出さない', async ({ page }) => {
      await page.goto('/');
      await createProfile(page, 'ばん');
      const v = page.getByTestId('home-version');
      await expect(v).toBeVisible();
      const built = await page.evaluate(() => document.documentElement.dataset.appVersion!);
      const [ver, id] = built.split('+');
      expect(ver).toBe('1.5.0');
      await expect(v).toHaveText(`v${ver} + ${id}`);
      // 右よせ・モードの カードより 下・画面の はばに おさまる
      const vb = (await v.boundingBox())!;
      const nav = (await page.getByRole('navigation', { name: 'モード' }).boundingBox())!;
      expect(vb.y).toBeGreaterThanOrEqual(nav.y + nav.height);
      expect(vb.x + vb.width).toBeLessThanOrEqual(size.width);
      expect(vb.x + vb.width).toBeGreaterThan(size.width / 2);
      const color = await v.evaluate((el) => getComputedStyle(el).color);
      expect(color).toBe('rgb(154, 167, 180)');
      await noOverflow(page, 'home');
      // ページの いちばん下まで スクロールすると 見える（固定配置では ない）
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await expect(v).toBeInViewport();
      // 歯車：音・切りかえ と 同じ 大きさの まるい ボタン。おすと おとなの メニューへ
      const gear = page.getByRole('button', { name: 'おとなの メニュー' });
      const gb = (await gear.boundingBox())!;
      const sb = (await page.getByRole('button', { name: 'あそぶ ひとを かえる' }).boundingBox())!;
      expect(Math.round(gb.width)).toBe(Math.round(sb.width));
      expect(gb.width).toBeGreaterThanOrEqual(44);
      expect(await gear.locator('svg path').count()).toBeGreaterThanOrEqual(1);
      expect(await gear.locator('svg circle').count()).toBe(1);
      await gear.click();
      await expect(page.getByRole('button', { name: 'ボタンを ながおしして ひらく' })).toBeVisible();
      // おとなの メニューの 版の 表示も のこる
      await openParent(page);
      await page.getByRole('tab', { name: '保存について' }).click();
      await expect(page.getByTestId('app-version')).toHaveText(built);
      // ゲーム画面には 版を 出さない
      await page.goto('/#/play/clock-master');
      await expect(page.getByTestId('home-version')).toHaveCount(0);
    });

    test('100マス計算：3×3 を まちがえて なおす、10×10 を キーボードで 100マス 入れて クリア。記録は べつ', async ({ page }) => {
      await page.goto('/');
      await createProfile(page, 'ます');
      await page.goto('/#/calc');
      await expect(page.getByRole('tab', { name: 'いつもの けいさん' })).toHaveAttribute('aria-selected', 'true');
      await page.getByRole('tab', { name: 'マスけいさん' }).click();
      await expect(page.getByRole('radio', { name: /かんたん/ })).toHaveAttribute('aria-checked', 'true');
      await expect(page.getByRole('radio', { name: 'ださない' })).toHaveAttribute('aria-checked', 'true');
      await noOverflow(page, 'grid setup');
      await page.getByRole('button', { name: 'はじめる' }).click();
      const table = page.getByRole('grid', { name: 'マスけいさんの ひょう' });
      await aboveDock(page, table, 'grid 3x3');
      const cells = table.getByRole('gridcell');
      await expect(cells).toHaveCount(9);
      const answerOf = async (el: Locator) => {
        const m = (await el.getAttribute('aria-label'))!.match(/^(\d+) (.) (\d+)：/)!;
        const a = Number(m[1]);
        const b = Number(m[3]);
        return { '+': a + b, '−': a - b, '×': a * b, '÷': a / b }[m[2]]!;
      };
      const pad = page.getByRole('group', { name: 'すうじキー' });
      for (let i = 0; i < 9; i++) {
        const v = (await answerOf(cells.nth(i))) + (i === 4 ? 1 : 0);
        for (const d of String(v)) await pad.getByRole('button', { name: d, exact: true }).click();
        await page.getByRole('button', { name: 'つぎの マス' }).click();
      }
      await page.getByRole('button', { name: 'こたえあわせ' }).click();
      await expect(cells.nth(4)).toHaveAttribute('aria-label', /（ちがう）/);
      await page.keyboard.press('Backspace');
      await page.keyboard.press('Backspace');
      await page.keyboard.type(String(await answerOf(cells.nth(4))));
      await page.getByRole('button', { name: 'こたえあわせ' }).click();
      await expect(page.getByTestId('grid-result')).toContainText('なおした かいすう：1かい');

      // 10×10（むずかしい・かけざん・タイマー）
      await page.getByRole('button', { name: 'せっていを かえる' }).click();
      await page.getByRole('radio', { name: /むずかしい/ }).click();
      await page.getByRole('radio', { name: /かけざん/ }).click();
      await page.getByRole('radio', { name: 'じかんを はかる' }).click();
      await page.getByRole('button', { name: 'はじめる' }).click();
      await expect(cells).toHaveCount(100);
      await expect(page.getByTestId('grid-timer')).toBeVisible();
      await aboveDock(page, page.getByTestId('grid-scroll'), 'grid 10x10');
      await noOverflow(page, 'grid 10x10');
      for (let i = 0; i < 100; i++) {
        const sel = table.locator('[aria-selected="true"]');
        await page.keyboard.type(String(await answerOf(sel)));
        await page.keyboard.press('Enter');
        if (i === 57) {
          // とちゅうで 読みこみなおしても 同じ 盤・入力の つづきから
          await page.waitForTimeout(400);
          await page.reload();
          await page.goto('/#/calc/grid');
          await page.getByRole('button', { name: 'つづきから' }).click();
          await expect(page.getByTestId('grid-count')).toContainText('いれた 58/100');
        }
      }
      // えらんでいる マスは スクロールして 見える
      await expect(table.locator('[aria-selected="true"]')).toBeInViewport();
      await page.getByRole('button', { name: 'ぜんたいを みる' }).click();
      await page.getByRole('button', { name: 'こたえあわせ' }).click();
      await expect(page.getByTestId('grid-result')).toContainText('100マス ぜんぶ できたね');
      await expect(page.getByTestId('grid-time')).toContainText('じこベスト');

      // おとなの メニュー：100マスは べつの 表。ふつうの 計算の 表には まざらない
      await openParent(page);
      await expect(page.getByTestId('grid-records')).toContainText('むずかしい 10×10・かけざん');
      await expect(page.getByTestId('grid-records')).toContainText('かんたん 3×3・たしざん');
      await expect(page.getByRole('heading', { name: '「けいさん」モード（1回目で正解した割合）' }).locator('..')).toContainText('まだ記録がありません');
    });

    test('26 とけいマスター：ふつうの 5もん（えらぶ・針を ドラッグ／ボタン）、むずかしい・チャレンジは 数字で', async ({ page }) => {
      await page.goto('/');
      await createProfile(page, 'とけい');
      for (const level of ['ふつう', 'むずかしい', 'チャレンジ']) {
        await startGame(page, 'clock-master', level);
        for (let q = 0; q < 5; q++) {
          await noOverflow(page, `clock ${level} ${q}`);
          const before = await attemptCount(page, 'clock-master');
          // まず 1回 こたえる（あたりでも はずれでも よい）→ 記録から 問題を よむ
          const choices = page.getByRole('group', { name: 'こたえを えらぶ' });
          const setBtn = page.getByRole('button', { name: 'これで できた！' });
          const entry = page.getByRole('group', { name: 'じこくを いれる' });
          const pad = page.getByRole('group', { name: 'すうじキー' });
          if (await choices.isVisible()) await choices.getByRole('button').first().click();
          else if (await setBtn.isVisible()) {
            // 長針を ドラッグ（そとがわ）してから こたえる
            const clock = page.getByRole('img', { name: /^とけい：/ });
            const b = (await clock.boundingBox())!;
            const label0 = (await clock.getAttribute('aria-label'))!;
            // いまの 分と ちがう ところ（30ぷん か 45ふん）まで 長針を うごかす
            const m0 = Number(label0.match(/じ(\d+)/)?.[1] ?? 0);
            const deg = m0 === 30 ? 270 : 180;
            const at = (d: number) => ({ x: b.x + b.width / 2 + Math.sin((d * Math.PI) / 180) * b.width * 0.38, y: b.y + b.height / 2 - Math.cos((d * Math.PI) / 180) * b.height * 0.38 });
            await page.mouse.move(at(m0 * 6).x, at(m0 * 6).y);
            await page.mouse.down();
            for (let k = 1; k <= 8; k++) {
              const d = m0 * 6 + ((((deg - m0 * 6) % 360) + 360) % 360) * (k / 8);
              await page.mouse.move(at(d).x, at(d).y);
            }
            await page.mouse.up();
            expect(await clock.getAttribute('aria-label')).not.toBe(label0);
            await setBtn.click();
          } else if (await entry.isVisible()) {
            await pad.getByRole('button', { name: '1', exact: true }).click();
            await pad.getByRole('button', { name: 'つぎ' }).click();
            await pad.getByRole('button', { name: '1', exact: true }).click();
            await pad.getByRole('button', { name: 'こたえる' }).click();
          } else {
            await pad.getByRole('button', { name: '1', exact: true }).click();
            await pad.getByRole('button', { name: 'こたえる' }).click();
          }
          const p = await lastSnapshot<ClockPuzzle>(page, 'clock-master', before);
          if (!(await page.getByText('せいかい！').isVisible())) {
            const want = clockAnswer(p);
            if (p.kind === 'read' && p.choices) {
              await choices.getByRole('button').nth(p.choices.indexOf(p.time)).click();
            } else if (p.kind === 'set') {
              // ボタンで あわせる（いまの 時刻は 時計の ラベルから）
              const clock = page.getByRole('img', { name: /^とけい：/ });
              const m = (await clock.getAttribute('aria-label'))!.match(/とけい：(\d+)じ(?:(\d+)(?:ふん|ぷん))?/)!;
              const now = (Number(m[1]) % 12) * 60 + Number(m[2] ?? 0);
              let diff = wrap(want - now);
              for (; diff >= 60; diff -= 60) await page.getByRole('button', { name: 'じかん ＋1' }).click();
              for (; diff >= 5; diff -= 5) await page.getByRole('button', { name: 'ふん ＋5' }).click();
              for (; diff > 0; diff -= 1) await page.getByRole('button', { name: 'ふん ＋1' }).click();
              await setBtn.click();
            } else if (p.kind === 'between') {
              await pad.getByRole('button', { name: '1もじ けす' }).click();
              for (const d of String(want)) await pad.getByRole('button', { name: d, exact: true }).click();
              await pad.getByRole('button', { name: 'こたえる' }).click();
            } else {
              await entry.getByRole('button', { name: /なんじ/ }).click();
              await pad.getByRole('button', { name: '1もじ けす' }).click();
              for (const d of String(hourOf(want) || 12)) await pad.getByRole('button', { name: d, exact: true }).click();
              await entry.getByRole('button', { name: /なんぷん/ }).click();
              await pad.getByRole('button', { name: '1もじ けす' }).click();
              for (const d of String(minuteOf(want))) await pad.getByRole('button', { name: d, exact: true }).click();
              await pad.getByRole('button', { name: 'こたえる' }).click();
            }
          }
          await expect(page.getByText('せいかい！')).toBeVisible();
          await page.waitForTimeout(650);
          await page.getByRole('button', { name: q < 4 ? 'つぎへ →' : 'おわり →' }).click();
        }
        await expect(page.getByText('5もん おわったよ！')).toBeVisible();
      }
    });

    test('27 数字をさがせ！：チャレンジ 6×6 を 5ラウンド。まちがえても すすまない。リロードしても 同じ ならびの つづき', async ({ page }) => {
      await page.goto('/');
      await createProfile(page, 'さがす');
      await startGame(page, 'number-hunt', 'チャレンジ');
      await page.getByRole('radio', { name: 'じかんを はかる' }).click();
      await page.getByRole('button', { name: 'スタート' }).click();
      const board = page.getByRole('grid', { name: 'すうじの ばん' });
      await expect(board.getByRole('gridcell')).toHaveCount(36);
      await aboveDock(page, board, 'hunt 6x6');
      await noOverflow(page, 'hunt');
      const p = await readDraftPuzzle<NumberHuntPuzzle>(page, 'number-hunt');
      const t = huntTargets(p);
      const cell = (v: number) => board.getByRole('gridcell', { name: new RegExp(`^${v}(（|$)`) });
      // まちがい（さいごの 数字）を おしても すすまない
      await cell(t.at(-1)!).click();
      await expect(page.getByTestId('hunt-target')).toHaveText(String(t[0]));
      for (let k = 0; k < 5; k++) {
        if (k === 2) {
          await page.getByRole('button', { name: 'つぎの ラウンド' }).click();
          await page.getByRole('button', { name: 'スタート' }).click();
          await cell(t[0]).click();
          await cell(t[1]).click();
          await page.waitForTimeout(450);
          await page.reload();
          await page.goto('/#/play');
          await page.goto('/#/play/number-hunt');
          await page.getByRole('button', { name: 'つづきから' }).click();
          await expect(page.getByText('ラウンド 3／5')).toBeVisible();
          await page.getByRole('button', { name: 'スタート' }).click();
          await expect(page.getByTestId('hunt-target')).toHaveText(String(t[2]));
          const now = await board.getByRole('gridcell').evaluateAll((els) => els.map((e) => Number(e.textContent!.replace('✓', ''))));
          expect(now).toEqual(p.rounds[2]);
          for (const v of t.slice(2)) await cell(v).click();
        } else {
          if (k > 0) {
            await page.getByRole('button', { name: 'つぎの ラウンド' }).click();
            await page.getByRole('button', { name: 'スタート' }).click();
          }
          for (const v of t) await cell(v).click();
        }
      }
      await expect(page.getByText('せいかい！')).toBeVisible();
      await expect(page.getByTestId('hunt-result')).toContainText('まちがい 1かい');
    });
  });
}
