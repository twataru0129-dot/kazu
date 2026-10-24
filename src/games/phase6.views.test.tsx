import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { AppProvider, useApp } from '../app/AppContext';
import { memoryBackend } from '../persistence/db';
import { Repo } from '../persistence/repo';
import { defaultSettings } from '../persistence/types';
import { NumberDetectiveScreen } from '../screens/NumberDetectiveScreen';
import { deckOrder, judgeGuess, type DetectiveDeck } from '../domain/games/numberDetective';

const Gate = () => (useApp().profile ? <NumberDetectiveScreen /> : null);

/** プロフィールを つくり、出題じゅん（deck）を きめて ひらく。さいしょの ひみつは deckOrder(deck)[deck.next] */
async function mount(opts: { repo?: Repo; seed?: number; name?: string } = {}) {
  const repo = opts.repo ?? new Repo(memoryBackend());
  const prof = await repo.createProfile(opts.name ?? 't', 'fox');
  const deck: DetectiveDeck = { v: 1, seed: opts.seed ?? 11, next: 0 };
  await repo.saveSettings({ ...defaultSettings(prof.id), numberDetectiveDeck: deck });
  sessionStorage.setItem('kazu.tabProfileId', prof.id);
  const view = render(
    <AppProvider repo={repo}>
      <Gate />
    </AppProvider>,
  );
  await screen.findByRole('button', { name: 'すぐに あそぶ' }, { timeout: 3000 });
  return { repo, prof, view, secret: deckOrder(deck)[0], deck };
}
const remount = async (repo: Repo) => {
  const view = render(
    <AppProvider repo={repo}>
      <Gate />
    </AppProvider>,
  );
  await screen.findByRole('button', { name: 'すぐに あそぶ' }, { timeout: 3000 });
  return view;
};

const pad = () => within(screen.getByRole('group', { name: 'すうじボタン' }));
const digit = (d: string) => fireEvent.click(pad().getByRole('button', { name: new RegExp(`^${d}`) }));
const askBtn = () => screen.getByRole('button', { name: 'この すうじで しつもん！' });
const enter = (g: string) => {
  for (const d of g) digit(d);
  fireEvent.click(askBtn());
};
const left = () => screen.getByTestId('detective-left').textContent;
const rows = () => screen.queryAllByTestId('detective-row');
/** ひみつと ちがう ならびを n こ（かさならない） */
const wrongGuesses = (secret: string, n: number) => ['012', '345', '678', '901', '234', '567', '890', '123', '456', '789', '102', '304', '506'].filter((g) => g !== secret).slice(0, n);
const start = async () => {
  fireEvent.click(screen.getByRole('button', { name: 'すぐに あそぶ' }));
  await screen.findByRole('group', { name: 'すうじボタン' });
};

// jsdom には スクロールが ないので、画面の 切りかえで よぶ scrollTo を 何もしない ものに する
beforeAll(() => {
  window.scrollTo = (() => undefined) as typeof window.scrollTo;
});
afterEach(() => sessionStorage.clear());

describe('31 すうじたんてい（画面）：はじめる まえ', () => {
  it('むずかしさの 選択は 出ない。あそびかたは 自動で 出ず、「すぐに あそぶ」で すぐ はじまる', async () => {
    await mount();
    expect(screen.queryByRole('radiogroup', { name: 'むずかしさ' })).toBeNull();
    expect(screen.queryByText(/かんたん|ふつう|むずかしい|チャレンジ/)).toBeNull();
    expect(screen.queryByTestId('detective-howto')).toBeNull();
    expect(screen.getByRole('button', { name: 'あそびかたを みる' })).toBeTruthy();
    await start();
    expect(left()).toContain('10');
    expect(screen.queryByRole('button', { name: /ヒント/ })).toBeNull();
    expect(screen.queryByText(/かんたん|ふつう|むずかしい|チャレンジ/)).toBeNull();
  });

  it('「あそびかたを みる」で 例の カードを 見て、もどる・「ゲームを はじめる」が できる', async () => {
    await mount();
    fireEvent.click(screen.getByRole('button', { name: 'あそびかたを みる' }));
    const howto = screen.getByTestId('detective-howto');
    expect(howto.textContent).toContain('EAT（イート）は すうじも ばしょも おなじ');
    expect(howto.textContent).toContain('BITE（バイト）は すうじだけ おなじ');
    expect(howto.textContent).toContain('10かい いないに 3 EAT を めざそう');
    fireEvent.click(screen.getAllByRole('button', { name: 'もどる' }).at(-1)!);
    await screen.findByRole('button', { name: 'すぐに あそぶ' });
    fireEvent.click(screen.getByRole('button', { name: 'あそびかたを みる' }));
    fireEvent.click(screen.getByRole('button', { name: 'ゲームを はじめる' }));
    await screen.findByRole('group', { name: 'すうじボタン' });
    expect(left()).toContain('10');
  });
});

