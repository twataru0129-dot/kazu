import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ComponentType } from 'react';
import { AppProvider, useApp } from '../app/AppContext';
import { memoryBackend } from '../persistence/db';
import { Repo } from '../persistence/repo';
import { createRng } from '../domain/random';
import { GAME_BY_ID } from '../domain/games/registry';
import { generatePuzzle, type GameId, type Judgement } from '../domain/games/types';
import type { Difficulty } from '../domain/types';
import { GAME_VIEWS } from './views';
import { GridCalcScreen } from '../screens/GridCalcScreen';
import { GRID_CALC_ID, type GridSummary } from '../domain/arithmetic/gridCalc';
import { clockAnswer, hourAngle, minuteAngle, toTime, type ClockPuzzle } from '../domain/games/clockMaster';
import { HUNT_ROUNDS, huntTargets, numberHunt, type NumberHuntAnswer, type NumberHuntPuzzle } from '../domain/games/numberHunt';

async function renderView(id: GameId, puzzle: unknown, extra: Record<string, unknown> = {}) {
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
  const view = render(
    <AppProvider repo={repo}>
      <View puzzle={puzzle} difficulty="easy" submit={submit} solved={false} found={[]} hintLevel={0} saveDraft={saveDraft} reportProgress={() => undefined} status={null} {...extra} />
    </AppProvider>,
  );
  await screen.findAllByRole('button', {}, { timeout: 3000 });
  return { results, submit, saveDraft, view, repo };
}
const gen = <P,>(logic: Parameters<typeof generatePuzzle>[0], seed: number, d: Difficulty) => generatePuzzle(logic, createRng(seed), d).puzzle as P;
const setHidden = (hidden: boolean) => {
  Object.defineProperty(document, 'visibilityState', { value: hidden ? 'hidden' : 'visible', configurable: true });
  document.dispatchEvent(new Event('visibilitychange'));
};
const key = (k: string) => fireEvent.keyDown(window, { key: k });

// jsdom には PointerEvent が ないので、座標を もてる MouseEvent で かわりに する
if (typeof window.PointerEvent === 'undefined') {
  class PE extends MouseEvent {
    pointerId: number;
    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init);
      this.pointerId = init.pointerId ?? 1;
    }
  }
  (window as unknown as { PointerEvent: typeof PE }).PointerEvent = PE;
}

afterEach(() => {
  vi.useRealTimers();
  setHidden(false);
});

