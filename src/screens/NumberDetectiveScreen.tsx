import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useProfile } from '../app/AppContext';
import { navigate } from '../app/router';
import { play } from '../audio/sfx';
import { speak } from '../audio/speech';
import { DockLayout } from '../components/Dock';
import { GameIcon } from '../components/Icons';
import { Modal, SoundToggle, TopBar } from '../components/ui';
import {
  ALL_DIGITS,
  ask,
  clearInput,
  CODE_LENGTH,
  deleteDigit,
  drawSecret,
  MAX_QUESTIONS,
  newGame,
  numberDetective,
  questionsLeft,
  restoreState,
  RESULT_MEANINGS,
  RESULT_NAMES,
  resultLabel,
  resultText,
  typeDigit,
  type DetectiveState,
  type GuessRecord,
} from '../domain/games/numberDetective';
import { GAME_BY_ID } from '../domain/games/registry';
import { newId, randomSeed } from '../domain/random';
import { nowIso } from '../persistence/repo';
import type { Session, StoredAttempt } from '../persistence/types';
import { useRoom } from '../games/useRoom';

const GAME_ID = 'number-detective';
const meta = GAME_BY_ID[GAME_ID];
/** 記録の 形を ほかの ゲームと そろえる ための 内部の むずかしさ（画面には 出さない） */
const FIXED_DIFFICULTY = 'normal' as const;

/** 途中保存の なかみ（session.activeDraft） */
interface Draft {
  v: 1;
  attemptId: string;
  startedAt: number;
  state: DetectiveState;
}
export interface DetectiveSummary {
  outcome: 'cleared' | 'over';
  questions: number;
  secret: string;
}

/** ぴったり：みどり、ばしょちがい：オレンジ（いろだけで なく 文字でも わかる） */
const EAT_COLOR = '#15803d';
const BITE_COLOR = '#b45309';

function readDraft(s: Session | null | undefined): Draft | null {
  const d = s?.activeDraft as Partial<Draft> | undefined;
  if (!d || d.v !== 1 || typeof d.attemptId !== 'string') return null;
  const state = restoreState(d.state);
  if (!state || state.status !== 'playing') return null;
  return { v: 1, attemptId: d.attemptId, startedAt: Number(d.startedAt) || Date.now(), state };
}