describe('31 すうじたんてい（画面）：あそぶ', () => {
  it('ボタンで 左から 入れる。えらんだ すうじは 押せない。3つ そろうまで しつもん できない', async () => {
    const { secret } = await mount();
    await start();
    expect(askBtn()).toHaveProperty('disabled', true);
    digit('4');
    expect(pad().getByRole('button', { name: '4（えらんでいる）' })).toHaveProperty('disabled', true);
    digit('0');
    expect(screen.getByTestId('detective-slot-0').textContent).toBe('4');
    expect(screen.getByTestId('detective-slot-1').textContent).toBe('0');
    expect(askBtn()).toHaveProperty('disabled', true);
    fireEvent.click(screen.getByRole('button', { name: '1つ けす' }));
    expect(screen.getByTestId('detective-slot-1').textContent).toBe('');
    fireEvent.click(screen.getByRole('button', { name: 'ぜんぶ けす' }));
    expect(screen.getByTestId('detective-slot-0').textContent).toBe('');
    const g = wrongGuesses(secret, 1)[0];
    enter(g);
    const r = judgeGuess(secret, g);
    expect(rows()).toHaveLength(1);
    expect(rows()[0].getAttribute('aria-label')).toBe(`1かいめ ${g.split('').join(' ')}：${r.eat} EAT ${r.bite} BITE`);
    expect(screen.getByTestId('detective-message').textContent).toBe(`${r.eat} EAT！ ${r.bite} BITE！`);
    expect(left()).toContain('9');
    // 入力は からに なる
    expect(screen.getByTestId('detective-slot-0').textContent).toBe('');
  });

  it('まえと おなじ ならびは「もう しつもんしたよ」で 回数を へらさない。なおして べつの ならびで きける', async () => {
    const { secret } = await mount();
    await start();
    const [a, b] = wrongGuesses(secret, 2);
    enter(a);
    enter(a);
    expect(screen.getByTestId('detective-message').textContent).toBe('この ならびは もう しつもんしたよ');
    expect(rows()).toHaveLength(1);
    expect(left()).toContain('9');
    fireEvent.click(screen.getByRole('button', { name: 'ぜんぶ けす' }));
    enter(b);
    expect(rows()).toHaveLength(2);
    expect(left()).toContain('8');
  });

  it('キーボード：すうじ・Backspace・Enter（かさなる すうじは 入らない）', async () => {
    const { secret } = await mount();
    await start();
    const g = wrongGuesses(secret, 1)[0];
    fireEvent.keyDown(window, { key: g[0] });
    fireEvent.keyDown(window, { key: g[0] });
    fireEvent.keyDown(window, { key: '9' === g[0] ? '8' : '9' });
    fireEvent.keyDown(window, { key: 'Backspace' });
    expect(screen.getByTestId('detective-slot-1').textContent).toBe('');
    fireEvent.keyDown(window, { key: g[1] });
    fireEvent.keyDown(window, { key: g[2] });
    (document.activeElement as HTMLElement | null)?.blur();
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(rows()).toHaveLength(1);
  });

  it('「？ あそびかた」を ひらいて とじても 入力と 回数は かわらない', async () => {
    const { secret } = await mount();
    await start();
    enter(wrongGuesses(secret, 1)[0]);
    digit(secret === '056' ? '7' : '0');
    fireEvent.click(screen.getByRole('button', { name: '？ あそびかた' }));
    expect(screen.getByRole('dialog', { name: 'あそびかた' })).toBeTruthy();
    // あいて いる あいだは キーボードで 入らない
    fireEvent.keyDown(window, { key: '5' });
    fireEvent.click(screen.getByRole('button', { name: 'とじる' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByTestId('detective-slot-0').textContent).toBe(secret === '056' ? '7' : '0');
    expect(screen.getByTestId('detective-slot-1').textContent).toBe('');
    expect(left()).toContain('9');
  });

  it('ひみつの すうじは おわるまで 画面にも 読みあげ用の ラベルにも 出ない', async () => {
    const { secret, view } = await mount();
    await start();
    for (const g of wrongGuesses(secret, 3)) enter(g);
    expect(screen.getByTestId('detective-secret').getAttribute('aria-label')).toBe('ひみつの すうじ（まだ ないしょ）');
    expect(screen.getByTestId('detective-secret').textContent).toBe('？？？');
    // 見える 文字と 読みあげの ラベル（HTML の 色の 指定などの 数字とは まぎれない ように）
    const root = view.container;
    const shown: string[] = [root.textContent ?? ''];
    const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let n = tw.nextNode(); n; n = tw.nextNode()) shown.push(n.textContent ?? '');
    root.querySelectorAll('[aria-label], [title], [alt]').forEach((el) => shown.push(el.getAttribute('aria-label') ?? '', el.getAttribute('title') ?? '', el.getAttribute('alt') ?? ''));
    expect(shown.slice(1).filter((t) => t.includes(secret) || t.includes(secret.split('').join(' ')))).toEqual([]);
    expect(screen.getByTestId('detective-secret').textContent).toBe('？？？');
  });
});

describe('31 すうじたんてい（画面）：おわり と 記録', () => {
  it('5かいめで 正解：せいかい！・5かいで あてたよ！・ひみつを 出す。記録は クリア', async () => {
    const { secret, repo, prof } = await mount();
    await start();
    for (const g of wrongGuesses(secret, 4)) enter(g);
    enter(secret);
    const res = screen.getByTestId('detective-result');
    expect(res.textContent).toContain('せいかい！');
    expect(res.textContent).toContain('5かいで あてたよ！');
    expect(screen.getByTestId('detective-secret').textContent).toBe(secret);
    expect(screen.queryByRole('group', { name: 'すうじボタン' })).toBeNull();
    expect(screen.getByRole('button', { name: 'もういちど あそぶ' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'ゲーム いちらんへ' })).toBeTruthy();
    await waitFor(async () => expect(await repo.listAttempts(prof.id)).toHaveLength(1));
    const [a] = await repo.listAttempts(prof.id);
    expect(a).toMatchObject({ gameId: 'number-detective', mode: 'game', finalCorrect: true, firstTryCorrect: false, retryCount: 4, hintsUsed: 0, questionSnapshot: { secret } });
    expect(a.skipped).toBeUndefined();
    const s = (await repo.listSessions(prof.id))[0];
    expect(s).toMatchObject({ status: 'completed', summary: { outcome: 'cleared', questions: 5, secret } });
    expect(s.activeDraft).toBeUndefined();
  });

  it('1かいめで 正解', async () => {
    const { secret, repo, prof } = await mount();
    await start();
    enter(secret);
    expect(screen.getByTestId('detective-result').textContent).toContain('1かいで あてたよ！');
    await waitFor(async () => expect((await repo.listAttempts(prof.id))[0]).toMatchObject({ finalCorrect: true, firstTryCorrect: true }));
  });

  it('10かいめで 正解は クリア', async () => {
    const { secret } = await mount();
    await start();
    for (const g of wrongGuesses(secret, 9)) enter(g);
    expect(left()).toContain('1');
    enter(secret);
    expect(screen.getByTestId('detective-result').textContent).toContain('10かいで あてたよ！');
  });

  it('10かい まちがえると おしまい：こたえを 見せ、記録は「クリアでない」（スキップでも ない）。それ以上 しつもん できない', async () => {
    const { secret, repo, prof } = await mount();
    await start();
    for (const g of wrongGuesses(secret, 10)) enter(g);
    const res = screen.getByTestId('detective-result');
    expect(res.textContent).toContain('おしかったね！');
    expect(res.textContent).toContain(`こたえは ${secret} だったよ！`);
    expect(rows()).toHaveLength(10);
    expect(left()).toContain('0');
    expect(screen.queryByRole('button', { name: 'この すうじで しつもん！' })).toBeNull();
    fireEvent.keyDown(window, { key: '1' });
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(rows()).toHaveLength(10);
    await waitFor(async () => expect(await repo.listAttempts(prof.id)).toHaveLength(1));
    const [a] = await repo.listAttempts(prof.id);
    expect(a).toMatchObject({ finalCorrect: false, retryCount: 10, answerSnapshot: { outcome: 'over' } });
    expect(a.skipped).toBeUndefined();
    expect((await repo.listSessions(prof.id))[0]).toMatchObject({ status: 'completed', summary: { outcome: 'over', questions: 10, secret } });
  });

  it('「もういちど あそぶ」で 出題じゅんの つぎの ひみつで 新しい ゲーム', async () => {
    const { secret, repo, prof, deck } = await mount();
    await start();
    enter(secret);
    fireEvent.click(screen.getByRole('button', { name: 'もういちど あそぶ' }));
    await waitFor(() => expect(rows()).toHaveLength(0));
    expect(left()).toContain('10');
    const next = deckOrder(deck)[1];
    enter(next);
    expect(screen.getByTestId('detective-result').textContent).toContain('1かいで あてたよ！');
    expect(screen.getByTestId('detective-secret').textContent).toBe(next);
    await waitFor(async () => expect(await repo.listAttempts(prof.id)).toHaveLength(2));
    expect((await repo.getSettings(prof.id)).numberDetectiveDeck).toMatchObject({ seed: deck.seed, next: 2 });
  });
});

describe('31 すうじたんてい（画面）：つづきから・プロフィール', () => {
  it('とちゅうで はなれても、同じ ひみつ・履歴・入力中の すうじ・回数で つづきから', async () => {
    const { secret, repo, view } = await mount();
    await start();
    const gs = wrongGuesses(secret, 3);
    for (const g of gs) enter(g);
    const free = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'].find((d) => !secret.includes(d))!;
    digit(free);
    view.unmount();
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    await remount(repo);
    fireEvent.click(await screen.findByRole('button', { name: 'つづきから' }));
    await screen.findByRole('group', { name: 'すうじボタン' });
    expect(rows().map((r) => r.getAttribute('aria-label')!.split('：')[0])).toEqual(gs.map((g, i) => `${i + 1}かいめ ${g.split('').join(' ')}`));
    expect(left()).toContain('7');
    expect(screen.getByTestId('detective-slot-0').textContent).toBe(free);
    // 同じ ひみつ：のこりで 当てられる
    fireEvent.click(screen.getByRole('button', { name: 'ぜんぶ けす' }));
    enter(secret);
    expect(screen.getByTestId('detective-result').textContent).toContain('4かいで あてたよ！');
  });

  it('プロフィールごとに 出題じゅん・途中が わかれる', async () => {
    const repo = new Repo(memoryBackend());
    const a = await mount({ repo, seed: 101, name: 'a' });
    await start();
    enter(wrongGuesses(a.secret, 1)[0]);
    a.view.unmount();
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    const b = await mount({ repo, seed: 202, name: 'b' });
    // b には つづきが ない（a の 途中は みえない）
    expect(screen.queryByRole('button', { name: 'つづきから' })).toBeNull();
    await start();
    enter(b.secret);
    expect(screen.getByTestId('detective-secret').textContent).toBe(b.secret);
    expect(b.secret).not.toBe(a.secret);
    expect((await repo.getSettings(a.prof.id)).numberDetectiveDeck).toMatchObject({ seed: 101, next: 1 });
    await waitFor(async () => expect((await repo.getSettings(b.prof.id)).numberDetectiveDeck).toMatchObject({ seed: 202, next: 1 }));
    expect(await repo.listAttempts(a.prof.id)).toHaveLength(0);
  });
});

describe('31 すうじたんてい：バックアップ', () => {
  it('出題じゅん・おわった 記録・途中の ゲームが バックアップ → 復元で のこる', async () => {
    const { exportBundle, previewImport, applyImport } = await import('../persistence/backup');
    const { secret, repo, prof, view } = await mount({ seed: 77 });
    await start();
    enter(secret);
    fireEvent.click(screen.getByRole('button', { name: 'もういちど あそぶ' }));
    await waitFor(() => expect(rows()).toHaveLength(0));
    enter(wrongGuesses(deckOrder({ seed: 77 })[1], 1)[0]);
    view.unmount();
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    const json = JSON.stringify(await exportBundle(repo));
    const fresh = new Repo(memoryBackend());
    const pv = await previewImport(fresh, json);
    expect(pv.ok).toBe(true);
    await applyImport(fresh, pv.bundle!, 'replace');
    expect((await fresh.getSettings(prof.id)).numberDetectiveDeck).toMatchObject({ v: 1, seed: 77, next: 2 });
    expect(await fresh.listAttempts(prof.id)).toEqual([expect.objectContaining({ gameId: 'number-detective', finalCorrect: true })]);
    const draft = await fresh.findDraft(prof.id, 'game', 'number-detective');
    expect((draft?.activeDraft as { state: { secret: string; guesses: unknown[] } }).state).toMatchObject({ secret: deckOrder({ seed: 77 })[1], guesses: [expect.anything()] });
  });
});
