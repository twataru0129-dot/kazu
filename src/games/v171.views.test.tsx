import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { AppProvider, useApp } from '../app/AppContext';
import { memoryBackend } from '../persistence/db';
import { Repo } from '../persistence/repo';
import { defaultSettings } from '../persistence/types';
import { GameScreen } from './GameScreen';
import { NumberDetectiveScreen } from '../screens/NumberDetectiveScreen';
import { GAMES, GAME_BY_ID } from '../domain/games/registry';
import { generatePuzzle, type GameId } from '../domain/games/types';
import { createRng } from '../domain/random';
import { deckOrder, judgeGuess } from '../domain/games/numberDetective';
import { solveMagic, type MagicPuzzle } from '../domain/games/magicSquare';
import type { Difficulty } from '../domain/types';

beforeAll(() => {
  window.scrollTo = (() => undefined) as typeof window.scrollTo;
});
afterEach(() => sessionStorage.clear());

async function newProfile(repo = new Repo(memoryBackend())) {
  const prof = await repo.createProfile('t', 'fox');
  sessionStorage.setItem('kazu.tabProfileId', prof.id);
  return { repo, prof };
}

describe('v1.7.1 魔法陣パズル：むずかしい・チャレンジは ヒントなし', () => {
  const mountGame = async (id: GameId, repo: Repo) => {
    const Gate = () => (useApp().profile ? <GameScreen gameId={id} /> : null);
    return render(
      <AppProvider repo={repo}>
        <Gate />
      </AppProvider>,
    );
  };
  const startLevel = async (label: string) => {
    fireEvent.click(await screen.findByRole('radio', { name: new RegExp(label) }, { timeout: 3000 }));
    fireEvent.click(screen.getByRole('button', { name: 'はじめる' }));
    await screen.findByRole('button', { name: 'ちがう もんだいに する' });
  };

  it('登録表：魔法陣だけ むずかしい・チャレンジに ヒントなしの しるし。ほかの 30ゲームは なし', () => {
    expect(GAME_BY_ID['magic-square'].noHintLevels).toEqual(['hard', 'challenge']);
    for (const g of GAMES) if (g.id !== 'magic-square') expect(g.noHintLevels).toBeUndefined();
  });

  for (const [label, has] of [
    ['かんたん', true],
    ['ふつう', true],
    ['むずかしい', false],
    ['チャレンジ', false],
  ] as const)
    it(`${label}：ヒントボタン ${has ? 'あり' : 'なし'}。合計の 表示は いつも ある`, async () => {
      const { repo } = await newProfile();
      await mountGame('magic-square', repo);
      await startLevel(label);
      if (has) {
        const btn = screen.getByRole('button', { name: /ヒント/ });
        fireEvent.click(btn);
        expect(screen.getByText(/どの せんも ごうけい/)).toBeTruthy();
      } else {
        expect(screen.queryByRole('button', { name: /ヒント/ })).toBeNull();
        expect(screen.queryByText(/どの せんも ごうけい/)).toBeNull();
      }
      // たて・よこ・ななめの 合計（「とちゅう」を ふくむ）は のこす
      expect(screen.getByTestId('sum-0')).toBeTruthy();
      expect(screen.getByTestId(`sum-${label === 'チャレンジ' ? 9 : 7}`)).toBeTruthy();
      expect(document.querySelectorAll('[data-state="partial"], [data-state="ok"], [data-state="ng"]').length).toBeGreaterThan(0);
    });

  it('むずかしい：ヒントを つかった 途中保存（前の 版）から つづけても ヒントは 出ず、盤面の 光る 線も 出ない。正解まで あそべる', async () => {
    const { repo, prof } = await newProfile();
    const puzzle = generatePuzzle(GAME_BY_ID['magic-square'].logic, createRng(5), 'hard').puzzle as MagicPuzzle;
    await repo.saveSession({
      id: 's1',
      profileId: prof.id,
      mode: 'game',
      gameId: 'magic-square',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: 'inProgress',
      settingsSnapshot: { difficulty: 'hard' },
      activeDraft: { difficulty: 'hard', round: { puzzle, attemptId: 'a1', startedAt: Date.now(), submits: 0, wrong: 0, hints: 2, solved: false, found: [] }, view: undefined },
    });
    await mountGame('magic-square', repo);
    fireEvent.click(await screen.findByRole('button', { name: 'つづきから' }, { timeout: 3000 }));
    await screen.findByRole('button', { name: 'ちがう もんだいに する' });
    expect(screen.queryByRole('button', { name: /ヒント/ })).toBeNull();
    expect(screen.queryByText(/どの せんも ごうけい/)).toBeNull();
    for (let li = 0; li < 8; li++) expect(screen.getByTestId(`sum-${li}`).style.outline).toBe('');
    // ヒントなしで 正解まで
    const sol = solveMagic(puzzle.givens, 3).first!;
    for (let i = 0; i < 9; i++)
      if (puzzle.givens[i] === 0) {
        fireEvent.click(screen.getByTestId(`magic-cell-${i}`));
        fireEvent.click(within(screen.getByRole('group', { name: 'かずを えらぶ' })).getByRole('button', { name: new RegExp(`^${sol[i]}$`) }));
      }
    fireEvent.click(screen.getByRole('button', { name: 'こたえあわせ' }));
    expect(await screen.findByText(/せいかい！/)).toBeTruthy();
    await waitFor(async () => expect((await repo.listAttempts(prof.id)).at(-1)).toMatchObject({ finalCorrect: true, hintsUsed: 2 }));
  });

  it('ほかの ゲームの むずかしい・チャレンジは ヒントのまま（数独・ブロック）', async () => {
    for (const [id, label] of [
      ['sudoku', 'チャレンジ'],
      ['block-builder', 'むずかしい'],
    ] as [GameId, string][]) {
      const { repo } = await newProfile();
      const v = await mountGame(id, repo);
      await startLevel(label);
      expect(screen.getByRole('button', { name: /ヒント/ })).toBeTruthy();
      v.unmount();
    }
  });
});

