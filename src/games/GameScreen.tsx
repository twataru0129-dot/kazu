import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType } from 'react';
import { useProfile } from '../app/AppContext';
import { navigate } from '../app/router';
import { play } from '../audio/sfx';
import { speak } from '../audio/speech';
import { GameIcon } from '../components/Icons';
import { DockLayout } from '../components/Dock';
import { Feedback, HintButton, HintPanel, ProgressDots, SoundToggle, SpeakButton, TopBar } from '../components/ui';
import { createRng, newId, randomSeed } from '../domain/random';
import { GAME_BY_ID, SET_SIZE, type GameMeta } from '../domain/games/registry';
import { generatePuzzle, type GameId, type Judgement } from '../domain/games/types';
import { DIFFICULTIES, DIFFICULTY_LABEL, type Difficulty } from '../domain/types';
import { nowIso } from '../persistence/repo';
import type { Session, StoredAttempt } from '../persistence/types';
import { GAME_VIEWS } from './views';
import type { GameViewProps } from './types';

const EXPLORE: GameId[] = ['decompose', 'pittari'];

interface Round {
  puzzle: unknown;
  attemptId: string;
  startedAt: number;
  submits: number;
  wrong: number;
  firstCorrect?: boolean;
  hints: number;
  solved: boolean;
  solvedAt?: number;
  found: { key: string; answer: unknown }[];
  lastAnswer?: unknown;
}

interface Draft {
  difficulty: Difficulty;
  round: Round;
  view?: unknown;
}

export function GameScreen({ gameId }: { gameId: GameId }) {
  const meta = GAME_BY_ID[gameId];
  const { profile, settings, repo, updateSettings } = useProfile();
  const [stage, setStage] = useState<'intro' | 'play' | 'done'>('intro');
  const [difficulty, setDifficulty] = useState<Difficulty>(settings.preferredDifficultyByGame[gameId] ?? 'easy');
  const [draftSession, setDraftSession] = useState<Session | null>(null);
  const [resume, setResume] = useState<{ draft: Draft; session: Session } | null>(null);
  const [setStats, setSetStats] = useState({ solved: 0, total: 0 });
  const [playKey, setPlayKey] = useState(0);

  // 画面が切りかわったら いちばん上（問題）から見せる
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [stage, playKey]);

  useEffect(() => {
    if (!meta.resumable) return;
    repo.findDraft(profile.id, 'game', gameId).then((s) => setDraftSession(s ?? null));
  }, [repo, profile.id, gameId, meta.resumable, stage]);

  const start = (d: Difficulty, fromDraft: { draft: Draft; session: Session } | null) => {
    setDifficulty(d);
    setResume(fromDraft);
    setStage('play');
    setPlayKey((k) => k + 1);
    void updateSettings({ preferredDifficultyByGame: { ...settings.preferredDifficultyByGame, [gameId]: d } }).catch(() => undefined);
  };

  if (stage === 'intro')
    return (
      <main className="screen narrow" style={{ ['--accent' as string]: '#1f9d6a', ['--accent-soft' as string]: '#e5f7ef' }}>
        <TopBar title={meta.title} onBack={() => navigate('/play')} right={<SoundToggle />} />
        <div className="card stack center-text">
          <div style={{ width: 88, height: 88, margin: '0 auto' }}>
            <GameIcon id={gameId} />
          </div>
          <p style={{ fontSize: '1.1rem', margin: 0 }}>{meta.description}</p>
          <p className="small muted" style={{ margin: 0 }}>
            {meta.kind === 'set' ? `${SET_SIZE}もんで ひとくぎり。とちゅうで やめても いいよ。` : '1まい できたら ひとくぎり。'}
            じかんの せいげんは ないよ。
          </p>
          <div className="row center">
            <SpeakButton text={meta.description} />
          </div>
        </div>
        {draftSession && (
          <div className="card stack">
            <strong>つづきが あるよ</strong>
            <div className="row">
              <button type="button" className="btn primary" onClick={() => start((draftSession.activeDraft as Draft).difficulty, { draft: draftSession.activeDraft as Draft, session: draftSession })}>
                つづきから
              </button>
              <button
                type="button"
                className="btn"
                onClick={async () => {
                  await repo.saveSession({ ...draftSession, status: 'abandoned', activeDraft: undefined });
                  setDraftSession(null);
                }}
              >
                つづきを けす
              </button>
            </div>
          </div>
        )}
        <div className="card stack">
          <span className="field-label">むずかしさ</span>
          <div className="stack" role="radiogroup" aria-label="むずかしさ">
            {DIFFICULTIES.map((d) => (
              <button
                key={d}
                type="button"
                role="radio"
                aria-checked={difficulty === d}
                className="chip"
                aria-pressed={difficulty === d}
                style={{ textAlign: 'left', display: 'flex', justifyContent: 'space-between', gap: 8 }}
                onClick={() => setDifficulty(d)}
              >
                <span>{DIFFICULTY_LABEL[d]}</span>
                <span className="small" style={{ fontWeight: 400 }}>
                  {meta.difficultyNotes[d]}
                </span>
              </button>
            ))}
          </div>
          <button type="button" className="btn primary big block" onClick={() => start(difficulty, null)}>
            はじめる
          </button>
        </div>
      </main>
    );

  if (stage === 'done')
    return (
      <main className="screen narrow">
        <TopBar title={meta.title} onBack={() => navigate('/play')} />
        <div className="card stack center-text pop">
          <div style={{ fontSize: '3rem' }} aria-hidden>
            🎉
          </div>
          <h2 style={{ margin: 0 }}>{meta.kind === 'set' ? `${setStats.total}もん おわったよ！` : 'できたね！'}</h2>
          {meta.kind === 'set' && <p className="muted">せいかい {setStats.solved}もん</p>}
          <div className="stack">
            <button type="button" className="btn primary big" onClick={() => start(difficulty, null)}>
              {meta.kind === 'set' ? 'もういちど あそぶ' : 'つぎの もんだい'}
            </button>
            <button type="button" className="btn" onClick={() => setStage('intro')}>
              むずかしさを かえる
            </button>
            <button type="button" className="btn" onClick={() => navigate('/play')}>
              ゲーム いちらんへ
            </button>
          </div>
        </div>
      </main>
    );

  return (
    <GamePlayer
      key={`${profile.id}-${playKey}`}
      meta={meta}
      difficulty={difficulty}
      resume={resume}
      onFinish={(solved, total) => {
        setSetStats({ solved, total });
        setStage('done');
      }}
      onQuit={() => setStage('intro')}
    />
  );
}

