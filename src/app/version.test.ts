import { describe, expect, it } from 'vitest';
import { buildAppVersion } from './buildVersion';
import { APP_VERSION, formatVersion } from './version';
import pkg from '../../package.json';

describe('アプリの 版', () => {
  it('package.json の version と ビルドID。画面には v1.8.0 + a1b2c3d の 形', () => {
    expect(APP_VERSION).toBe(__APP_VERSION__);
    expect(APP_VERSION.split('+')[0]).toBe(pkg.version);
    expect(pkg.version).toBe('1.8.0');
    expect(formatVersion('1.8.0+a1b2c3d')).toBe('v1.8.0 + a1b2c3d');
    expect(formatVersion('1.8.0')).toBe('v1.8.0');
  });

  it('ビルドが かわると ID も かわる（GitHub Actions は commit の 先頭7桁）', () => {
    expect(buildAppVersion('1.8.0', { GITHUB_SHA: 'a1b2c3d4e5f6' })).toBe('1.8.0+a1b2c3d');
    expect(buildAppVersion('1.8.0', { GITHUB_SHA: '0f9e8d7c6b5a' })).toBe('1.8.0+0f9e8d7');
    expect(buildAppVersion('1.8.0', { BUILD_ID: 'pages-42', GITHUB_SHA: 'a1b2c3d' })).toBe('1.8.0+pages-42');
    const a = buildAppVersion('1.8.0', {}, new Date('2026-10-21T10:00:00Z'));
    const b = buildAppVersion('1.8.0', {}, new Date('2026-10-21T10:05:00Z'));
    expect(a).toBe('1.8.0+202610211000');
    expect(a).not.toBe(b);
  });
});
