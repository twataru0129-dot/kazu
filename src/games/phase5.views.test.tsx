import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ComponentType } from 'react';
import { AppProvider } from '../app/AppContext';
import { memoryBackend } from '../persistence/db';
import { Repo } from '../persistence/repo';
import { GAME_BY_ID } from '../domain/games/registry';
import type { GameId, Judgement } from '../domain/games/types';
import type { Difficulty } from '../domain/types';
import { GAME_VIEWS } from './views';
import type { PizzaPuzzle } from '../domain/games/pizzaFractions';
import type { BlockPuzzle } from '../domain/games/blockBuilder';
import type { MagicPuzzle } from '../domain/games/magicSquare';
import { act } from '@testing-library/react';

async function renderView(id: GameId, puzzle: unknown, extra: Record<string, unknown> = {}, difficulty: Difficulty = 'easy') {
  const repo = new Repo(memoryBackend());
  const prof = await repo.createProfile('t', 'fox');
  const results: Judgement[] = [];
  const logic = GAME_BY_ID[id].logic;
  const submit = vi.fn((a: unknown) => {
    const j = logic.judge(puzzle, a);
    results.push(j);
    return j;
  });
  const saveDraft = vi.fn();
  const View = GAME_VIEWS[id] as ComponentType<Record<string, unknown>>;
  sessionStorage.setItem('kazu.tabProfileId', prof.id);
  const el = (more: Record<string, unknown>) => (
    <AppProvider repo={repo}>
      <View puzzle={puzzle} difficulty={difficulty} submit={submit} solved={false} found={[]} hintLevel={0} saveDraft={saveDraft} reportProgress={() => undefined} status={null} {...extra} {...more} />
    </AppProvider>
  );
  const view = render(el({}));
  await screen.findAllByRole('button', {}, { timeout: 3000 });
  return { results, submit, saveDraft, view, repo, rerender: (more: Record<string, unknown>) => view.rerender(el(more)) };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('28 ピザで分数パズル（画面）', () => {
  const half4: PizzaPuzzle = { kind: 'make', target: { n: 1, d: 2 }, slices: 4 };
  const pieces = () => screen.getAllByRole('button', { name: /ばんめの ピース/ });

  it('ピースを タップで えらぶ・はずす。えらんだ 量が 分数で でる', async () => {
    await renderView('pizza-fractions', half4);
    expect(screen.getByTestId('pizza-question').textContent).toContain('はんぶん');
    expect(pieces()).toHaveLength(4);
    fireEvent.click(pieces()[2]);
    expect(pieces()[2].getAttribute('aria-pressed')).toBe('true');
    expect(within(screen.getByTestId('pizza-count')).getByLabelText('4ぶんの1')).toBeTruthy();
    fireEvent.click(pieces()[2]);
    expect(pieces()[2].getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByRole('button', { name: 'これで できた！' })).toHaveProperty('disabled', true);
  });

  it('はなれた ピースを えらんでも 量が あえば 正解。多いと やさしく おしえる', async () => {
    const { results } = await renderView('pizza-fractions', half4);
    fireEvent.click(pieces()[0]);
    fireEvent.click(pieces()[1]);
    fireEvent.click(pieces()[3]);
    fireEvent.click(screen.getByRole('button', { name: 'これで できた！' }));
    expect(results[0].correct).toBe(false);
    expect(results[0].message).toContain('おおい');
    // まちがえても えらんだ ピースは のこる
    expect(pieces().filter((b) => b.getAttribute('aria-pressed') === 'true')).toHaveLength(3);
    fireEvent.click(pieces()[1]);
    fireEvent.click(screen.getByRole('button', { name: 'これで できた！' }));
    expect(results[1].correct).toBe(true);
  });

  it('「1きれ ふやす」「1きれ へらす」と キーボード（Enter・スペース）でも えらべる', async () => {
    const { results } = await renderView('pizza-fractions', half4);
    const more = screen.getByRole('button', { name: '1きれ ふやす' });
    const less = screen.getByRole('button', { name: '1きれ へらす' });
    expect(less).toHaveProperty('disabled', true);
    fireEvent.click(more);
    fireEvent.click(more);
    fireEvent.click(more);
    expect(within(screen.getByTestId('pizza-count')).getByLabelText('4ぶんの3')).toBeTruthy();
    fireEvent.click(less);
    fireEvent.click(less);
    fireEvent.keyDown(pieces()[3], { key: 'Enter' });
    expect(pieces()[3].getAttribute('aria-pressed')).toBe('true');
    fireEvent.keyDown(pieces()[3], { key: ' ' });
    fireEvent.keyDown(pieces()[2], { key: ' ' });
    fireEvent.click(screen.getByRole('button', { name: 'これで できた！' }));
    expect(results[0].correct).toBe(true);
    fireEvent.click(more);
    fireEvent.click(more);
    fireEvent.click(more);
    expect(more).toHaveProperty('disabled', true);
  });

  it('ヒント2で めやすを だすが、ピースは かってに えらばない', async () => {
    const { rerender } = await renderView('pizza-fractions', half4);
    expect(screen.queryByTestId('pizza-guide')).toBeNull();
    rerender({ hintLevel: 2 });
    expect(screen.getByTestId('pizza-guide')).toBeTruthy();
    rerender({ hintLevel: 3 });
    expect(pieces().filter((b) => b.getAttribute('aria-pressed') === 'true')).toHaveLength(0);
  });

  it('せいかいの あと せつめい：「2きれは 4きれの はんぶん だね」', async () => {
    const { rerender } = await renderView('pizza-fractions', half4);
    fireEvent.click(pieces()[0]);
    fireEvent.click(pieces()[1]);
    rerender({ solved: true });
    expect(screen.getByTestId('pizza-explain').textContent).toBe('2きれは 4きれの はんぶん だね');
    expect(screen.getByRole('button', { name: '1きれ ふやす' })).toHaveProperty('disabled', true);
  });

  it('hard：ひだりは みるだけ、みぎで おなじ おおきさを つくる', async () => {
    const q: PizzaPuzzle = { kind: 'equal', left: { n: 2, d: 3 }, slices: 6 };
    const { results, rerender } = await renderView('pizza-fractions', q, {}, 'hard');
    expect(screen.getByRole('group', { name: /ひだりの ピザ/ })).toBeTruthy();
    expect(pieces()).toHaveLength(6);
    for (const i of [0, 2, 4, 5]) fireEvent.click(pieces()[i]);
    fireEvent.click(screen.getByRole('button', { name: 'これで できた！' }));
    expect(results[0].correct).toBe(true);
    rerender({ solved: true });
    expect(screen.getByTestId('pizza-explain').textContent).toContain('2/3 と 4/6 は おなじ おおきさ');
  });

  it('challenge：しきを だし、こたえの ピザで つくる', async () => {
    const q: PizzaPuzzle = { kind: 'op', a: { n: 1, d: 3 }, b: { n: 1, d: 6 }, op: '+', slices: 6 };
    const { results } = await renderView('pizza-fractions', q, {}, 'challenge');
    expect(screen.getByLabelText('たす')).toBeTruthy();
    expect(pieces()).toHaveLength(6);
    for (const i of [0, 1, 2]) fireEvent.click(pieces()[i]);
    fireEvent.click(screen.getByRole('button', { name: 'これで できた！' }));
    expect(results[0].correct).toBe(true);
  });
});

describe('29 ブロック建築パズル（画面）', () => {
  const p: BlockPuzzle = { size: 2, maxH: 2, showNumbers: true, heights: [[1, 0], [2, 1]] };
  const cell = (x: number, y: number) => within(screen.getByTestId('block-map')).getAllByRole('gridcell').find((b) => b.dataset.x === String(x) && b.dataset.y === String(y))!;
  const plus = () => fireEvent.click(screen.getByRole('button', { name: '1だん ふやす' }));
  const minus = () => fireEvent.click(screen.getByRole('button', { name: '1だん へらす' }));
  const build = (h: number[][]) => {
    h.forEach((row, y) =>
      row.forEach((v, x) => {
        fireEvent.click(cell(x, y));
        for (let k = 0; k < v; k++) plus();
      }),
    );
  };

  it('じめんの マスを えらんで ＋・− 。0〜さいだいで とまる', async () => {
    const { saveDraft } = await renderView('block-builder', p);
    expect(within(screen.getByTestId('block-map')).getAllByRole('gridcell')).toHaveLength(4);
    fireEvent.click(cell(1, 0));
    expect(cell(1, 0).getAttribute('aria-selected')).toBe('true');
    plus();
    plus();
    expect(screen.getByRole('button', { name: '1だん ふやす' })).toHaveProperty('disabled', true);
    expect(screen.getByTestId('block-selected-height').textContent).toBe('2だん');
    expect(cell(1, 0).textContent).toBe('2');
    minus();
    minus();
    expect(screen.getByRole('button', { name: '1だん へらす' })).toHaveProperty('disabled', true);
    expect(saveDraft).toHaveBeenLastCalledWith(expect.objectContaining({ heights: [[0, 0], [0, 0]], sel: { x: 1, y: 0 }, rot: 0 }));
  });

  it('おなじ かたちで 正解。まちがえても つんだ ものは のこる', async () => {
    const { results } = await renderView('block-builder', p);
    build([[1, 0], [2, 0]]);
    fireEvent.click(screen.getByRole('button', { name: 'こたえあわせ' }));
    expect(results[0].correct).toBe(false);
    expect(cell(0, 1).textContent).toBe('2');
    fireEvent.click(cell(1, 1));
    plus();
    fireEvent.click(screen.getByRole('button', { name: 'こたえあわせ' }));
    expect(results[1].correct).toBe(true);
  });

  it('まわしても データと 判定は かわらない。地図も 立体と おなじ 向きで まわる', async () => {
    const { results, saveDraft } = await renderView('block-builder', p);
    build([[1, 0], [2, 1]]);
    const before = within(screen.getByTestId('block-map')).getAllByRole('gridcell').map((b) => `${b.dataset.x}${b.dataset.y}`);
    fireEvent.click(screen.getByRole('button', { name: 'みぎに まわす' }));
    expect(screen.getByTestId('block-own').getAttribute('data-rot')).toBe('1');
    expect(screen.getByTestId('block-model').getAttribute('data-rot')).toBe('1');
    const after = within(screen.getByTestId('block-map')).getAllByRole('gridcell').map((b) => `${b.dataset.x}${b.dataset.y}`);
    expect(after).not.toEqual(before);
    expect([...after].sort()).toEqual([...before].sort());
    expect(saveDraft).toHaveBeenLastCalledWith(expect.objectContaining({ heights: [[1, 0], [2, 1]], rot: 1 }));
    fireEvent.click(screen.getByRole('button', { name: 'ひだりに まわす' }));
    fireEvent.click(screen.getByRole('button', { name: 'ひだりに まわす' }));
    expect(screen.getByTestId('block-own').getAttribute('data-rot')).toBe('3');
    fireEvent.click(screen.getByRole('button', { name: 'こたえあわせ' }));
    expect(results[0].correct).toBe(true);
  });

  it('ひとつ もどす・やりなおす（たしかめて から）', async () => {
    await renderView('block-builder', p);
    build([[1, 0], [0, 0]]);
    fireEvent.click(cell(1, 1));
    plus();
    fireEvent.click(screen.getByRole('button', { name: 'ひとつ もどす' }));
    expect(cell(1, 1).textContent).toBe('0');
    expect(cell(0, 0).textContent).toBe('1');
    fireEvent.click(screen.getByRole('button', { name: 'やりなおす' }));
    expect(screen.getByText('つんだ ブロックを ぜんぶ かたづけるよ。')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'やめる' }));
    expect(cell(0, 0).textContent).toBe('1');
    fireEvent.click(screen.getByRole('button', { name: 'やりなおす' }));
    within(screen.getByRole('dialog')).getAllByRole('button', { name: 'やりなおす' }).forEach((b) => fireEvent.click(b));
    expect(cell(0, 0).textContent).toBe('0');
    // やりなおしも もどせる
    fireEvent.click(screen.getByRole('button', { name: 'ひとつ もどす' }));
    expect(cell(0, 0).textContent).toBe('1');
  });

  it('キーボード：矢印で えらび、＋・− で つむ', async () => {
    await renderView('block-builder', p);
    // はじめは まえの ひだり（0,1）
    expect(cell(0, 1).getAttribute('aria-selected')).toBe('true');
    fireEvent.keyDown(window, { key: '+' });
    fireEvent.keyDown(window, { key: 'ArrowUp' });
    expect(cell(0, 0).getAttribute('aria-selected')).toBe('true');
    fireEvent.keyDown(window, { key: '+' });
    fireEvent.keyDown(window, { key: '+' });
    fireEvent.keyDown(window, { key: '-' });
    expect(cell(0, 0).textContent).toBe('1');
    expect(cell(0, 1).textContent).toBe('1');
  });

  it('つづきから：下書きの 形・えらんだ マス・向き・もどす記録を もどす', async () => {
    await renderView('block-builder', p, { draft: { heights: [[1, 0], [2, 0]], sel: { x: 1, y: 1 }, rot: 2, history: [[[1, 0], [1, 0]]] } });
    expect(cell(0, 1).textContent).toBe('2');
    expect(cell(1, 1).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByTestId('block-own').getAttribute('data-rot')).toBe('2');
    fireEvent.click(screen.getByRole('button', { name: 'ひとつ もどす' }));
    expect(cell(0, 1).textContent).toBe('1');
  });

  it('こわれた 下書きは つかわない（はんいの そと）', async () => {
    await renderView('block-builder', p, { draft: { heights: [[9, 0], [0, 0]], sel: { x: 5, y: 0 }, rot: 1.5, history: 'x' } });
    expect(cell(0, 0).textContent).toBe('0');
    expect(screen.getByTestId('block-own').getAttribute('data-rot')).toBe('0');
  });

  it('ヒント2で ちがう マスを 1つ しめす（かってに なおさない）', async () => {
    const { rerender } = await renderView('block-builder', p);
    build([[1, 0], [0, 0]]);
    rerender({ hintLevel: 2 });
    const marked = within(screen.getByTestId('block-map'))
      .getAllByRole('gridcell')
      .filter((b) => b.getAttribute('aria-label')!.includes('ちがう ところ'));
    expect(marked).toHaveLength(1);
    expect(marked[0].dataset.y).toBe('1');
    expect(cell(0, 1).textContent).toBe('0');
  });

  it('easy は お手本に だんの すうじ、challenge は 出さない', async () => {
    await renderView('block-builder', p);
    expect(within(screen.getByTestId('block-model')).getAllByText(/^[0-2]$/)).toHaveLength(4);
  });
  it('challenge：すうじなし（うえから みても 出さない）', async () => {
    const q: BlockPuzzle = { size: 4, maxH: 4, showNumbers: false, heights: [[0, 1, 2, 3], [4, 0, 1, 2], [3, 4, 0, 1], [2, 3, 4, 1]] };
    await renderView('block-builder', q, {}, 'challenge');
    expect(within(screen.getByTestId('block-model')).queryAllByText(/^[0-4]$/)).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: 'うえから みる（おてほんと じぶん）' }));
    expect(screen.getByTestId('block-model').getAttribute('data-view')).toBe('top');
    expect(within(screen.getByTestId('block-model')).queryAllByText(/^[0-4]$/)).toHaveLength(0);
    expect(within(screen.getByTestId('block-map')).getAllByRole('gridcell')).toHaveLength(16);
  });
});