describe('100マス計算（マスけいさん）', () => {
  const Gate = () => (useApp().profile ? <GridCalcScreen /> : null);
  const mount = async (repo?: Repo) => {
    const r = repo ?? new Repo(memoryBackend());
    if (!repo) {
      const prof = await r.createProfile('t', 'fox');
      sessionStorage.setItem('kazu.tabProfileId', prof.id);
    }
    const view = render(
      <AppProvider repo={r}>
        <Gate />
      </AppProvider>,
    );
    await screen.findByRole('button', { name: 'はじめる' }, { timeout: 3000 });
    return { repo: r, view };
  };
  const cells = () => within(screen.getByRole('grid', { name: 'マスけいさんの ひょう' })).getAllByRole('gridcell');
  /** マスの ラベル「a ＋ b：…」から こたえを 計算する（画面に 出ている かずだけを つかう） */
  const answerOf = (el: HTMLElement) => {
    const m = el.getAttribute('aria-label')!.match(/^(\d+) (.) (\d+)：/)!;
    const a = Number(m[1]);
    const b = Number(m[3]);
    return { '+': a + b, '−': a - b, '×': a * b, '÷': a / b }[m[2]]!;
  };
  const typeNumber = (n: number) => {
    for (const d of String(n)) fireEvent.click(within(screen.getByRole('group', { name: 'すうじキー' })).getByRole('button', { name: d }));
  };
  const sessionsOf = async (repo: Repo) => repo.listSessions((await repo.listProfiles())[0].id);

  it('かんたん・たしざん・タイマーなし が はじめの せってい。むずかしさで えらべる 演算が かわる', async () => {
    await mount();
    expect(screen.getByRole('radio', { name: /かんたん/ })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: /たしざん/ })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: 'ださない' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: /ひきざん/ })).toBeDisabled();
    fireEvent.click(screen.getByRole('radio', { name: /ふつう/ }));
    expect(screen.getByRole('radio', { name: /ひきざん/ })).toBeEnabled();
    expect(screen.getByRole('radio', { name: /かけざん/ })).toBeDisabled();
    fireEvent.click(screen.getByRole('radio', { name: /チャレンジ/ }));
    expect(screen.getByRole('radio', { name: /わりざん/ })).toBeEnabled();
    fireEvent.click(screen.getByRole('radio', { name: /わりざん/ }));
    // むずかしいに もどすと わりざんは えらべないので たしざんに もどる
    fireEvent.click(screen.getByRole('radio', { name: /むずかしい/ }));
    expect(screen.getByRole('radio', { name: /たしざん/ })).toHaveAttribute('aria-checked', 'true');
  });

  it('3×3：まちがいを なおして もういちど こたえあわせ → クリア。記録は 1まいの 盤として 別に のこる', async () => {
    const { repo } = await mount();
    fireEvent.click(screen.getByRole('button', { name: 'はじめる' }));
    expect(cells()).toHaveLength(9);
    expect(screen.getByRole('button', { name: 'こたえあわせ' })).toBeDisabled();
    // 1マスめは わざと まちがえる。あとは「つぎの マス」で すすむ
    for (let i = 0; i < 9; i++) {
      const el = cells()[i];
      fireEvent.click(el);
      typeNumber(i === 0 ? answerOf(el) + 1 : answerOf(el));
      fireEvent.click(screen.getByRole('button', { name: 'つぎの マス' }));
    }
    expect(screen.getByTestId('grid-count').textContent).toContain('いれた 9/9');
    fireEvent.click(screen.getByRole('button', { name: 'こたえあわせ' }));
    expect(cells()[0].getAttribute('aria-label')).toContain('（ちがう）');
    expect(cells()[1].getAttribute('aria-label')).toContain('（せいかい）');
    expect(screen.getByTestId('grid-count').textContent).toContain('せいかい 8');
    // なおす（さいしょの まちがいの マスが えらばれて いる）
    expect(cells()[0]).toHaveAttribute('aria-selected', 'true');
    fireEvent.click(within(screen.getByRole('group', { name: 'すうじキー' })).getByRole('button', { name: '1もじ けす' }));
    fireEvent.click(within(screen.getByRole('group', { name: 'すうじキー' })).getByRole('button', { name: '1もじ けす' }));
    typeNumber(answerOf(cells()[0]));
    expect(cells()[0].getAttribute('aria-label')).not.toContain('（ちがう）');
    fireEvent.click(screen.getByRole('button', { name: 'こたえあわせ' }));
    const result = await screen.findByTestId('grid-result');
    expect(result.textContent).toContain('9マス ぜんぶ できたね');
    expect(result.textContent).toContain('8/9マス');
    expect(result.textContent).toContain('なおした かいすう：1かい');
    await act(async () => {});
    const ss = (await sessionsOf(repo)).filter((s) => s.gameId === GRID_CALC_ID);
    expect(ss[0].status).toBe('completed');
    expect(ss[0].summary as GridSummary).toMatchObject({ difficulty: 'easy', op: 'add', cells: 9, firstCorrect: 8, fixes: 1, perfect: false, timerOn: false });
    const as = await repo.listAttempts((await repo.listProfiles())[0].id);
    expect(as).toHaveLength(1);
    expect(as[0]).toMatchObject({ mode: 'calculation', gameId: GRID_CALC_ID, levelKey: 'grid:easy:add', firstTryCorrect: false, finalCorrect: true, retryCount: 1 });
  });

  it('キーボード：数字・Enter（つぎの マス）・矢印・Backspace', async () => {
    await mount();
    fireEvent.click(screen.getByRole('button', { name: 'はじめる' }));
    key('7');
    key('2');
    expect(cells()[0].getAttribute('aria-label')).toContain('：72');
    key('Backspace');
    expect(cells()[0].getAttribute('aria-label')).toContain('：7');
    key('Enter');
    expect(cells()[1]).toHaveAttribute('aria-selected', 'true');
    key('ArrowDown');
    expect(cells()[4]).toHaveAttribute('aria-selected', 'true');
    key('ArrowLeft');
    key('ArrowLeft');
    key('ArrowLeft');
    expect(cells()[3]).toHaveAttribute('aria-selected', 'true');
    key('ArrowUp');
    expect(cells()[0]).toHaveAttribute('aria-selected', 'true');
  });

  it('途中保存：同じ 盤と 入力から つづける。「ぜんぶ けす」は たしかめてから', async () => {
    const { repo, view } = await mount();
    fireEvent.click(screen.getByRole('radio', { name: /ふつう/ }));
    fireEvent.click(screen.getByRole('radio', { name: /ひきざん/ }));
    fireEvent.click(screen.getByRole('button', { name: 'はじめる' }));
    expect(cells()).toHaveLength(25);
    const labels = cells().map((c) => c.getAttribute('aria-label')!.split('：')[0]);
    fireEvent.click(cells()[6]);
    typeNumber(answerOf(cells()[6]));
    view.unmount(); // 画面を はなれる（すぐ 保存）
    await act(async () => {});
    const draft = (await sessionsOf(repo)).find((s) => s.gameId === GRID_CALC_ID && s.status === 'inProgress');
    expect(draft?.activeDraft).toBeTruthy();
    await mount(repo);
    // つづきの カードは 記録を よみこんでから でる
    fireEvent.click(await screen.findByRole('button', { name: 'つづきから' }));
    expect(cells().map((c) => c.getAttribute('aria-label')!.split('：')[0])).toEqual(labels);
    expect(cells()[6].getAttribute('aria-label')).toContain(`：${answerOf(cells()[6])}`);
    expect(cells()[6]).toHaveAttribute('aria-selected', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'ぜんぶ けす' }));
    fireEvent.click(screen.getByRole('button', { name: 'やめる' }));
    expect(cells()[6].getAttribute('aria-label')).not.toContain('まだ');
    fireEvent.click(screen.getByRole('button', { name: 'ぜんぶ けす' }));
    fireEvent.click(screen.getByRole('button', { name: 'けす' }));
    expect(cells().every((c) => c.getAttribute('aria-label')!.endsWith('：まだ'))).toBe(true);
  });

  it('10×10：100マス あり、「ぜんたい」で ちいさく できる。タイマーは やすむ・かくれた あいだ とまる', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    await mount();
    fireEvent.click(screen.getByRole('radio', { name: /むずかしい/ }));
    fireEvent.click(screen.getByRole('radio', { name: /かけざん/ }));
    fireEvent.click(screen.getByRole('radio', { name: 'じかんを はかる' }));
    fireEvent.click(screen.getByRole('button', { name: 'はじめる' }));
    expect(cells()).toHaveLength(100);
    expect(screen.getByRole('button', { name: 'ぜんたいを みる' })).toBeInTheDocument();
    const t = () => screen.getByTestId('grid-timer').textContent!;
    await act(async () => {
      vi.advanceTimersByTime(3200);
    });
    const a = t();
    expect(a).toMatch(/^0:0[3-4]$/);
    fireEvent.click(screen.getByRole('button', { name: 'やすむ' }));
    await act(async () => {
      vi.advanceTimersByTime(10_000);
    });
    expect(t()).toBe(a);
    expect(screen.getByText('おやすみちゅう')).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: 'つづける' })[0]);
    await act(async () => {
      setHidden(true);
    });
    await act(async () => {
      vi.advanceTimersByTime(20_000);
    });
    expect(Number(t().split(':')[1])).toBeLessThanOrEqual(5);
  });
});

