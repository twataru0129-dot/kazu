import type { Difficulty, Mode, Op } from '../domain/types';

export const SCHEMA_VERSION = 1;

export const AVATAR_IDS = ['fox', 'cat', 'panda', 'rabbit', 'lion', 'penguin'] as const;
export type AvatarId = (typeof AVATAR_IDS)[number];

export interface Profile {
  id: string;
  nickname: string;
  avatarId: AvatarId;
  createdAt: string; // ISO (UTC)
  updatedAt: string;
}

export interface StoredAttempt {
  id: string;
  profileId: string;
  sessionId: string;
  mode: Mode;
  gameId?: string;
  op?: Op;
  difficulty: Difficulty;
  /** 計算・テストの細かい難易度（例 add:d2:with） */
  levelKey?: string;
  questionKey: string;
  generatorVersion: number;
  questionSnapshot: unknown;
  answerSnapshot: unknown;
  firstTryCorrect?: boolean;
  finalCorrect?: boolean;
  skipped?: boolean;
  retryCount: number;
  hintsUsed: number;
  elapsedActiveMs?: number;
  answeredAt: string;
}

export type SessionStatus = 'inProgress' | 'completed' | 'abandoned';

export interface Session {
  id: string;
  profileId: string;
  mode: Mode;
  gameId?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  status: SessionStatus;
  settingsSnapshot: unknown;
  /** 中断した盤面やテストの途中状態 */
  activeDraft?: unknown;
  /** 完了テストの結果など */
  summary?: unknown;
}

export interface UserSettings {
  profileId: string;
  soundOn: boolean;
  speechOn: boolean;
  reducedMotion: boolean;
  largeText: boolean;
  preferredDifficultyByGame: Record<string, Difficulty>;
  lastCalcSettings?: unknown;
  lastTestSettings?: unknown;
}

export const defaultSettings = (profileId: string): UserSettings => ({
  profileId,
  soundOn: true,
  speechOn: false,
  reducedMotion: false,
  largeText: false,
  preferredDifficultyByGame: {},
});

export interface BackupBundle {
  format: string;
  schemaVersion: number;
  exportedAt: string;
  appName?: string;
  profiles: Profile[];
  sessions: Session[];
  attempts: StoredAttempt[];
  settings: Record<string, UserSettings>;
}