describe('v1.7.1 すうじたんてい：履歴は 2れつ × 5だん（10かいぶんの 枠）', () => {
  const mountDetective = async (seed = 11) => {
    const { repo, prof } = await newProfile();
    await repo.saveSettings({ ...defaultSettings(prof.id), numberDetectiveDeck: { v: 1, seed, next: 0 } });
    const Gate = () => (useApp().profile ? <NumberDetectiveScreen /> : null);
    const view = render(
      <AppProvider repo={repo}>
        <Gate />
      </AppProvider>,
    );
    fireEvent.click(await screen.findByRole('button', { name: 'すぐに あそぶ' }, { timeout: 3000 }));
    await screen.findByRole('group', { name: 'すうじボタン' });
    return { repo, prof, view, secret: deckOrder({ seed })[0] };
  };
  const enter = (g: string) => {
    const pad = within(screen.getByRole('group', { name: 'すうじボタン' }));
    for (const d of g) fireEvent.click(pad.getByRole('button', { name: new RegExp(`^${d}`) }));
    fireEvent.click(screen.getByRole('button', { name: 'この すうじで しつもん！' }));
  };
  const WRONG = ['012', '345', '678', '901', '234', '567', '890', '123', '456', '789', '102'];
  const cells = () => [...screen.getByTestId('detective-history').children] as HTMLElement[];

  it('はじめから 10この 枠（まだの 枠は 番号だけ）。左に 1〜5、右に 6〜10 が ならぶ 並べかた', async () => {
    await mountDetective();
    const list = screen.getByTestId('detective-history');
    expect(list.style.display).toBe('grid');
    expect(list.style.gridAutoFlow).toBe('column');
    expect(list.style.gridTemplateRows).toBe('repeat(5, auto)');
    expect(list.style.gridTemplateColumns).toBe('repeat(2, minmax(0, 1fr))');
    expect(cells()).toHaveLength(10);
    expect(screen.getAllByTestId('detective-empty')).toHaveLength(10);
    expect(cells().map((c) => c.textContent)).toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '9', '10']);
  });

  for (const n of [1, 5, 6, 9, 10])
    it(`${n}かい しつもん：枠は 10この まま、${n}こ うまり、さいごだけ 強調。ぴったり・ばしょちがい は 文字で のこる`, async () => {
      const { secret } = await mountDetective();
      const gs = WRONG.filter((g) => g !== secret).slice(0, n);
      for (const g of gs) enter(g);
      expect(cells()).toHaveLength(10);
      const rows = screen.getAllByTestId('detective-row');
      expect(rows).toHaveLength(n);
      expect(screen.queryAllByTestId('detective-empty')).toHaveLength(10 - n);
      // 1〜5 は 枠の 1〜5ばんめ（左の れつ）、6〜10 は 6〜10ばんめ（右の れつ）
      gs.forEach((g, i) => {
        const r = judgeGuess(secret, g);
        expect(cells()[i].getAttribute('aria-label')).toBe(`${i + 1}かいめ ${g.split('').join(' ')}：ぴったり ${r.eat}、ばしょちがい ${r.bite}`);
        expect(cells()[i].querySelector('[data-kind="eat"]')!.textContent).toBe(`ぴったり${r.eat}`);
        expect(cells()[i].querySelector('[data-kind="bite"]')!.textContent).toBe(`ばしょちがい${r.bite}`);
        expect(cells()[i].textContent).not.toMatch(/EAT|BITE/);
        expect(cells()[i].textContent).toContain(g);
      });
      expect(rows.filter((r) => r.dataset.latest === 'true')).toEqual([rows[n - 1]]);
      // 10かいめでも 1かいめの けっかが 見える（スクロールの 箱に 入って いない）
      expect(screen.getByTestId('detective-history').style.overflowY).toBe('');
      expect(screen.getByTestId('detective-history').style.maxHeight).toBe('');
    });

  it('クリアの あと：けっかは 上の 1か所に まとめ、入力の かわりに「もういちど」「いちらんへ」', async () => {
    const { secret } = await mountDetective();
    enter(WRONG.filter((g) => g !== secret)[0]);
    enter(secret);
    expect(screen.getAllByTestId('detective-result')).toHaveLength(1);
    expect(screen.getByTestId('detective-result').textContent).toBe('せいかい！2かいで あてたよ！');
    expect(screen.queryByRole('group', { name: 'すうじボタン' })).toBeNull();
    expect(screen.getByRole('button', { name: 'もういちど あそぶ' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'ゲーム いちらんへ' })).toBeTruthy();
    expect(screen.getAllByTestId('detective-row')).toHaveLength(2);
  });

  it('つづきから：枠と 履歴の 位置が そのまま もどる', async () => {
    const { secret, repo, view } = await mountDetective();
    const gs = WRONG.filter((g) => g !== secret).slice(0, 6);
    for (const g of gs) enter(g);
    view.unmount();
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    const Gate = () => (useApp().profile ? <NumberDetectiveScreen /> : null);
    render(
      <AppProvider repo={repo}>
        <Gate />
      </AppProvider>,
    );
    fireEvent.click(await screen.findByRole('button', { name: 'つづきから' }, { timeout: 3000 }));
    await screen.findByRole('group', { name: 'すうじボタン' });
    expect(cells()).toHaveLength(10);
    expect(screen.getAllByTestId('detective-row').map((r) => r.getAttribute('aria-label')!.split('：')[0])).toEqual(gs.map((g, i) => `${i + 1}かいめ ${g.split('').join(' ')}`));
    expect(screen.getAllByTestId('detective-row')[5].dataset.latest).toBe('true');
  });
});

describe('v1.7.1 魔法陣：むずかしさの ラベル', () => {
  it('むずかしい・チャレンジの せつめいに「ヒントなし」', () => {
    const n = GAME_BY_ID['magic-square'].difficultyNotes as Record<Difficulty, string>;
    expect(n.hard).toContain('ヒントなし');
    expect(n.challenge).toContain('ヒントなし');
    expect(n.easy).not.toContain('ヒントなし');
  });
});