describe('29 ブロック建築パズル：うえから みる（v1.6.1）', () => {
  const toggle = () => fireEvent.click(screen.getByRole('button', { name: 'うえから みる（おてほんと じぶん）' }));
  const view = (id: string) => screen.getByTestId(id).getAttribute('data-view');
  const rotOf = (id: string) => screen.getByTestId(id).getAttribute('data-rot');
  /** 上から 見た 図の マス（データの 位置で） */
  const topCell = (id: string, x: number, y: number) => screen.getByTestId(id).querySelector<SVGGElement>(`[data-testid="top-cell"][data-x="${x}"][data-y="${y}"]`)!;
  const mapCell = (x: number, y: number) => within(screen.getByTestId('block-map')).getAllByRole('gridcell').find((b) => b.dataset.x === String(x) && b.dataset.y === String(y))!;
  /** だんごとの うえの 面の いろ（1 あお・2 みどり・3 きいろ・4 あか） */
  const TOP_COLOR = ['#9fd3ff', '#a8e6b8', '#ffe28a', '#ffb3a1'];
  const ring = (center: number): BlockPuzzle => ({ size: 3, maxH: 4, showNumbers: false, heights: [[4, 4, 4], [4, center, 4], [4, 4, 4]] });

  const levels: [Difficulty, BlockPuzzle][] = [
    ['easy', { size: 2, maxH: 2, showNumbers: true, heights: [[1, 0], [2, 1]] }],
    ['normal', { size: 3, maxH: 3, showNumbers: false, heights: [[0, 1, 2], [1, 3, 0], [2, 0, 1]] }],
    ['hard', ring(1)],
    ['challenge', { size: 4, maxH: 4, showNumbers: false, heights: [[0, 1, 2, 3], [4, 0, 1, 2], [3, 4, 0, 1], [2, 3, 4, 1]] }],
  ];
  for (const [d, q] of levels)
    it(`${d}：「うえから」で お手本と じぶんが いっしょに きりかわり、もう いちど おすと 立体に もどる`, async () => {
      await renderView('block-builder', q, {}, d);
      const btn = screen.getByRole('button', { name: 'うえから みる（おてほんと じぶん）' });
      expect(btn.getAttribute('aria-pressed')).toBe('false');
      expect([view('block-model'), view('block-own')]).toEqual(['iso', 'iso']);
      toggle();
      expect(btn.getAttribute('aria-pressed')).toBe('true');
      expect([view('block-model'), view('block-own')]).toEqual(['top', 'top']);
      expect(screen.getByTestId('block-model').querySelectorAll('[data-testid="top-cell"]')).toHaveLength(q.size * q.size);
      toggle();
      expect([view('block-model'), view('block-own')]).toEqual(['iso', 'iso']);
    });

  for (const center of [0, 1, 2, 3])
    it(`まわりが 4だんで まんなかが ${center}だん：うえから みると まんなかの ようすと 高さの いろが わかる（すうじは 出さない）`, async () => {
      await renderView('block-builder', ring(center), {}, 'hard');
      toggle();
      const c = topCell('block-model', 1, 1);
      expect(c.getAttribute('data-h')).toBe(String(center));
      expect(c.getAttribute('data-empty')).toBe(center === 0 ? 'true' : 'false');
      if (center > 0) expect(c.getAttribute('data-color')).toBe(TOP_COLOR[center - 1]);
      // 0だんは 点線の 空きマス（いろだけに たよらない）
      if (center === 0) expect(c.querySelector('polygon')!.getAttribute('stroke-dasharray')).toBeTruthy();
      // まわりの 4だんは あか。まんなかと 見わけが つく
      expect(topCell('block-model', 0, 0).getAttribute('data-color')).toBe(TOP_COLOR[3]);
      expect(within(screen.getByTestId('block-model')).queryAllByText(/^[0-4]$/)).toHaveLength(0);
      // どの 向きに まわしても まんなかは おなじ
      for (let k = 0; k < 4; k++) {
        fireEvent.click(screen.getByRole('button', { name: 'みぎに まわす' }));
        expect(topCell('block-model', 1, 1).getAttribute('data-h')).toBe(String(center));
      }
    });

  it('うえからの まま まわせて、立体に もどしても 向きは そのまま。ブロックは かわらない', async () => {
    const q: BlockPuzzle = { size: 2, maxH: 2, showNumbers: true, heights: [[1, 0], [2, 1]] };
    const { saveDraft } = await renderView('block-builder', q);
    fireEvent.click(mapCell(1, 1));
    fireEvent.click(screen.getByRole('button', { name: '1だん ふやす' }));
    toggle();
    fireEvent.click(screen.getByRole('button', { name: 'みぎに まわす' }));
    expect([rotOf('block-model'), rotOf('block-own')]).toEqual(['1', '1']);
    // 上から 見た 図の 置き場所も まわった 向きで ならぶ（データの 位置は かわらない）
    expect(topCell('block-own', 1, 1).getAttribute('data-h')).toBe('1');
    toggle();
    expect([view('block-model'), view('block-own')]).toEqual(['iso', 'iso']);
    expect([rotOf('block-model'), rotOf('block-own')]).toEqual(['1', '1']);
    expect(mapCell(1, 1).textContent).toBe('1');
    expect(saveDraft).toHaveBeenLastCalledWith(expect.objectContaining({ heights: [[0, 0], [0, 1]], rot: 1, top: false }));
  });

  it('うえからの じぶんの マスを タップして えらび、＋・−・もどすが つかえる', async () => {
    const { saveDraft, results } = await renderView('block-builder', ring(2), {}, 'hard');
    toggle();
    fireEvent.click(topCell('block-own', 1, 1));
    expect(mapCell(1, 1).getAttribute('aria-selected')).toBe('true');
    const plus = () => fireEvent.click(screen.getByRole('button', { name: '1だん ふやす' }));
    plus();
    plus();
    plus();
    fireEvent.click(screen.getByRole('button', { name: '1だん へらす' }));
    expect(topCell('block-own', 1, 1).getAttribute('data-h')).toBe('2');
    fireEvent.click(screen.getByRole('button', { name: 'ひとつ もどす' }));
    expect(topCell('block-own', 1, 1).getAttribute('data-h')).toBe('3');
    fireEvent.click(screen.getByRole('button', { name: 'ひとつ もどす' }));
    expect(topCell('block-own', 1, 1).getAttribute('data-h')).toBe('2');
    expect(saveDraft).toHaveBeenLastCalledWith(expect.objectContaining({ sel: { x: 1, y: 1 }, top: true }));
    // まわりを つんで こたえあわせ（向きを かえても 判定は おなじ）
    for (const [x, y] of [[0, 0], [1, 0], [2, 0], [0, 1], [2, 1], [0, 2], [1, 2], [2, 2]]) {
      fireEvent.click(topCell('block-own', x, y));
      for (let k = 0; k < 4; k++) plus();
    }
    fireEvent.click(screen.getByRole('button', { name: 'ひだりに まわす' }));
    fireEvent.click(screen.getByRole('button', { name: 'こたえあわせ' }));
    expect(results.at(-1)!.correct).toBe(true);
  });

  it('つづきから：うえからの まま・向き・形が もどる。v1.6.0 の 下書き（top なし）は 立体で ひらく', async () => {
    const q = ring(1);
    const { view: v1 } = await renderView('block-builder', q, { draft: { heights: [[4, 4, 0], [0, 0, 0], [0, 0, 0]], sel: { x: 1, y: 1 }, rot: 3, history: [], top: true } }, 'hard');
    expect([view('block-model'), view('block-own')]).toEqual(['top', 'top']);
    expect(rotOf('block-own')).toBe('3');
    expect(topCell('block-own', 0, 0).getAttribute('data-h')).toBe('4');
    v1.unmount();
    await renderView('block-builder', q, { draft: { heights: [[4, 4, 0], [0, 0, 0], [0, 0, 0]], sel: { x: 1, y: 1 }, rot: 3, history: [] } }, 'hard');
    expect([view('block-model'), view('block-own')]).toEqual(['iso', 'iso']);
    expect(mapCell(0, 0).textContent).toBe('4');
  });
});