export function NumberDetectiveScreen() {
  const { profile, settings, repo, updateSettings } = useProfile();
  const [stage, setStage] = useState<'intro' | 'tutorial' | 'play'>('intro');
  const [draftSession, setDraftSession] = useState<Session | null>(null);
  const [game, setGame] = useState<{ session: Session; draft: Draft; key: number } | null>(null);
  const starting = useRef(false);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [stage, game?.key]);

  useEffect(() => {
    if (stage !== 'intro') return;
    let alive = true;
    repo.findDraft(profile.id, 'game', GAME_ID).then((s) => alive && setDraftSession(s && readDraft(s) ? s : null));
    return () => {
      alive = false;
    };
  }, [repo, profile.id, stage]);

  /** あたらしい ゲーム：プロフィールの 出題じゅんから ひみつの すうじを 1つ だす（前の 途中は おしまいに する） */
  const startNew = async () => {
    if (starting.current) return;
    starting.current = true;
    try {
      const old = await repo.findDraft(profile.id, 'game', GAME_ID);
      if (old) await repo.saveSession({ ...old, status: 'abandoned', activeDraft: undefined });
      const { secret, deck } = drawSecret(settings.numberDetectiveDeck, randomSeed);
      // 出題じゅんを 先に 保存（とちゅうで アプリが とじても 同じ ならびを くりかえさない）
      await updateSettings({ numberDetectiveDeck: deck });
      const draft: Draft = { v: 1, attemptId: newId(), startedAt: Date.now(), state: newGame(secret) };
      const session: Session = {
        id: newId(),
        profileId: profile.id,
        mode: 'game',
        gameId: GAME_ID,
        createdAt: nowIso(),
        updatedAt: nowIso(),
        status: 'inProgress',
        settingsSnapshot: { difficulty: FIXED_DIFFICULTY },
        activeDraft: draft,
      };
      await repo.saveSession(session);
      setGame((g) => ({ session, draft, key: (g?.key ?? 0) + 1 }));
      setStage('play');
    } finally {
      starting.current = false;
    }
  };

  const resume = () => {
    const d = readDraft(draftSession);
    if (!draftSession || !d) return;
    setGame((g) => ({ session: draftSession, draft: d, key: (g?.key ?? 0) + 1 }));
    setStage('play');
  };

  if (stage === 'tutorial')
    return (
      <main className="screen narrow" style={{ ['--accent' as string]: '#7c3aed', ['--accent-soft' as string]: '#f3e8ff' }}>
        <TopBar title="あそびかた" onBack={() => setStage('intro')} right={<SoundToggle />} />
        <HowToPlay />
        <div className="stack" style={{ marginTop: 12 }}>
          <button type="button" className="btn primary big block" onClick={() => void startNew()}>
            ゲームを はじめる
          </button>
          <button type="button" className="btn block" onClick={() => setStage('intro')}>
            もどる
          </button>
        </div>
      </main>
    );

  if (stage === 'play' && game) return <DetectivePlay key={`${profile.id}-${game.key}`} session={game.session} draft={game.draft} onAgain={() => void startNew()} onQuit={() => setStage('intro')} />;

  return (
    <main className="screen narrow" style={{ ['--accent' as string]: '#7c3aed', ['--accent-soft' as string]: '#f3e8ff' }}>
      <TopBar title={meta.title} onBack={() => navigate('/play')} right={<SoundToggle />} />
      <div className="card stack center-text">
        <div style={{ width: 88, height: 88, margin: '0 auto' }}>
          <GameIcon id={GAME_ID} />
        </div>
        <p style={{ fontSize: '1.1rem', margin: 0 }}>{meta.description}</p>
        <p className="small muted" style={{ margin: 0 }}>
          3つの すうじ・{MAX_QUESTIONS}かい まで しつもん できるよ。じかんの せいげんは ないよ。
        </p>
      </div>
      {draftSession && (
        <div className="card stack">
          <strong>つづきが あるよ</strong>
          <div className="row">
            <button type="button" className="btn primary" onClick={resume}>
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
        <button type="button" className="btn primary big block" onClick={() => void startNew()}>
          すぐに あそぶ
        </button>
        <button type="button" className="btn block" onClick={() => setStage('tutorial')}>
          あそびかたを みる
        </button>
      </div>
    </main>
  );
}

function DetectivePlay({ session, draft, onAgain, onQuit }: { session: Session; draft: Draft; onAgain(): void; onQuit(): void }) {
  const { repo } = useProfile();
  const [state, setState] = useState<DetectiveState>(draft.state);
  const stateRef = useRef(state);
  stateRef.current = state;
  const sessionRef = useRef<Session>(session);
  const finishedRef = useRef(false);
  const [message, setMessage] = useState<{ text: string; kind: 'result' | 'warn' | 'good'; n: number } | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const { ref: roomRef, width: roomW } = useRoom<HTMLDivElement>();

  /** 途中の 状態を 保存（おわったら 記録と いっしょに 1かいだけ 書く） */
  const persist = useCallback(
    (s: DetectiveState) => {
      if (s.status === 'playing') {
        const d: Draft = { v: 1, attemptId: draft.attemptId, startedAt: draft.startedAt, state: s };
        const next: Session = { ...sessionRef.current, activeDraft: d };
        sessionRef.current = next;
        void repo.saveSession(next).catch(() => undefined);
        return;
      }
      if (finishedRef.current) return;
      finishedRef.current = true;
      const cleared = s.status === 'cleared';
      const summary: DetectiveSummary = { outcome: cleared ? 'cleared' : 'over', questions: s.guesses.length, secret: s.secret };
      const done: Session = { ...sessionRef.current, status: 'completed', completedAt: nowIso(), activeDraft: undefined, summary };
      sessionRef.current = done;
      const attempt: StoredAttempt = {
        id: draft.attemptId,
        profileId: done.profileId,
        sessionId: done.id,
        mode: 'game',
        gameId: GAME_ID,
        difficulty: FIXED_DIFFICULTY,
        questionKey: numberDetective.key({ secret: s.secret }),
        generatorVersion: numberDetective.generatorVersion,
        questionSnapshot: { secret: s.secret },
        answerSnapshot: { guesses: s.guesses, outcome: summary.outcome },
        firstTryCorrect: cleared && s.guesses.length === 1,
        finalCorrect: cleared,
        retryCount: s.guesses.filter((g) => g.eat !== CODE_LENGTH).length,
        hintsUsed: 0,
        elapsedActiveMs: Date.now() - draft.startedAt,
        answeredAt: nowIso(),
      };
      void repo.saveAttemptAndSession(attempt, done).catch(() => undefined);
    },
    [repo, draft.attemptId, draft.startedAt],
  );

  // 入力中の すうじは 少し 待ってから 保存。アプリを かくした・画面を はなれる ときは すぐ 保存
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pending = useRef(false);
  const saveSoon = () => {
    pending.current = true;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      pending.current = false;
      persist(stateRef.current);
    }, 300);
  };
  useEffect(() => {
    const flush = () => {
      if (!pending.current) return;
      clearTimeout(timer.current);
      pending.current = false;
      persist(stateRef.current);
    };
    const onVis = () => document.visibilityState === 'hidden' && flush();
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('pagehide', flush);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('pagehide', flush);
      flush();
    };
  }, [persist]);

  const edit = (f: (s: DetectiveState) => DetectiveState) => {
    const s = stateRef.current;
    const next = f(s);
    if (next === s) return;
    play('tap');
    stateRef.current = next;
    setState(next);
    if (message?.kind === 'warn') setMessage(null);
    saveSoon();
  };

  const doAsk = () => {
    const s = stateRef.current;
    const r = ask(s);
    if (r.outcome === 'repeated') {
      play('soft');
      setMessage({ text: 'この ならびは もう しつもんしたよ', kind: 'warn', n: Date.now() });
      return;
    }
    if (r.outcome !== 'asked' || !r.result) return;
    clearTimeout(timer.current);
    pending.current = false;
    stateRef.current = r.state;
    setState(r.state);
    persist(r.state);
    const text = r.state.status === 'cleared' ? 'せいかい！' : resultText(r.result);
    if (r.state.status === 'cleared') play('complete');
    else play(r.result.eat + r.result.bite > 0 ? 'correct' : 'soft');
    setMessage({ text, kind: r.state.status === 'cleared' ? 'good' : 'result', n: Date.now() });
    speak(r.state.status === 'over' ? `おしかったね。こたえは ${r.state.secret.split('').join(' ')} だったよ` : text);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (helpOpen || e.metaKey || e.ctrlKey || e.altKey) return;
      if (/^[0-9]$/.test(e.key)) {
        e.preventDefault();
        edit((s) => typeDigit(s, e.key));
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        edit(deleteDigit);
      } else if (e.key === 'Enter') {
        // ボタンに フォーカスが ある ときは その ボタンの Enter に まかせる
        if (document.activeElement instanceof HTMLButtonElement) return;
        e.preventDefault();
        doAsk();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const finished = state.status !== 'playing';
  const left = questionsLeft(state);
  const canAsk = !finished && state.input.length === CODE_LENGTH;
  // 履歴の 1マスの はばで 見せかたを かえる：ひろい・すこし せまい→すうじの よこに けっかを 2だんで、とても せまい→けっかを すうじの したへ（文字は はぶかない）
  // しきいは 文字の 大きさ（rem）で きめる（「文字を 大きく」でも はみ出さない）
  const rem = typeof window !== 'undefined' ? parseFloat(getComputedStyle(document.documentElement).fontSize) || 16 : 16;
  const cellRem = (roomW - 4) / 2 / rem;
  const density: Density = cellRem >= DENSITY_REM.wide ? 'wide' : cellRem >= DENSITY_REM.mid ? 'mid' : cellRem >= DENSITY_REM.tight ? 'tight' : 'two-line';

  const pad = (
    <div className="stack" style={{ gap: 6 }} data-testid="detective-pad">
      <div className="row center" style={{ gap: 8, flexWrap: 'nowrap' }} role="group" aria-label="しつもんする すうじ">
        {Array.from({ length: CODE_LENGTH }, (_, i) => {
          const d = state.input[i];
          const now = i === state.input.length;
          return (
            <span
              key={i}
              data-testid={`detective-slot-${i}`}
              aria-label={`${i + 1}つめ：${d ?? 'まだ'}`}
              style={{
                width: 54,
                height: 50,
                display: 'grid',
                placeItems: 'center',
                borderRadius: 12,
                fontSize: '2rem',
                fontWeight: 900,
                background: d ? '#fff' : '#f5f3ff',
                border: now ? '3px solid #7c3aed' : '2px solid #c4b5fd',
                color: '#1b2838',
              }}
            >
              {d ?? ''}
            </span>
          );
        })}
      </div>
      <div role="group" aria-label="すうじボタン" style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: 6 }}>
        {[...ALL_DIGITS.slice(1), '0'].map((d) => {
          const used = state.input.includes(d);
          return (
            <button
              key={d}
              type="button"
              className="btn"
              aria-label={used ? `${d}（えらんでいる）` : d}
              onClick={() => edit((s) => typeDigit(s, d))}
              disabled={used || state.input.length >= CODE_LENGTH}
              style={{ minHeight: 48, minWidth: 0, padding: 0, fontSize: '1.4rem', fontWeight: 900, opacity: used ? 0.35 : 1 }}
            >
              {d}
            </button>
          );
        })}
      </div>
      <div className="row" style={{ gap: 6, flexWrap: 'nowrap' }}>
        <button type="button" className="btn" onClick={() => edit(deleteDigit)} disabled={state.input.length === 0} style={{ flex: 1, minWidth: 0, minHeight: 48, padding: '0 4px' }}>
          1つ けす
        </button>
        <button type="button" className="btn" onClick={() => edit(clearInput)} disabled={state.input.length === 0} style={{ flex: 1, minWidth: 0, minHeight: 48, padding: '0 4px' }}>
          ぜんぶ けす
        </button>
        <button type="button" className="btn primary" onClick={doAsk} disabled={!canAsk} style={{ flex: 1.8, minWidth: 0, minHeight: 48, padding: '0 6px', lineHeight: 1.15 }}>
          この すうじで しつもん！
        </button>
      </div>
    </div>
  );

  const endButtons = (
    <div className="row" style={{ gap: 8, flexWrap: 'nowrap' }}>
      <button type="button" className="btn primary big" onClick={onAgain} style={{ flex: 1, minWidth: 0, padding: '0 8px' }}>
        もういちど あそぶ
      </button>
      <button type="button" className="btn big" onClick={() => navigate('/play')} style={{ flex: 1, minWidth: 0, padding: '0 8px' }}>
        ゲーム いちらんへ
      </button>
    </div>
  );

  return (
    <main className="screen" style={{ ['--accent' as string]: '#7c3aed', ['--accent-soft' as string]: '#f3e8ff', maxWidth: 760 }}>
      <TopBar title={meta.title} onBack={onQuit} right={<SoundToggle />} />
      <DockLayout footer={finished ? endButtons : pad}>
        <section className="stack" style={{ gap: 8 }}>
          <div className="card stack" style={{ padding: '8px 12px', gap: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'space-between', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="small" style={{ fontWeight: 800, lineHeight: 1.2, fontSize: '0.75rem', whiteSpace: 'nowrap' }}>
                  ひみつの
                  <br />
                  すうじ
                </span>
                <div
                  style={{ display: 'flex', gap: 4 }}
                  data-testid="detective-secret"
                  aria-label={finished ? `ひみつの すうじは ${state.secret.split('').join(' ')}` : 'ひみつの すうじ（まだ ないしょ）'}
                  role="img"
                >
                  {Array.from({ length: CODE_LENGTH }, (_, i) => (
                    <span
                      key={i}
                      aria-hidden
                      style={{
                        width: 32,
                        height: 42,
                        display: 'grid',
                        placeItems: 'center',
                        borderRadius: 10,
                        fontSize: '1.6rem',
                        fontWeight: 900,
                        background: finished ? '#fff' : '#ede9fe',
                        color: finished ? '#1b2838' : '#7c3aed',
                        border: '2px solid #c4b5fd',
                      }}
                    >
                      {finished ? state.secret[i] : '？'}
                    </span>
                  ))}
                </div>
              </div>
              <span data-testid="detective-left" style={{ fontWeight: 900, fontSize: '0.92rem', whiteSpace: 'nowrap', marginLeft: 'auto' }}>
                のこり <span style={{ fontSize: '1.3rem', color: left <= 3 && !finished ? '#c2410c' : '#1b2838' }}>{left}</span>かい
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div
                key={finished ? 'end' : (message?.n ?? 0)}
                role="status"
                aria-live="polite"
                data-testid={finished ? 'detective-result' : 'detective-message'}
                className={finished || (message && message.kind !== 'warn') ? 'pop' : undefined}
                style={{
                  flex: 1,
                  minWidth: 0,
                  minHeight: 44,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  textAlign: 'center',
                  fontWeight: 900,
                  flexDirection: finished ? 'column' : 'row',
                  fontSize: !message && !finished ? '0.85rem' : message?.kind === 'warn' && !finished ? '0.9rem' : '1rem',
                  lineHeight: 1.2,
                  whiteSpace: 'normal',
                  padding: '2px 8px',
                  borderRadius: 12,
                  background: finished
                    ? state.status === 'cleared'
                      ? '#dcfce7'
                      : '#f5f3ff'
                    : !message
                      ? 'transparent'
                      : message.kind === 'warn'
                        ? '#fff7ed'
                        : message.kind === 'good'
                          ? '#dcfce7'
                          : '#f5f3ff',
                  color: !message && !finished ? '#64748b' : message?.kind === 'warn' && !finished ? '#9a3412' : '#1b2838',
                }}
              >
                {finished ? (
                  state.status === 'cleared' ? (
                    <>
                      <span style={{ fontSize: '1.2rem' }}>せいかい！</span>
                      <span>{state.guesses.length}かいで あてたよ！</span>
                    </>
                  ) : (
                    <>
                      <span style={{ fontSize: '1.2rem' }}>おしかったね！</span>
                      <span>こたえは {state.secret} だったよ！</span>
                    </>
                  )
                ) : (
                  (message?.text ?? '3つ えらんで しつもんしよう')
                )}
              </div>
              <button type="button" className="btn" onClick={() => setHelpOpen(true)} style={{ minHeight: 44, padding: '0 8px', whiteSpace: 'nowrap', fontSize: '0.85rem', flexShrink: 0 }}>
                ？ あそびかた
              </button>
            </div>
          </div>

          <div ref={roomRef}>
            <History guesses={state.guesses} density={density} />
          </div>
        </section>
      </DockLayout>
      {helpOpen && (
        <Modal title="あそびかた" onClose={() => setHelpOpen(false)}>
          <HowToPlay compact />
          <button type="button" className="btn primary block" onClick={() => setHelpOpen(false)} style={{ marginTop: 8 }}>
            とじる
          </button>
        </Modal>
      )}
    </main>
  );
}

/** けっかの 数（「ぴったり 1」「ばしょちがい 2」。いろ と もじ の 両方で） */
function Count({ kind, n, size = 'lg', block = false }: { kind: 'eat' | 'bite'; n: number; size?: 'lg' | 'md' | 'sm'; block?: boolean }) {
  const eat = kind === 'eat';
  const color = eat ? EAT_COLOR : BITE_COLOR;
  const label = { lg: '0.85rem', md: '0.74rem', sm: '0.62rem' }[size];
  const num = { lg: '1.25rem', md: '1rem', sm: '0.9rem' }[size];
  return (
    <span
      data-kind={kind}
      style={{
        display: block ? 'flex' : 'inline-flex',
        alignItems: 'baseline',
        justifyContent: 'space-between',
        gap: size === 'sm' ? 3 : 4,
        padding: size === 'lg' ? '2px 10px' : size === 'md' ? '0 6px' : '0 2px',
        borderRadius: 999,
        background: n > 0 ? (eat ? '#dcfce7' : '#fef3c7') : '#f1f5f9',
        color: n > 0 ? color : '#64748b',
        fontWeight: 900,
        whiteSpace: 'nowrap',
        lineHeight: size === 'lg' ? 1.25 : 1.06,
      }}
    >
      <span style={{ fontSize: label }}>{RESULT_NAMES[kind]}</span>
      <span style={{ fontSize: num }}>{n}</span>
    </span>
  );
}

/** 履歴の 見せかたを かえる 1マスの はば（rem）。実測で きめた（数字・けっかが きれない） */
const DENSITY_REM = { wide: 11.8, mid: 10.6, tight: 8.4 } as const;

/**
 * 質問の 履歴。10かいぶんの 枠を いつも 2れつ × 5だん（ひだり 1〜5かいめ・みぎ 6〜10かいめ）に ならべ、
 * スクロール なしで ぜんぶ くらべられる ように する。まだの 枠は うすく 番号だけ（ふえても 位置が ずれない）。
 * 1マスは「番号・3つの すうじ」の よこに「ぴったり」「ばしょちがい」を 2だんで ならべる（せまい ときは すうじの したへ）。
 */
type Density = 'wide' | 'mid' | 'tight' | 'two-line';

function History({ guesses, density }: { guesses: GuessRecord[]; density: Density }) {
  const twoLine = density === 'two-line';
  const tight = density === 'tight';
  const mid = density === 'mid';
  const cellMin = twoLine ? 66 : 40;
  return (
    <ol
      aria-label="しつもんの きろく"
      data-testid="detective-history"
      data-layout={density}
      style={{
        listStyle: 'none',
        margin: 0,
        padding: 0,
        display: 'grid',
        gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
        gridTemplateRows: `repeat(${MAX_QUESTIONS / 2}, auto)`,
        gridAutoFlow: 'column',
        gap: 4,
      }}
    >
      {Array.from({ length: MAX_QUESTIONS }, (_, i) => {
        const g = guesses[i];
        const no = (
          <span className="small muted" style={{ fontWeight: 800, fontSize: tight ? '0.66rem' : '0.75rem', minWidth: tight || mid ? '0.9em' : '1.2em', textAlign: 'right' }} aria-hidden>
            {i + 1}
          </span>
        );
        if (!g)
          return (
            <li
              key={`e${i}`}
              data-testid="detective-empty"
              aria-hidden
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px', minHeight: cellMin, borderRadius: 10, border: '1.5px dashed #e2e8f0', opacity: 0.7 }}
            >
              {no}
            </li>
          );
        const latest = i === guesses.length - 1;
        const digits = (
          <span style={{ fontSize: tight ? '1rem' : mid ? '1.08rem' : '1.2rem', fontWeight: 900, letterSpacing: tight || mid ? 0 : '0.1em' }} aria-hidden>
            {g.guess}
          </span>
        );
        const results = (
          <span style={{ display: 'flex', flexDirection: 'column', gap: 1, marginLeft: twoLine ? 0 : 'auto', minWidth: 0 }} aria-hidden>
            <Count kind="eat" n={g.eat} size={tight ? 'sm' : 'md'} block />
            <Count kind="bite" n={g.bite} size={tight ? 'sm' : 'md'} block />
          </span>
        );
        return (
          <li
            key={g.guess}
            data-testid="detective-row"
            data-latest={latest ? 'true' : undefined}
            aria-label={`${i + 1}かいめ ${g.guess.split('').join(' ')}：${resultLabel(g)}`}
            style={{
              display: 'flex',
              flexDirection: twoLine ? 'column' : 'row',
              // 入りきらない ときは けっかを つぎの 行へ（文字を きらない）
              flexWrap: twoLine ? 'nowrap' : 'wrap',
              alignItems: twoLine ? 'stretch' : 'center',
              gap: tight ? 2 : mid ? 3 : 5,
              rowGap: 2,
              padding: tight ? '1px 3px' : mid ? '1px 4px' : '2px 6px',
              minHeight: cellMin,
              borderRadius: 10,
              background: latest ? '#f5f3ff' : '#fff',
              border: latest ? '2px solid #7c3aed' : '1px solid #e2e8f0',
            }}
          >
            {twoLine ? (
              <>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {no}
                  {digits}
                </span>
                {results}
              </>
            ) : (
              <>
                {no}
                {digits}
                {results}
              </>
            )}
          </li>
        );
      })}
    </ol>
  );
}

/** あそびかた（決まった 例で せつめい）。ゲームの 前・とちゅうの どちらでも 使う */
function HowToPlay({ compact = false }: { compact?: boolean }) {
  const tile = (d: string, mark?: 'eat' | 'bite') => (
    <span
      key={d}
      style={{
        width: 36,
        height: 40,
        display: 'inline-grid',
        placeItems: 'center',
        borderRadius: 8,
        fontSize: '1.4rem',
        fontWeight: 900,
        background: mark === 'eat' ? '#dcfce7' : mark === 'bite' ? '#fef3c7' : '#fff',
        border: `2px solid ${mark === 'eat' ? EAT_COLOR : mark === 'bite' ? BITE_COLOR : '#cbd5e1'}`,
      }}
    >
      {d}
    </span>
  );
  const ex = (guess: string, marks: (('eat' | 'bite') | undefined)[], eat: number, bite: number, note: string) => (
    <div className="row" style={{ gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
      <span style={{ display: 'inline-flex', gap: 4 }}>{guess.split('').map((d, i) => tile(d, marks[i]))}</span>
      <span>→</span>
      <Count kind="eat" n={eat} />
      <Count kind="bite" n={bite} />
      <span className="small muted">{note}</span>
    </div>
  );
  const step = (n: number, title: string, body: ReactNode) => (
    <div className="card stack" style={{ gap: 6, padding: compact ? 10 : undefined }}>
      <strong>
        {n}. {title}
      </strong>
      {body}
    </div>
  );
  return (
    <div className="stack" style={{ gap: compact ? 6 : 10 }} data-testid="detective-howto">
      {step(
        1,
        'ひみつの 3つの すうじを よそうしよう',
        <p style={{ margin: 0 }}>
          コンピューターが 0〜9 から ちがう すうじを 3つ えらんで ならべたよ。れい：ひみつは {tile('4')}
          {tile('2')}
          {tile('7')}
        </p>,
      )}
      {step(2, `「${RESULT_NAMES.eat}」は ${RESULT_MEANINGS.eat}`, ex('123', [undefined, 'eat', undefined], 1, 0, '2 が おなじ ばしょ'))}
      {step(3, `「${RESULT_NAMES.bite}」は ${RESULT_MEANINGS.bite}`, ex('740', ['bite', 'bite', undefined], 0, 2, '7 と 4 は あるけど ばしょが ちがう'))}
      {step(
        4,
        'けっかを みて つぎの すうじを かんがえよう',
        <>
          {ex('472', ['eat', 'bite', 'bite'], 1, 2, '3つとも ある！ ならびかえて みよう')}
          <p className="small muted" style={{ margin: 0 }}>
            ほんとうの ゲームでは、どの すうじが {RESULT_NAMES.eat}か {RESULT_NAMES.bite}かは おしえないよ。かずだけ わかるよ。
          </p>
        </>,
      )}
      {step(5, `${MAX_QUESTIONS}かい いないに 3つとも ${RESULT_NAMES.eat}を めざそう！`, ex('427', ['eat', 'eat', 'eat'], 3, 0, 'せいかい！'))}
    </div>
  );
}
