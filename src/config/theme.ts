import appConfig from '../../app.config.json';

/** アプリ名・色などの差し替えポイント（ロジックに触れずに変更できる） */
export const APP_NAME = appConfig.appName;
export const SHORT_NAME = appConfig.shortName;

export type ModeKey = 'calc' | 'play' | 'learn' | 'test';

export const MODES: Record<ModeKey, { label: string; sub: string; color: string; soft: string; path: string }> = {
  calc: { label: 'けいさん', sub: 'あんざん・100マス', color: '#f07a2a', soft: '#fff1e6', path: '/calc' },
  play: { label: 'あそぶ', sub: '30この すうじあそび', color: '#1f9d6a', soft: '#e5f7ef', path: '/play' },
  learn: { label: 'まなぶ', sub: 'かけざん・わりざん', color: '#7a55c8', soft: '#f1ebfb', path: '/learn' },
  test: { label: 'テスト', sub: 'じぶんで つくって ためす', color: '#2a7fd0', soft: '#e6f1fc', path: '/test' },
};
