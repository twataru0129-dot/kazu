import { useCallback, useRef } from 'react';
import { useProfile } from '../../app/AppContext';
import { newId } from '../../domain/random';
import { nowIso } from '../../persistence/repo';
import type { Session } from '../../persistence/types';
import { LEARNING_VERSION } from '../../domain/learning/practice';

/** まなびの れんしゅうの記録（プロフィールごと） */
export function useLearningRecorder(lesson: 'mul' | 'div') {
  const { profile, repo } = useProfile();
  const session = useRef<Session | null>(null);
  return useCallback(
    (attemptId: string, question: { kind: string } & Record<string, unknown>, answer: unknown, first: boolean, final: boolean, retry: number) => {
      if (!session.current) {
        session.current = { id: newId(), profileId: profile.id, mode: 'learning', gameId: `learn-${lesson}`, createdAt: nowIso(), updatedAt: nowIso(), status: 'inProgress', settingsSnapshot: { lesson } };
        void repo.saveSession(session.current).catch(() => undefined);
      }
      void repo
        .saveAttempt({
          id: attemptId,
          profileId: profile.id,
          sessionId: session.current.id,
          mode: 'learning',
          gameId: `learn-${lesson}`,
          op: lesson === 'mul' ? 'multiply' : 'divide',
          difficulty: 'easy',
          questionKey: `${lesson}:${question.kind}:${JSON.stringify(question)}`,
          generatorVersion: LEARNING_VERSION,
          questionSnapshot: question,
          answerSnapshot: answer,
          firstTryCorrect: first,
          finalCorrect: final,
          retryCount: retry,
          hintsUsed: 0,
          answeredAt: nowIso(),
        })
        .catch(() => undefined);
    },
    [profile.id, repo, lesson],
  );
}

export const newAttemptId = newId;

export function Stepper({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange(v: number): void }) {
  return (
    <div className="row" style={{ justifyContent: 'space-between' }}>
      <span style={{ fontWeight: 700 }}>{label}</span>
      <span className="row" style={{ gap: 6 }}>
        <button type="button" className="btn" onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min} aria-label={`${label}を へらす`}>
          −
        </button>
        <span className="num" style={{ fontSize: '1.8rem', minWidth: 40, textAlign: 'center' }} aria-live="polite">
          {value}
        </span>
        <button type="button" className="btn" onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max} aria-label={`${label}を ふやす`}>
          ＋
        </button>
      </span>
    </div>
  );
}

export function LessonTabs<T extends string>({ tabs, value, onChange }: { tabs: [T, string][]; value: T; onChange(v: T): void }) {
  return (
    <div className="grid-tabs" role="tablist" style={{ ['--n' as string]: tabs.length, ['--cols' as string]: tabs.length <= 4 ? 2 : 3 }}>
      {tabs.map(([k, l]) => (
        <button
          key={k}
          type="button"
          role="tab"
          aria-selected={value === k}
          tabIndex={value === k ? 0 : -1}
          className="chip"
          onClick={() => onChange(k)}
          onKeyDown={(e) => {
            const i = tabs.findIndex(([x]) => x === k);
            const d = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
            if (!d) return;
            e.preventDefault();
            const next = tabs[(i + d + tabs.length) % tabs.length][0];
            onChange(next);
            (e.currentTarget.parentElement?.children[(i + d + tabs.length) % tabs.length] as HTMLElement | undefined)?.focus();
          }}
        >
          {l}
        </button>
      ))}
    </div>
  );
}
