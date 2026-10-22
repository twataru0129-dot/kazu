import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useProfile } from '../app/AppContext';
import { navigate } from '../app/router';
import { play } from '../audio/sfx';
import { speak } from '../audio/speech';
import { DockLayout } from '../components/Dock';
import { CompactPad } from '../components/CompactPad';
import { Confirm, Feedback, SoundToggle, TopBar } from '../components/ui';
import {
  bestGridTime,
  checkGrid,
  emptyInputs,
  filledCount,
  generateGrid,
  GRID_CALC_ID,
  GRID_DIFF_LABEL,
  GRID_GENERATOR_VERSION,
  GRID_OPS,
  GRID_SIZE,
  gridKey,
  gridLevelKey,
  isGridOpAllowed,
  nextEmpty,
  type GridInputs,
  type GridPuzzle,
  type GridSummary,
} from '../domain/arithmetic/gridCalc';
import { createRng, newId, randomSeed } from '../domain/random';
import { DIFFICULTIES, DIFFICULTY_LABEL, OP_LABEL, OP_SYMBOL, type Difficulty, type Op } from '../domain/types';
import { nowIso } from '../persistence/repo';
import type { Session, StoredAttempt } from '../persistence/types';
import { MODES } from '../config/theme';
import { formatClock, useActiveTimer } from '../games/useActiveTimer';

/** 「けいさん」の 2つの あそびかた（いつもの けいさん／マスけいさん） */
export function CalcModeTabs({ current }: { current: 'calc' | 'grid' }) {
  return (
    <div className="grid-tabs" role="tablist" aria-label="けいさんの あそびかた" style={{ ['--cols' as string]: 2, ['--n' as string]: 2 }}>
      <button type="button" role="tab" className="chip" aria-selected={current === 'calc'} onClick={() => current !== 'calc' && navigate('/calc', { replace: true })}>
        いつもの けいさん
      </button>
      <button type="button" role="tab" className="chip" aria-selected={current === 'grid'} onClick={() => current !== 'grid' && navigate('/calc/grid', { replace: true })}>
        マスけいさん
      </button>
    </div>
  );
}

interface GridSettings {
  difficulty: Difficulty;
  op: Op;
  timerOn: boolean;
}
const DEFAULT_GRID: GridSettings = { difficulty: 'easy', op: 'add', timerOn: false };

/** 途中保存（セッションの activeDraft） */
interface GridDraft {
  puzzle: GridPuzzle;
  inputs: GridInputs;
  /** こたえあわせの 結果（なおすと そのマスは けす） */
  marks: (('ok' | 'ng') | null)[][] | null;
  sel: [number, number];
  checks: number;
  firstCorrect: number | null;
  timerOn: boolean;
  activeMs: number;
  attemptId: string;
}

const accent = { ['--accent' as string]: MODES.calc.color, ['--accent-soft' as string]: MODES.calc.soft };