describe('26 とけいマスター', () => {
  it('かんたん：3つから えらぶ。まちがいは メッセージ、正しい じこくで 正解', async () => {
    const p = gen<ClockPuzzle>(GAME_BY_ID['clock-master'].logic, 2, 'easy');
    if (p.kind !== 'read' || !p.choices) throw new Error('easy read');
    const r = await renderView('clock-master', p);
    const group = screen.getByRole('group', { name: 'こたえを えらぶ' });
    expect(within(group).getAllByRole('button')).toHaveLength(3);
    const wrong = p.choices.findIndex((c) => c !== p.time);
    fireEvent.click(within(group).getAllByRole('button')[wrong]);
    expect(r.results.at(-1)?.correct).toBe(false);
    fireEvent.click(within(group).getAllByRole('button')[p.choices.indexOf(p.time)]);
    expect(r.results.at(-1)?.correct).toBe(true);
  });

  it('針の 位置：3じ30ぷんは 短針 105度（3と4の あいだ）・長針 180度。12じ59ふん・0ぷん も 正しい', async () => {
    for (const [t, h, m] of [
      [toTime(3, 30), 105, 180],
      [toTime(12, 59), 29.5, 354],
      [toTime(9, 0), 270, 0],
    ] as const) {
      const r = await renderView('clock-master', { difficulty: 'hard', kind: 'read', time: t } satisfies ClockPuzzle);
      const svg = screen.getByRole('img', { name: 'とけい' });
      expect(Number(svg.getAttribute('data-hour-angle'))).toBe(h);
      expect(Number(svg.getAttribute('data-minute-angle'))).toBe(m);
      expect([hourAngle(t), minuteAngle(t)]).toEqual([h, m]);
      r.view.unmount();
    }
  });

  it('むずかしい：じ・ふん を 数字で いれる（12じ も 1じ も ただしく）', async () => {
    const p: ClockPuzzle = { difficulty: 'hard', kind: 'read', time: toTime(12, 7) };
    const r = await renderView('clock-master', p);
    const pad = () => within(screen.getByRole('group', { name: 'すうじキー' }));
    fireEvent.click(pad().getByRole('button', { name: '1' }));
    fireEvent.click(pad().getByRole('button', { name: '2' }));
    fireEvent.click(pad().getByRole('button', { name: 'つぎ' }));
    fireEvent.click(pad().getByRole('button', { name: '7' }));
    fireEvent.click(pad().getByRole('button', { name: 'こたえる' }));
    expect(r.results.at(-1)?.correct).toBe(true);
    r.view.unmount();
    // 13じ は いれられない
    await renderView('clock-master', p);
    fireEvent.click(screen.getByRole('button', { name: /なんじ/ }));
    fireEvent.click(pad().getByRole('button', { name: '1' }));
    fireEvent.click(pad().getByRole('button', { name: '3' }));
    fireEvent.click(screen.getByRole('button', { name: /なんぷん/ }));
    fireEvent.click(pad().getByRole('button', { name: '5' }));
    fireEvent.click(pad().getByRole('button', { name: 'こたえる' }));
    expect(screen.getByRole('alert').textContent).toContain('1〜12じ');
  });

  it('針を うごかす：ボタン（じかん・ふん ±）で 指定の じこくに。12を こえると じも すすむ', async () => {
    const p: ClockPuzzle = { difficulty: 'hard', kind: 'set', time: toTime(4, 3), start: toTime(2, 55), step: 1 };
    const r = await renderView('clock-master', p);
    const svg = () => screen.getByRole('img', { name: /^とけい：/ });
    fireEvent.click(screen.getByRole('button', { name: 'ふん ＋5' })); // 2:55 → 3:00
    expect(svg().getAttribute('aria-label')).toBe('とけい：3じ');
    fireEvent.click(screen.getByRole('button', { name: 'じかん ＋1' })); // 4:00
    for (let i = 0; i < 3; i++) fireEvent.click(screen.getByRole('button', { name: 'ふん ＋1' }));
    expect(svg().getAttribute('aria-label')).toBe('とけい：4じ3ぷん');
    expect(Number(svg().getAttribute('data-hour-angle'))).toBe(121.5);
    fireEvent.click(screen.getByRole('button', { name: 'これで できた！' }));
    expect(r.results.at(-1)?.correct).toBe(true);
  });

  it('針を ドラッグ：そとがわは 長針（5ふんごと）、まんなかは 短針', async () => {
    const p: ClockPuzzle = { difficulty: 'normal', kind: 'set', time: toTime(7, 15), start: toTime(6, 50), step: 5 };
    const r = await renderView('clock-master', p);
    const svg = screen.getByRole('img', { name: /^とけい：/ });
    svg.getBoundingClientRect = () => ({ left: 0, top: 0, width: 250, height: 250, right: 250, bottom: 250, x: 0, y: 0, toJSON: () => ({}) });
    const at = (deg: number, r0: number) => ({ clientX: 125 + Math.sin((deg * Math.PI) / 180) * r0, clientY: 125 - Math.cos((deg * Math.PI) / 180) * r0, pointerId: 1 });
    // 長針を 50ぷん → 0 → 15ふん（12を こえるので 7じに なる）
    fireEvent.pointerDown(svg, at(300, 100));
    fireEvent.pointerMove(svg, at(350, 100));
    fireEvent.pointerMove(svg, at(10, 100));
    fireEvent.pointerMove(svg, at(90, 100));
    fireEvent.pointerUp(svg);
    expect(svg.getAttribute('aria-label')).toBe('とけい：7じ15ふん');
    // 短針を 9 の ほうへ → 9じ15ふん。もういちど 7 に もどす
    fireEvent.pointerDown(svg, at(225, 30));
    fireEvent.pointerMove(svg, at(275, 30));
    fireEvent.pointerUp(svg);
    expect(svg.getAttribute('aria-label')).toBe('とけい：9じ15ふん');
    fireEvent.pointerDown(svg, at(275, 30));
    fireEvent.pointerMove(svg, at(215, 30));
    fireEvent.pointerUp(svg);
    fireEvent.click(screen.getByRole('button', { name: 'これで できた！' }));
    expect(r.results.at(-1)?.correct).toBe(true);
  });

  it('チャレンジ：なんぷん あいだ を 数字で。ヒント3で 5ふんごとの すうじが でる', async () => {
    const p: ClockPuzzle = { difficulty: 'challenge', kind: 'between', start: toTime(10, 50), end: toTime(11, 30), story: null };
    const r = await renderView('clock-master', p, { hintLevel: 3 });
    expect(screen.getAllByText('55').length).toBeGreaterThan(0); // 5ふんごとの すうじ（ヒント3）
    const pad = within(screen.getByRole('group', { name: 'すうじキー' }));
    fireEvent.click(pad.getByRole('button', { name: '4' }));
    fireEvent.click(pad.getByRole('button', { name: '0' }));
    fireEvent.click(pad.getByRole('button', { name: 'こたえる' }));
    expect(r.results.at(-1)?.correct).toBe(true);
    expect(clockAnswer(p)).toBe(40);
  });
});

