import { describe, expect, it } from 'vitest';
import { isSafeToReload, SAFE_PATHS } from './pwa';

describe('PWA の自動更新：安全な画面', () => {
  it('ホーム・プロフィール選択・一覧だけを安全とみなす', () => {
    for (const p of ['/', '/home', '/play', '/learn', '/create']) expect(isSafeToReload(p)).toBe(true);
    for (const p of ['/calc', '/play/sudoku', '/play/make10', '/test', '/learn/mul', '/learn/div', '/parent']) expect(isSafeToReload(p)).toBe(false);
    expect(SAFE_PATHS).not.toContain('/test');
  });
});