describe('30 魔法陣パズル（画面）', () => {
  const p: MagicPuzzle = { n: 3, givens: [2, 7, 0, 9, 5, 1, 4, 0, 0] };
  const cellEl = (i: number) => screen.getByTestId(`magic-cell-${i}`);
  const num = (v: number) => screen.getByRole('button', { name: new RegExp(`^${v}(（つかった）)?$`) });

  it('あいた マスに パレットで いれる。いれたら つぎの あきへ。はじめの かずは さわれない', async () => {
    const { saveDraft } = await renderView('magic-square', p);
    expect(cellEl(2).getAttribute('aria-selected')).toBe('true');
    expect(cellEl(0)).toHaveProperty('disabled', true);
    expect(screen.getByTestId('magic-remaining').textContent).toContain('3');
    fireEvent.click(num(6));
    expect(cellEl(2).textContent).toBe('6');
    expect(cellEl(7).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByTestId('magic-remaining').textContent).toContain('2');
    expect(saveDraft).toHaveBeenLastCalledWith(expect.objectContaining({ cells: [2, 7, 6, 9, 5, 1, 4, 0, 0], sel: 7 }));
  });

  it('つかった かずは えらべない（おなじ かずを 2かい おかない）', async () => {
    await renderView('magic-square', p);
    expect(num(2)).toHaveProperty('disabled', true);
    expect(num(2).getAttribute('aria-label')).toBe('2（つかった）');
    fireEvent.click(num(6));
    expect(num(6)).toHaveProperty('disabled', true);
    // えらんで いる マスに はいって いる かずは えらびなおせる（そのまま）
    fireEvent.click(cellEl(2));
    expect(num(6)).toHaveProperty('disabled', false);
  });

  it('列の 合計：うまって いない 列は「とちゅうの ごうけい」、うまって 15 なら できた', async () => {
    await renderView('magic-square', p);
    expect(screen.getByTestId('sum-0').getAttribute('data-state')).toBe('partial');
    expect(screen.getByTestId('sum-0').getAttribute('aria-label')).toContain('とちゅうの ごうけい 9');
    expect(screen.getByTestId('sum-1').getAttribute('data-state')).toBe('ok');
    fireEvent.click(num(8));
    expect(screen.getByTestId('sum-0').getAttribute('data-state')).toBe('ng');
    expect(screen.getByTestId('sum-0').textContent).toContain('≠');
  });

  it('けす・もどす・こたえあわせ。まちがえても いれた かずは のこる', async () => {
    const { results } = await renderView('magic-square', p);
    fireEvent.click(num(8));
    fireEvent.click(num(3));
    fireEvent.click(num(6));
    fireEvent.click(screen.getByRole('button', { name: 'こたえあわせ' }));
    expect(results[0].correct).toBe(false);
    expect(results[0].message).toContain('もうすこし！');
    expect(cellEl(2).textContent).toBe('8');
    fireEvent.click(cellEl(2));
    fireEvent.click(screen.getByRole('button', { name: 'けす' }));
    expect(cellEl(2).textContent).toBe('');
    fireEvent.click(screen.getByRole('button', { name: 'もどす' }));
    expect(cellEl(2).textContent).toBe('8');
    fireEvent.click(cellEl(2));
    fireEvent.click(screen.getByRole('button', { name: 'けす' }));
    fireEvent.click(cellEl(8));
    fireEvent.click(screen.getByRole('button', { name: 'けす' }));
    fireEvent.click(cellEl(2));
    fireEvent.click(num(6));
    fireEvent.click(cellEl(8));
    fireEvent.click(num(8));
    fireEvent.click(screen.getByRole('button', { name: 'こたえあわせ' }));
    expect(results[1].correct).toBe(true);
  });

  it('キーボード：すうじ・矢印・Backspace', async () => {
    await renderView('magic-square', p);
    fireEvent.keyDown(window, { key: '6' });
    expect(cellEl(2).textContent).toBe('6');
    fireEvent.keyDown(window, { key: '7' }); // つかって いるので いれない
    expect(cellEl(7).textContent).toBe('');
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(cellEl(8).getAttribute('aria-selected')).toBe('true');
    fireEvent.keyDown(window, { key: '8' });
    expect(cellEl(8).textContent).toBe('8');
    // いれたら つぎの あき（7）へ。もどって けす
    expect(cellEl(7).getAttribute('aria-selected')).toBe('true');
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    fireEvent.keyDown(window, { key: 'Backspace' });
    expect(cellEl(8).textContent).toBe('');
  });

  it('4×4 は 2けた（1 の あとに 0〜6）を まって いれる', async () => {
    const q: MagicPuzzle = { n: 4, givens: [16, 3, 2, 13, 5, 10, 11, 8, 9, 6, 0, 12, 4, 0, 0, 0] };
    await renderView('magic-square', q, {}, 'challenge');
    vi.useFakeTimers({ shouldAdvanceTime: true });
    expect(cellEl(10).getAttribute('aria-selected')).toBe('true');
    // 1 だけ うって まつと 1
    fireEvent.keyDown(window, { key: '1' });
    expect(cellEl(10).textContent).toBe('');
    act(() => vi.advanceTimersByTime(1000));
    expect(cellEl(10).textContent).toBe('1');
    // 1・5 で 15
    expect(cellEl(13).getAttribute('aria-selected')).toBe('true');
    fireEvent.keyDown(window, { key: '1' });
    fireEvent.keyDown(window, { key: '5' });
    expect(cellEl(13).textContent).toBe('15');
    // 1・7 は 17 に ならない：1 は もう つかって いるので いれず、7 を あたらしく いれる
    fireEvent.keyDown(window, { key: '1' });
    fireEvent.keyDown(window, { key: '7' });
    expect(cellEl(14).textContent).toBe('7');
    // パレットは 16こ
    expect(screen.getByRole('group', { name: 'かずを えらぶ' }).querySelectorAll('button')).toHaveLength(16);
  });

  it('ヒント2で あきの すくない せんを しめす（かってに いれない）', async () => {
    const { rerender } = await renderView('magic-square', p);
    rerender({ hintLevel: 2 });
    const outlined = [0, 1, 2, 3, 4, 5, 6, 7].filter((li) => screen.getByTestId(`sum-${li}`).style.outline.includes('solid'));
    expect(outlined).toHaveLength(1);
    expect(cellEl(2).textContent).toBe('');
  });

  it('つづきから：下書きの かず・えらんだ マス・もどす記録。はじめの かずは 下書きで かわらない', async () => {
    await renderView('magic-square', p, { draft: { cells: [9, 7, 6, 9, 5, 1, 4, 3, 0], sel: 8, history: [[2, 7, 6, 9, 5, 1, 4, 0, 0]] } });
    expect(cellEl(0).textContent).toBe('2');
    expect(cellEl(2).textContent).toBe('6');
    expect(cellEl(7).textContent).toBe('3');
    expect(cellEl(8).getAttribute('aria-selected')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'もどす' }));
    expect(cellEl(7).textContent).toBe('');
  });

  it('easy は めあての 合計を いつも だす', async () => {
    await renderView('magic-square', p);
    expect(screen.getByTestId('magic-guide').textContent).toContain('15');
  });
});