describe('27 数字をさがせ！', () => {
  const tapValue = (v: number) => fireEvent.click(screen.getByRole('gridcell', { name: new RegExp(`^${v}(（|$)`) }));

  it('スタートで すうじが でる。まちがえても すすまない（記録は のこる）。5ラウンドで クリア', async () => {
    const p = gen<NumberHuntPuzzle>(numberHunt, 4, 'easy');
    const r = await renderView('number-hunt', p);
    expect(screen.getByRole('grid', { name: 'すうじの ばん' })).toHaveAttribute('data-phase', 'cover');
    fireEvent.click(screen.getByRole('button', { name: 'スタート' }));
    expect(screen.getByTestId('hunt-target').textContent).toBe('1');
    tapValue(2); // まちがい
    expect(r.results.at(-1)?.correct).toBe(false);
    expect(screen.getByTestId('hunt-target').textContent).toBe('1');
    for (let k = 0; k < HUNT_ROUNDS; k++) {
      if (k > 0) {
        fireEvent.click(screen.getByRole('button', { name: 'つぎの ラウンド' }));
        fireEvent.click(screen.getByRole('button', { name: 'スタート' }));
      }
      // ラウンドごとの ならびは 問題の とおり
      const cellsNow = within(screen.getByRole('grid', { name: 'すうじの ばん' })).getAllByRole('gridcell').map((c) => Number(c.textContent!.replace('✓', '')));
      expect(cellsNow).toEqual(p.rounds[k]);
      for (const v of huntTargets(p)) tapValue(v);
    }
    expect(r.results.at(-1)?.correct).toBe(true);
    expect(r.results.filter((x) => x.correct)).toHaveLength(1);
    const ans = r.submit.mock.calls.at(-1)![0] as NumberHuntAnswer;
    expect(ans.rounds[0]).toMatchObject({ mistakes: 1, firstTry: false, cleared: true });
    expect(ans.rounds[1]).toMatchObject({ mistakes: 0, firstTry: true });
  });

  it('チャレンジの 3の倍数：ルールを 大きく 表示。3・6・9… の じゅん。「もういちど」で 同じ ならびの はじめから', async () => {
    const base = gen<NumberHuntPuzzle>(numberHunt, 4, 'challenge');
    const p: NumberHuntPuzzle = { ...base, rule: 'mult3' };
    const r = await renderView('number-hunt', p, { difficulty: 'challenge' });
    expect(screen.getByTestId('hunt-rule').textContent).toContain('3の ばいすう');
    fireEvent.click(screen.getByRole('button', { name: 'スタート' }));
    tapValue(1);
    expect(r.results.at(-1)?.correct).toBe(false);
    tapValue(3);
    tapValue(6);
    expect(screen.getByTestId('hunt-target').textContent).toBe('9');
    fireEvent.click(screen.getByRole('button', { name: 'もういちど' }));
    expect(screen.getByTestId('hunt-target').textContent).toBe('3');
    const cellsNow = within(screen.getByRole('grid', { name: 'すうじの ばん' })).getAllByRole('gridcell').map((c) => Number(c.textContent!.replace('✓', '')));
    expect(cellsNow).toEqual(p.rounds[0]);
    const saved = r.saveDraft.mock.calls.at(-1)![0] as { index: number; records: { restarts: number; mistakes: number }[] };
    expect(saved.index).toBe(0);
    expect(saved.records[0]).toMatchObject({ restarts: 1, mistakes: 1 });
  });

  it('ヒント：2は 行か 列を、3は その マスを ひからせる（自分で おす）', async () => {
    const p = gen<NumberHuntPuzzle>(numberHunt, 9, 'normal');
    await renderView('number-hunt', p, { hintLevel: 3 });
    fireEvent.click(screen.getByRole('button', { name: 'スタート' }));
    const target = screen.getByRole('gridcell', { name: /^1$/ });
    expect(target.style.border).toContain('dashed');
    const lit = within(screen.getByRole('grid', { name: 'すうじの ばん' }))
      .getAllByRole('gridcell')
      .filter((c) => c.style.background.includes('255, 246, 214') || c.style.background === '#fff6d6');
    expect(lit.length).toBe(p.size); // 1は 奇数 → たての れつ
    expect(screen.getByTestId('hunt-target').textContent).toBe('1');
  });

  it('タイマー：じかんを はかる と 表示。やすむ・画面を かくすと とまる。再開は スタート待ち', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const p = gen<NumberHuntPuzzle>(numberHunt, 6, 'hard');
    const r = await renderView('number-hunt', p, { difficulty: 'hard' });
    fireEvent.click(screen.getByRole('radio', { name: 'じかんを はかる' }));
    fireEvent.click(screen.getByRole('button', { name: 'スタート' }));
    await act(async () => {
      vi.advanceTimersByTime(2100);
    });
    const t = () => screen.getByTestId('hunt-timer').textContent!;
    expect(t()).toMatch(/0:0[2-3]/);
    fireEvent.click(screen.getByRole('button', { name: 'やすむ' }));
    const a = t();
    await act(async () => {
      vi.advanceTimersByTime(30_000);
    });
    expect(t()).toBe(a);
    expect(screen.getByRole('grid', { name: 'すうじの ばん' })).toHaveAttribute('data-phase', 'cover');
    fireEvent.click(screen.getByRole('button', { name: 'つづける' }));
    tapValue(1);
    tapValue(2);
    await act(async () => setHidden(true));
    await act(async () => {
      vi.advanceTimersByTime(60_000);
    });
    expect(Number(t().split(':')[1])).toBeLessThan(10);
    const saved = r.saveDraft.mock.calls.at(-1)![0] as { round: number; index: number; timerOn: boolean };
    expect(saved).toMatchObject({ round: 0, index: 2, timerOn: true });
    r.view.unmount();
    vi.useRealTimers();
    setHidden(false);
    await renderView('number-hunt', p, { difficulty: 'hard', draft: r.saveDraft.mock.calls.at(-1)![0] });
    expect(screen.getByRole('grid', { name: 'すうじの ばん' })).toHaveAttribute('data-phase', 'cover');
    fireEvent.click(screen.getByRole('button', { name: 'スタート' }));
    expect(screen.getByTestId('hunt-target').textContent).toBe('3');
  });
});
