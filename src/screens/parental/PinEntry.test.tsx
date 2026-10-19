import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PinEntry } from './PinEntry';
import type { PinCheck } from '../../app/ParentalContext';

const key = (k: string) => fireEvent.keyDown(window, { key: k });
const typePin = (pin: string) => {
  for (const d of pin) key(d);
  key('Enter');
};

afterEach(() => vi.useRealTimers());

describe('PinEntry：まちがいが つづいたときの 待ち時間', () => {
  it('待っている あいだは キーが ない。おわると キーが もどり、キーボードで 入れられ、古い「まって」の知らせは 消える', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: false, now: new Date('2026-10-19T00:00:00Z') });
    const onSubmit = vi.fn(async (pin: string): Promise<PinCheck> => (onSubmit.mock.calls.length === 1 ? { ok: false, waitMs: 30_000 } : { ok: pin === '2580', waitMs: 0 }));
    render(<PinEntry onSubmit={onSubmit} />);
    typePin('0000');
    await act(async () => {});
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('alert').textContent).toContain('30びょう まってから');
    expect(screen.queryByRole('group', { name: 'すうじキー' })).toBeNull();
    // 待っている あいだの 入力は とどかない
    typePin('2580');
    await act(async () => {});
    expect(onSubmit).toHaveBeenCalledTimes(1);
    await act(async () => {
      vi.advanceTimersByTime(29_000);
    });
    expect(screen.getByRole('alert').textContent).toContain('あと 1びょう');
    await act(async () => {
      vi.advanceTimersByTime(1_500);
    });
    expect(screen.getByRole('group', { name: 'すうじキー' })).toBeInTheDocument();
    expect(screen.getByRole('alert').textContent).toBe('もう いれられます。あんしょうばんごうを いれてください。');
    typePin('2580');
    await act(async () => {});
    expect(onSubmit).toHaveBeenCalledTimes(2);
    expect(onSubmit).toHaveBeenLastCalledWith('2580');
  });

  it('ふつうの まちがいは そのまま 知らせる', async () => {
    const onSubmit = vi.fn(async (): Promise<PinCheck> => ({ ok: false, waitMs: 0 }));
    render(<PinEntry onSubmit={onSubmit} />);
    typePin('1111');
    await act(async () => {});
    expect(screen.getByRole('alert').textContent).toBe('ばんごうが ちがいます。もういちど いれてください。');
    expect(screen.getByRole('group', { name: 'すうじキー' })).toBeInTheDocument();
  });
});