function GamePlayer({
  meta,
  difficulty,
  resume,
  onFinish,
  onQuit,
}: {
  meta: GameMeta;
  difficulty: Difficulty;
  resume: { draft: Draft; session: Session } | null;
  onFinish(solved: number, total: number): void;
  onQuit(): void;
}) {
  const { profile, repo } = useProfile();
  const View = GAME_VIEWS[meta.id] as ComponentType<GameViewProps<unknown, unknown>>;
  const total = meta.kind === 'set' ? SET_SIZE : 1;
  const sessionRef = useRef<Session>(
    resume?.session ?? {
    id: newId(),
    profileId: profile.id,
    mode: 'game',
    gameId: meta.id,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    status: 'inProgress',
    settingsSnapshot: { difficulty },
    },
  );
  const recentKeys = useRef<string[]>([]);
  const recentPuzzles = useRef<unknown[]>([]);
  const newRound = useCallback((): Round => {
    const { puzzle } = generatePuzzle(meta.logic, createRng(randomSeed()), difficulty, new Set(recentKeys.current.slice(-20)), recentPuzzles.current.slice(-5));
    recentKeys.current.push(meta.logic.key(puzzle));
    recentPuzzles.current.push(puzzle);
    return { puzzle, attemptId: newId(), startedAt: Date.now(), submits: 0, wrong: 0, hints: 0, solved: false, found: [] };
  }, [meta, difficulty]);

  const [index, setIndex] = useState(0);
  const [solvedCount, setSolvedCount] = useState(0);
  const [round, setRound] = useState<Round>(() => resume?.draft.round ?? newRound());
  const roundRef = useRef(round);
  roundRef.current = round;
  const [viewDraft, setViewDraft] = useState<unknown>(resume?.draft.view);
  const [feedback, setFeedback] = useState<{ kind: 'good' | 'try'; text: string; n: number } | null>(null);
  const [progress, setProgress] = useState<unknown>(undefined);
  const viewDraftRef = useRef<unknown>(resume?.draft.view);

  const saveAttempt = useCallback(
    (r: Round, extra: Partial<StoredAttempt> = {}) => {
      const a: StoredAttempt = {
        id: r.attemptId,
        profileId: profile.id,
        sessionId: sessionRef.current.id,
        mode: 'game',
        gameId: meta.id,
        difficulty,
        questionKey: meta.logic.key(r.puzzle),
        generatorVersion: meta.logic.generatorVersion,
        questionSnapshot: r.puzzle,
        answerSnapshot: { last: r.lastAnswer ?? null, found: r.found.map((f) => f.answer) },
        firstTryCorrect: r.firstCorrect,
        finalCorrect: r.solved,
        retryCount: r.wrong,
        hintsUsed: r.hints,
        elapsedActiveMs: Date.now() - r.startedAt,
        answeredAt: nowIso(),
        ...extra,
      };
      void repo.saveAttempt(a).catch(() => undefined);
    },
    [repo, profile.id, meta, difficulty],
  );

  const persistDraft = useCallback(
    (r: Round, view: unknown) => {
      if (!meta.resumable) return;
      const s: Session = { ...sessionRef.current, activeDraft: r.solved ? undefined : ({ difficulty, round: r, view } satisfies Draft) };
      if (r.solved) s.status = 'completed';
      sessionRef.current = s;
      void repo.saveSession(s).catch(() => undefined);
    },
    [meta.resumable, repo, difficulty],
  );

  // 途中の盤面は少し待ってから保存（操作のたびに書き込みすぎない）
  const draftTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const draftPending = useRef(false);
  const saveDraft = useCallback(
    (state: unknown) => {
      viewDraftRef.current = state;
      draftPending.current = true;
      clearTimeout(draftTimer.current);
      draftTimer.current = setTimeout(() => {
        draftPending.current = false;
        persistDraft(roundRef.current, state);
      }, 300);
    },
    [persistDraft],
  );
  // アプリを切り替えた・閉じたときは、待っている保存を すぐ行う（iPhone でホームに戻ったときなど）
  useEffect(() => {
    const flushNow = () => {
      if (!draftPending.current) return;
      clearTimeout(draftTimer.current);
      draftPending.current = false;
      if (!roundRef.current.solved) persistDraft(roundRef.current, viewDraftRef.current);
    };
    const onVisibility = () => document.visibilityState === 'hidden' && flushNow();
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', flushNow);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', flushNow);
    };
  }, [persistDraft]);
  useEffect(
    () => () => {
      // 画面を離れるときに、待っていた保存を すぐ行う
      if (draftTimer.current) {
        clearTimeout(draftTimer.current);
        if (!roundRef.current.solved) persistDraft(roundRef.current, viewDraftRef.current);
      }
    },
    [persistDraft],
  );

  const submit = useCallback(
    (answer: unknown): Judgement => {
      const r = roundRef.current;
      const j = meta.logic.judge(r.puzzle, answer);
      const next: Round = { ...r, submits: r.submits + 1, lastAnswer: answer };
      if (next.firstCorrect === undefined) next.firstCorrect = j.correct;
      let text = j.message ?? '';
      if (j.correct) {
        const dup = j.solutionKey !== undefined && r.found.some((f) => f.key === j.solutionKey);
        if (dup) text = 'それは もう みつけたよ。ほかにも あるかな？';
        else {
          if (j.solutionKey !== undefined) next.found = [...r.found, { key: j.solutionKey, answer }];
          text = r.solved ? `すごい！ ${next.found.length}こめ みつけた！` : 'せいかい！';
        }
        if (!r.solved) {
          next.solved = true;
          next.solvedAt = Date.now();
          setSolvedCount((c) => c + 1);
        }
        play(r.solved && dup ? 'soft' : 'correct');
      } else {
        if (!r.solved) next.wrong = r.wrong + 1;
        text = text || 'おしい！ もういちど かんがえてみよう';
        play('soft');
      }
      setFeedback({ kind: j.correct ? 'good' : 'try', text, n: next.submits });
      if (text) speak(text);
      setRound(next);
      roundRef.current = next;
      saveAttempt(next);
      if (next.solved) persistDraft(next, undefined);
      return j;
    },
    [meta.logic, saveAttempt, persistDraft],
  );

  const takeHint = () => {
    const r = { ...roundRef.current, hints: Math.min(3, roundRef.current.hints + 1) };
    setRound(r);
    roundRef.current = r;
    play('tap');
    const h = meta.logic.hints(r.puzzle, progress)[r.hints - 1];
    if (h) speak(h);
    if (meta.resumable) persistDraft(r, viewDraftRef.current);
  };

  const resetRound = () => {
    window.scrollTo(0, 0);
    const nr = newRound();
    setRound(nr);
    roundRef.current = nr;
    setViewDraft(undefined);
    viewDraftRef.current = undefined;
    setFeedback(null);
    setProgress(undefined);
  };

  const goNext = (skipped: boolean) => {
    const r = roundRef.current;
    // 正解直後の連打で つぎの問題を とばさない
    if (!skipped && r.solvedAt && Date.now() - r.solvedAt < 600) return;
    if (skipped && !r.solved) saveAttempt(r, { skipped: true, finalCorrect: false });
    if (skipped && meta.kind === 'board') {
      // 盤面型は「ちがう もんだい」で新しい盤面にする（同じセッションの続き）
      if (meta.resumable) persistDraft({ ...r, solved: true }, undefined);
      sessionRef.current = { ...sessionRef.current, status: 'inProgress' };
      resetRound();
      return;
    }
    const nextIndex = index + 1;
    if (nextIndex >= total) {
      const s: Session = { ...sessionRef.current, status: 'completed', completedAt: nowIso(), activeDraft: undefined, summary: { solved: solvedCount, total } };
      sessionRef.current = s;
      void repo.saveSession(s).catch(() => undefined);
      if (solvedCount > 0) play('complete');
      onFinish(solvedCount, total);
      return;
    }
    setIndex(nextIndex);
    resetRound();
  };

  const hints = useMemo(() => meta.logic.hints(round.puzzle, progress), [meta.logic, round.puzzle, progress]);
  const explore = EXPLORE.includes(meta.id);

  const status = (
    <>
      {feedback && (
        <Feedback key={feedback.n} kind={feedback.kind}>
          {feedback.text}
        </Feedback>
      )}
      <HintPanel hints={hints} level={round.hints} />
    </>
  );

  return (
    <main className="screen" style={{ ['--accent' as string]: '#1f9d6a', ['--accent-soft' as string]: '#e5f7ef', maxWidth: 760 }}>
      <TopBar
        title={meta.title}
        onBack={onQuit}
        right={
          <>
            <span className="small muted" style={{ whiteSpace: 'nowrap' }}>
              {DIFFICULTY_LABEL[difficulty]}
            </span>
            <SoundToggle />
          </>
        }
      />
      {total > 1 && <ProgressDots total={total} done={index + (round.solved ? 1 : 0)} current={index} />}
      <DockLayout
        footer={
          round.solved && !explore ? (
            // 正解したら「つぎへ」を いちばん 押しやすい 場所に 大きく出す
            <button type="button" className="btn good big block" onClick={() => goNext(false)}>
              {index + 1 >= total ? 'おわり' : 'つぎへ'} →
            </button>
          ) : (
            <>
              <HintButton level={round.hints} onClick={takeHint} disabled={round.solved && !explore} />
              {round.solved ? (
                <button type="button" className="btn good big" onClick={() => goNext(false)}>
                  {index + 1 >= total ? 'おわり' : 'つぎへ'} →
                </button>
              ) : (
                <button type="button" className="btn ghost" onClick={() => goNext(true)}>
                  ちがう もんだいに する
                </button>
              )}
            </>
          )
        }
      >
      <View
        key={round.attemptId}
        puzzle={round.puzzle}
        difficulty={difficulty}
        submit={submit}
        solved={round.solved && !explore}
        found={round.found}
        hintLevel={round.hints}
        draft={viewDraft}
        saveDraft={saveDraft}
        reportProgress={setProgress}
        status={status}
      />
      {explore && round.solved && <p className="small muted center-text">ほかの こたえも さがせるよ。「つぎへ」で つぎの もんだい。</p>}
      </DockLayout>
    </main>
  );
}