export function GridCalcScreen() {
  const { profile, settings, repo, updateSettings } = useProfile();
  const savedAll = settings.lastCalcSettings as { grid?: GridSettings } | undefined;
  const saved = savedAll?.grid;
  const [conf, setConf] = useState<GridSettings>(saved && isGridOpAllowed(saved.difficulty, saved.op) ? saved : DEFAULT_GRID);
  const [stage, setStage] = useState<'setup' | 'play' | 'done'>('setup');
  const [draftSession, setDraftSession] = useState<Session | null>(null);
  const [history, setHistory] = useState<GridSummary[]>([]);
  const [run, setRun] = useState<{ session: Session; draft: GridDraft; key: number } | null>(null);
  const [result, setResult] = useState<{ summary: GridSummary; best: number | null; newBest: boolean } | null>(null);

  const loadHistory = useCallback(async () => {
    const ss = await repo.listSessions(profile.id);
    setHistory(ss.filter((s) => s.gameId === GRID_CALC_ID && s.status === 'completed' && s.summary).map((s) => s.summary as GridSummary));
    setDraftSession(ss.find((s) => s.gameId === GRID_CALC_ID && s.status === 'inProgress' && s.activeDraft !== undefined) ?? null);
  }, [repo, profile.id]);
  useEffect(() => {
    if (stage === 'setup') void loadHistory();
  }, [stage, loadHistory]);

  const startNew = (c: GridSettings) => {
    void updateSettings({ lastCalcSettings: { ...(savedAll ?? {}), grid: c } }).catch(() => undefined);
    const puzzle = generateGrid(createRng(randomSeed()), c.difficulty, c.op);
    const draft: GridDraft = { puzzle, inputs: emptyInputs(puzzle), marks: null, sel: [0, 0], checks: 0, firstCorrect: null, timerOn: c.timerOn, activeMs: 0, attemptId: newId() };
    const session: Session = {
      id: newId(),
      profileId: profile.id,
      mode: 'calculation',
      gameId: GRID_CALC_ID,
      createdAt: nowIso(),
      updatedAt: nowIso(),
      status: 'inProgress',
      settingsSnapshot: { ...c, kind: GRID_CALC_ID },
      activeDraft: draft,
    };
    void repo.saveSession(session).catch(() => undefined);
    setRun({ session, draft, key: Date.now() });
    setResult(null);
    setStage('play');
  };

  const resume = (s: Session) => {
    setConf({ difficulty: (s.activeDraft as GridDraft).puzzle.difficulty, op: (s.activeDraft as GridDraft).puzzle.op, timerOn: (s.activeDraft as GridDraft).timerOn });
    setRun({ session: s, draft: s.activeDraft as GridDraft, key: Date.now() });
    setResult(null);
    setStage('play');
  };

  if (stage === 'play' && run)
    return (
      <GridPlayer
        key={run.key}
        session={run.session}
        initial={run.draft}
        onQuit={() => setStage('setup')}
        onDone={(summary) => {
          const prev = bestGridTime(history, summary.difficulty, summary.op);
          const now = bestGridTime([...history, summary], summary.difficulty, summary.op);
          setResult({ summary, best: now, newBest: summary.timerOn && summary.perfect && (prev === null || summary.activeMs < prev) });
          setStage('done');
        }}
      />
    );

  if (stage === 'done' && result) {
    const s = result.summary;
    return (
      <main className="screen narrow" style={accent}>
        <TopBar title="マスけいさん" onBack={() => setStage('setup')} />
        <div className="card stack center-text pop" data-testid="grid-result">
          <div style={{ fontSize: '3rem' }} aria-hidden>
            🎉
          </div>
          <h2 style={{ margin: 0 }}>
            {s.cells}マス ぜんぶ できたね！
          </h2>
          <p style={{ margin: 0 }}>
            {GRID_DIFF_LABEL[s.difficulty]}・{OP_LABEL[s.op]}
          </p>
          <p style={{ margin: 0 }}>
            はじめの こたえあわせ：{s.firstCorrect}/{s.cells}マス（{Math.round((s.firstCorrect / s.cells) * 100)}%）
          </p>
          <p style={{ margin: 0 }}>なおした かいすう：{s.fixes}かい</p>
          {s.timerOn && (
            <p style={{ margin: 0, fontWeight: 800 }} data-testid="grid-time">
              じかん：{formatClock(s.activeMs)}
              {result.newBest && <span style={{ color: '#d97706' }}>　じこベスト！</span>}
            </p>
          )}
          {s.timerOn && !s.perfect && <p className="small muted">（なおして できた ときは ベストに いれないよ）</p>}
          <button type="button" className="btn primary big" onClick={() => startNew(conf)}>
            おなじ せっていで もういちど
          </button>
          <button type="button" className="btn" onClick={() => setStage('setup')}>
            せっていを かえる
          </button>
          <button type="button" className="btn" onClick={() => navigate('/home')}>
            ホームへ
          </button>
        </div>
      </main>
    );
  }

  const best = bestGridTime(history, conf.difficulty, conf.op);
  return (
    <main className="screen narrow" style={accent}>
      <TopBar title="けいさん" onBack={() => navigate('/home')} right={<SoundToggle />} />
      <CalcModeTabs current="grid" />
      <p className="small muted" style={{ margin: 0 }}>
        ひだりの かずと うえの かずを けいさんして、まじわる マスに こたえを いれよう。
      </p>
      {draftSession && (
        <div className="card stack">
          <strong>つづきが あるよ</strong>
          <div className="row">
            <button type="button" className="btn primary" onClick={() => resume(draftSession)}>
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
        <span className="field-label">マスの かず・むずかしさ</span>
        <div className="grid-tabs" role="radiogroup" aria-label="むずかしさ" style={{ ['--cols' as string]: 2, ['--n' as string]: 4 }}>
          {DIFFICULTIES.map((d) => (
            <button
              key={d}
              type="button"
              role="radio"
              className="chip"
              aria-checked={conf.difficulty === d}
              aria-pressed={conf.difficulty === d}
              onClick={() => setConf({ ...conf, difficulty: d, op: isGridOpAllowed(d, conf.op) ? conf.op : 'add' })}
            >
              {DIFFICULTY_LABEL[d]}
              <span className="small" style={{ display: 'block', fontWeight: 400 }}>
                {GRID_DIFF_LABEL[d]}（{GRID_SIZE[d] ** 2}マス）
              </span>
            </button>
          ))}
        </div>
        <span className="field-label">けいさんの しゅるい</span>
        <div className="chips" role="radiogroup" aria-label="けいさんの しゅるい">
          {(['add', 'subtract', 'multiply', 'divide'] as Op[]).map((op) => {
            const ok = GRID_OPS[conf.difficulty].includes(op);
            return (
              <button key={op} type="button" role="radio" className="chip" aria-checked={conf.op === op} aria-pressed={conf.op === op} disabled={!ok} onClick={() => setConf({ ...conf, op })} style={{ opacity: ok ? 1 : 0.4 }}>
                {OP_SYMBOL[op]} {OP_LABEL[op]}
              </button>
            );
          })}
        </div>
        {conf.difficulty !== 'challenge' && <p className="small muted" style={{ margin: 0 }}>{conf.difficulty === 'easy' ? 'ふつう' : conf.difficulty === 'normal' ? 'むずかしい' : 'チャレンジ'}に すると えらべる けいさんが ふえるよ</p>}
        <span className="field-label">タイマー</span>
        <div className="chips" role="radiogroup" aria-label="タイマー">
          <button type="button" role="radio" className="chip" aria-checked={!conf.timerOn} aria-pressed={!conf.timerOn} onClick={() => setConf({ ...conf, timerOn: false })}>
            ださない
          </button>
          <button type="button" role="radio" className="chip" aria-checked={conf.timerOn} aria-pressed={conf.timerOn} onClick={() => setConf({ ...conf, timerOn: true })}>
            じかんを はかる
          </button>
        </div>
        <p className="small muted" style={{ margin: 0 }}>
          じかんの せいげんは ないよ。{best !== null ? `じこベスト（おなじ せってい）：${formatClock(best)}` : ''}
        </p>
      </div>
      <button type="button" className="btn primary big block" onClick={() => startNew(conf)}>
        はじめる
      </button>
    </main>
  );
}

function GridPlayer({ session, initial, onQuit, onDone }: { session: Session; initial: GridDraft; onQuit(): void; onDone(s: GridSummary): void }) {
  const { profile, repo } = useProfile();
  const p = initial.puzzle;
  const n = p.left.length;
  const m = p.top.length;
  const [inputs, setInputs] = useState<GridInputs>(initial.inputs);
  const [marks, setMarks] = useState(initial.marks);
  const [sel, setSel] = useState<[number, number]>(initial.sel);
  const [checks, setChecks] = useState(initial.checks);
  const [firstCorrect, setFirstCorrect] = useState(initial.firstCorrect);
  const [paused, setPaused] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: 'good' | 'try'; text: string; n: number } | null>(null);
  const [zoomOut, setZoomOut] = useState(false);
  const timerOn = initial.timerOn;
  const timer = useActiveTimer(!paused, initial.activeMs);
  const sessionRef = useRef(session);
  const done = useRef(false);

  const draftOf = (): GridDraft => ({ puzzle: p, inputs: stateRef.current.inputs, marks: stateRef.current.marks, sel: stateRef.current.sel, checks: stateRef.current.checks, firstCorrect: stateRef.current.firstCorrect, timerOn, activeMs: timer.read(), attemptId: initial.attemptId });
  const stateRef = useRef({ inputs, marks, sel, checks, firstCorrect });
  stateRef.current = { inputs, marks, sel, checks, firstCorrect };

  // 途中保存：操作の あと すこし まって 書く。アプリを かくした・とじた ときは すぐ 書く
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pending = useRef(false);
  const persist = useCallback(() => {
    if (done.current) return;
    pending.current = false;
    sessionRef.current = { ...sessionRef.current, updatedAt: nowIso(), activeDraft: draftOf() };
    void repo.saveSession(sessionRef.current).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repo]);
  const scheduleSave = () => {
    pending.current = true;
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(persist, 300);
  };
  useEffect(() => {
    const flush = () => {
      if (!pending.current && document.visibilityState !== 'hidden') return;
      clearTimeout(saveTimer.current);
      persist();
    };
    const onVis = () => document.visibilityState === 'hidden' && flush();
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('pagehide', flush);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('pagehide', flush);
      clearTimeout(saveTimer.current);
      // 画面を はなれる ときも 書く（時間も のこす）
      persist();
    };
  }, [persist]);

  const select = (r: number, c: number) => {
    setSel([r, c]);
    scheduleSave();
  };
  const setCell = (v: string) => {
    const [r, c] = sel;
    const next = inputs.map((row, i) => (i === r ? row.map((x, j) => (j === c ? v : x)) : row));
    setInputs(next);
    if (marks?.[r][c]) setMarks(marks.map((row, i) => (i === r ? row.map((x, j) => (j === c ? null : x)) : row)));
    scheduleSave();
  };
  const goNext = () => {
    const nx = nextEmpty(inputs, sel);
    if (nx) select(nx[0], nx[1]);
    else {
      // ぜんぶ うまったら つぎの マスへ（さいごから さいしょへ）
      const i = (sel[0] * m + sel[1] + 1) % (n * m);
      select(Math.floor(i / m), i % m);
    }
  };
  const goPrev = () => {
    const i = (sel[0] * m + sel[1] - 1 + n * m) % (n * m);
    select(Math.floor(i / m), i % m);
  };
  const clearAll = () => {
    setInputs(emptyInputs(p));
    setMarks(null);
    setSel([0, 0]);
    setConfirmClear(false);
    scheduleSave();
  };

  // 矢印キーで マスを うごかす（数字・Enter・Backspace は 数字キーの しくみで うけとる）
  const selRef = useRef(sel);
  selRef.current = sel;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const d = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }[e.key];
      if (!d) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA')) return;
      e.preventDefault();
      const [r, c] = selRef.current;
      setSel([Math.min(n - 1, Math.max(0, r + d[0])), Math.min(m - 1, Math.max(0, c + d[1]))]);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [n, m]);

  const filled = filledCount(inputs);
  const total = n * m;
  const correctNow = marks ? marks.flat().filter((x) => x === 'ok').length : null;

  const check = () => {
    if (filled < total || done.current) return;
    const res = checkGrid(p, inputs);
    const nextChecks = checks + 1;
    const first = firstCorrect ?? res.correct;
    setChecks(nextChecks);
    setFirstCorrect(first);
    setMarks(res.marks);
    const activeMs = timer.read();
    const attempt: StoredAttempt = {
      id: initial.attemptId,
      profileId: profile.id,
      sessionId: sessionRef.current.id,
      mode: 'calculation',
      gameId: GRID_CALC_ID,
      op: p.op,
      difficulty: p.difficulty,
      levelKey: gridLevelKey(p.difficulty, p.op),
      questionKey: gridKey(p),
      generatorVersion: GRID_GENERATOR_VERSION,
      questionSnapshot: p,
      answerSnapshot: { inputs, checks: nextChecks, firstCorrect: first, correct: res.correct, total, timerOn },
      firstTryCorrect: first === total,
      finalCorrect: res.allCorrect,
      retryCount: nextChecks - 1,
      hintsUsed: 0,
      elapsedActiveMs: Math.round(activeMs),
      answeredAt: nowIso(),
    };
    void repo.saveAttempt(attempt).catch(() => undefined);
    if (res.allCorrect) {
      done.current = true;
      play('complete');
      speak('ぜんぶ せいかい');
      const summary: GridSummary = { difficulty: p.difficulty, op: p.op, cells: total, correct: res.correct, firstCorrect: first, fixes: nextChecks - 1, timerOn, activeMs: Math.round(activeMs), perfect: first === total };
      sessionRef.current = { ...sessionRef.current, status: 'completed', completedAt: nowIso(), updatedAt: nowIso(), activeDraft: undefined, summary };
      void repo.saveSession(sessionRef.current).catch(() => undefined);
      onDone(summary);
      return;
    }
    play('soft');
    setFeedback({ kind: 'try', text: `せいかい ${res.correct}/${total}マス。× の マスを なおして もういちど こたえあわせ しよう`, n: nextChecks });
    // さいしょの まちがいの マスへ
    const firstNg = res.marks.flatMap((row, r) => row.map((x, c) => (x === 'ng' ? [r, c] : null))).find(Boolean) as [number, number] | undefined;
    if (firstNg) setSel(firstNg);
    persistSoon();
  };
  const persistSoon = () => {
    scheduleSave();
  };

  // 表の 大きさ：3×3・5×5 は 大きく。10×10 は 押せる 大きさ（44px）で スクロール。ぜんたいを 見る ときは ちいさく
  // 3×3・5×5 は 画面に おさまる 大きさ（44〜64px）。10×10 は 押せる 大きさ（44px）で スクロール、ぜんたいを 見る ときは ちいさく
  const wrapRef = useRef<HTMLDivElement>(null);
  const [availH, setAvailH] = useState(400);
  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const dock = document.querySelector<HTMLElement>('[data-testid="dock"]');
    const update = () => {
      const top = el.getBoundingClientRect().top + window.scrollY;
      const viewH = window.visualViewport?.height ?? window.innerHeight;
      setAvailH(Math.max(150, viewH - top - (dock?.offsetHeight ?? 0) - 10));
    };
    update();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(update) : null;
    if (dock) ro?.observe(dock);
    window.addEventListener('resize', update);
    return () => {
      ro?.disconnect();
      window.removeEventListener('resize', update);
    };
  }, []);
  const fit = Math.floor((availH - 6) / (n + 1));
  const cell = n <= 5 ? Math.max(44, Math.min(64, fit)) : zoomOut ? 30 : 44;
  const head = n <= 5 ? cell : zoomOut ? 30 : 40;
  // 選んだ マスが 見える ように スクロール
  useEffect(() => {
    const el = document.querySelector<HTMLElement>(`[data-cell="${sel[0]}-${sel[1]}"]`);
    el?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  }, [sel]);

  const [r, c] = sel;
  const expr = `${p.left[r]} ${OP_SYMBOL[p.op]} ${p.top[c]}`;

  return (
    <main className="screen" style={{ ...accent, maxWidth: 760 }}>
      <TopBar
        title="マスけいさん"
        onBack={onQuit}
        right={
          <>
            {timerOn && (
              <span className="num" style={{ fontWeight: 800, whiteSpace: 'nowrap' }} data-testid="grid-timer" aria-label={`けいか じかん ${formatClock(timer.ms)}`}>
                {formatClock(timer.ms)}
              </span>
            )}
            {n > 5 && (
              <button type="button" className="chip" aria-pressed={zoomOut} aria-label={zoomOut ? 'おおきく する' : 'ぜんたいを みる'} onClick={() => setZoomOut(!zoomOut)} style={{ minHeight: 44, padding: '0 8px', fontSize: '0.85rem', flex: 'none' }}>
                {zoomOut ? 'おおきく' : 'ぜんたい'}
              </button>
            )}
            {timerOn && (
              <button type="button" className="btn" onClick={() => setPaused(!paused)} aria-pressed={paused}>
                {paused ? 'つづける' : 'やすむ'}
              </button>
            )}
            <SoundToggle />
          </>
        }
      />
      <DockLayout>
        <div className="card row" style={{ justifyContent: 'space-between', padding: '6px 10px', gap: 6, flexWrap: 'nowrap' }}>
          <div className="big-expr num" style={{ fontSize: 'clamp(1.4rem, 6.5vw, 2.4rem)', margin: 0, whiteSpace: 'nowrap' }} aria-live="polite" data-testid="grid-expr">
            {expr} = <span style={{ color: 'var(--accent)' }}>{inputs[r][c] || '?'}</span>
          </div>
          <div className="small" style={{ textAlign: 'right', lineHeight: 1.3, whiteSpace: 'nowrap' }} data-testid="grid-count">
            いれた {filled}/{total}
            <br />
            {correctNow !== null ? `せいかい ${correctNow}` : `のこり ${total - filled}`}
          </div>

        </div>
        <div className="row grid-actions" style={{ gap: 6, flexWrap: 'nowrap' }}>
          <button type="button" className="btn" onClick={goPrev} style={{ flex: 1, minWidth: 0, padding: '0 6px' }}>
            ひとつ もどる
          </button>
          <button type="button" className="btn" onClick={() => setConfirmClear(true)} disabled={filled === 0} style={{ flex: 1, minWidth: 0, padding: '0 6px' }}>
            ぜんぶ けす
          </button>
          <button type="button" className="btn primary" onClick={check} disabled={filled < total} style={{ flex: 1.3, minWidth: 0, padding: '0 6px' }}>
            こたえあわせ
          </button>
        </div>
        {feedback && (
          <Feedback key={feedback.n} kind={feedback.kind}>
            {feedback.text}
          </Feedback>
        )}
        <div ref={wrapRef} style={{ position: 'relative' }}>
          <div data-testid="grid-scroll" style={{ overflow: 'auto', maxHeight: availH, maxWidth: '100%', width: 'fit-content', margin: '0 auto', border: '2px solid #f3c9a6', borderRadius: 10, background: '#fff', touchAction: 'pan-x pan-y' }}>
            <table role="grid" aria-label="マスけいさんの ひょう" style={{ borderCollapse: 'separate', borderSpacing: 0 }}>
              <thead>
                <tr>
                  <th scope="col" style={{ position: 'sticky', top: 0, left: 0, zIndex: 3, width: head, height: head, background: '#f07a2a', color: '#fff', fontSize: '1.4rem' }} aria-label={OP_LABEL[p.op]}>
                    {OP_SYMBOL[p.op]}
                  </th>
                  {p.top.map((b, j) => (
                    <th key={j} scope="col" style={{ position: 'sticky', top: 0, zIndex: 2, minWidth: cell, height: head, background: j === c ? '#ffd8b8' : '#fff1e6', fontWeight: 800, fontSize: zoomOut ? '0.85rem' : '1.1rem', borderLeft: '1px solid #f3c9a6' }}>
                      {b}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {p.left.map((a, i) => (
                  <tr key={i}>
                    <th scope="row" style={{ position: 'sticky', left: 0, zIndex: 1, width: head, height: cell, background: i === r ? '#ffd8b8' : '#fff1e6', fontWeight: 800, fontSize: zoomOut ? '0.85rem' : '1.1rem', borderTop: '1px solid #f3c9a6' }}>
                      {a}
                    </th>
                    {p.top.map((b, j) => {
                      const v = inputs[i][j];
                      const mk = marks?.[i][j] ?? null;
                      const on = i === r && j === c;
                      return (
                        <td key={j} role="none" style={{ padding: 0, borderLeft: '1px solid #f3dccb', borderTop: '1px solid #f3dccb' }}>
                          <button
                            type="button"
                            role="gridcell"
                            data-cell={`${i}-${j}`}
                            aria-selected={on}
                            aria-label={`${a} ${OP_SYMBOL[p.op]} ${b}：${v === '' ? 'まだ' : v}${mk === 'ok' ? '（せいかい）' : mk === 'ng' ? '（ちがう）' : ''}`}
                            onClick={() => select(i, j)}
                            style={{
                              width: cell,
                              height: cell,
                              padding: 0,
                              border: 'none',
                              borderRadius: 0,
                              outline: on ? '3px solid #f07a2a' : undefined,
                              outlineOffset: -3,
                              background: mk === 'ok' ? '#dcf5e7' : mk === 'ng' ? '#fde2e0' : on ? '#fff7ef' : '#fff',
                              fontSize: zoomOut ? '0.8rem' : n <= 5 ? '1.4rem' : '1.05rem',
                              fontWeight: 800,
                              color: '#1b2838',
                              position: 'relative',
                            }}
                          >
                            {v}
                            {mk && (
                              <span aria-hidden style={{ position: 'absolute', right: 2, top: 0, fontSize: zoomOut ? '0.6rem' : '0.75rem', color: mk === 'ok' ? '#1f9d6a' : '#d9534f', fontWeight: 900 }}>
                                {mk === 'ok' ? '○' : '×'}
                              </span>
                            )}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {paused && (
            <div className="card center-text" style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', zIndex: 5 }}>
              <div className="stack">
                <strong>おやすみちゅう</strong>
                <span className="small muted">じかんは とまって いるよ</span>
                <button type="button" className="btn primary" onClick={() => setPaused(false)}>
                  つづける
                </button>
              </div>
            </div>
          )}
        </div>
        <CompactPad value={inputs[r][c]} onChange={setCell} onSubmit={goNext} submitLabel="つぎの マス" maxDigits={3} disabled={paused} allowEmptySubmit />
      </DockLayout>
      {confirmClear && <Confirm title="ぜんぶ けす" message="いれた こたえを ぜんぶ けしますか？" okLabel="けす" danger onOk={clearAll} onCancel={() => setConfirmClear(false)} />}
    </main>
  );
}
