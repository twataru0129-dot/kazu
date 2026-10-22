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
