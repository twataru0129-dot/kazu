import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useProfile } from '../../app/AppContext';
import { navigate } from '../../app/router';
import { play } from '../../audio/sfx';
import { NumberPad } from '../../components/NumberPad';
import { AnswerBox, Confirm, Modal, ProgressDots, SoundToggle, TopBar } from '../../components/ui';
import { MODES } from '../../config/theme';
import { explain } from '../../domain/arithmetic/explain';
import { ARITH_GENERATOR_VERSION, difficultyOf, formatProblem, judgeArith, type ArithProblem, type Carry, type Digits } from '../../domain/arithmetic/problems';
import { parseAnswer } from '../../domain/input';
import { createRng, newId, randomSeed } from '../../domain/random';
import { ActiveClock, DEFAULT_TEST_SETTINGS, describeSettings, formatMs, generateTest, scoreTest, settingsKey, type TestAnswer, type TestCount, type TestSettings } from '../../domain/tests/scoring';
import { completedTests, previousSame, type CompletedTest, type TestSummary } from '../../domain/tests/stats';
import { OP_LABEL, OP_SYMBOL, type Op } from '../../domain/types';
import { nowIso } from '../../persistence/repo';
import type { Session, StoredAttempt } from '../../persistence/types';

interface Draft {
  settings: TestSettings;
  problems: ArithProblem[];
  answers: (TestAnswer | null)[];
  index: number;
  activeMs: number;
}

const accent = { ['--accent' as string]: MODES.test.color, ['--accent-soft' as string]: MODES.test.soft };

function TestSettingsForm({ value, onChange }: { value: TestSettings; onChange(v: TestSettings): void }) {
  const toggle = (op: Op) => {
    const ops = value.ops.includes(op) ? value.ops.filter((o) => o !== op) : [...value.ops, op];
    if (ops.length) onChange({ ...value, ops });
  };
  const addSub = (op: 'add' | 'subtract') => (
    <div className="card" style={{ padding: 12 }}>
      <strong>
        {OP_SYMBOL[op]} {OP_LABEL[op]}
      </strong>
      <div className="chips" style={{ marginTop: 6 }}>
        {([1, 2, 3] as Digits[]).map((d) => (
          <button key={d} type="button" className="chip" aria-pressed={value[op].digits === d} onClick={() => onChange({ ...value, [op]: { ...value[op], digits: d } })}>
            {d}けた
          </button>
        ))}
      </div>
      <div className="chips" style={{ marginTop: 6 }}>
        {(
          [
            ['none', op === 'add' ? 'くりあがり なし' : 'くりさがり なし'],
            ['with', 'あり'],
            ['mixed', 'まぜる'],
          ] as [Carry, string][]
        ).map(([c, l]) => (
          <button key={c} type="button" className="chip" aria-pressed={value[op].carry === c} onClick={() => onChange({ ...value, [op]: { ...value[op], carry: c } })}>
            {l}
          </button>
        ))}
      </div>
    </div>
  );
  return (
    <div className="stack">
      <span className="field-label">けいさんの しゅるい（いくつでも）</span>
      <div className="chips">
        {(['add', 'subtract', 'multiply', 'divide'] as Op[]).map((op) => (
          <button key={op} type="button" className="chip" aria-pressed={value.ops.includes(op)} onClick={() => toggle(op)}>
            {OP_SYMBOL[op]} {OP_LABEL[op]}
          </button>
        ))}
      </div>
      {value.ops.includes('add') && addSub('add')}
      {value.ops.includes('subtract') && addSub('subtract')}
      {value.ops.includes('multiply') && (
        <div className="card" style={{ padding: 12 }}>
          <strong>× かけざん</strong>
          <div className="chips" style={{ marginTop: 6 }}>
            <button type="button" className="chip" aria-pressed={value.mul === 'kuku'} onClick={() => onChange({ ...value, mul: 'kuku' })}>
              くく
            </button>
            <button type="button" className="chip" aria-pressed={value.mul === '2x1'} onClick={() => onChange({ ...value, mul: '2x1' })}>
              2けた×1けた
            </button>
          </div>
        </div>
      )}
      {value.ops.includes('divide') && (
        <div className="card" style={{ padding: 12 }}>
          <strong>÷ わりざん</strong>
          <div className="chips" style={{ marginTop: 6 }}>
            <button type="button" className="chip" aria-pressed={value.div === 'kuku'} onClick={() => onChange({ ...value, div: 'kuku' })}>
              くくの わりざん
            </button>
            <button type="button" className="chip" aria-pressed={value.div === '2digit'} onClick={() => onChange({ ...value, div: '2digit' })}>
              2けた÷1けた
            </button>
          </div>
        </div>
      )}
      <span className="field-label">もんだいの かず</span>
      <div className="chips">
        {([5, 10, 20, 30] as TestCount[]).map((c) => (
          <button key={c} type="button" className="chip" aria-pressed={value.count === c} onClick={() => onChange({ ...value, count: c })}>
            {c}もん
          </button>
        ))}
      </div>
    </div>
  );
}

export function TestScreen() {
  const { profile, settings, repo, updateSettings } = useProfile();
  const [stage, setStage] = useState<'home' | 'run' | 'result'>('home');
  const [form, setForm] = useState<TestSettings>((settings.lastTestSettings as TestSettings | undefined) ?? DEFAULT_TEST_SETTINGS);
  const [draftSession, setDraftSession] = useState<Session | null>(null);
  const [history, setHistory] = useState<CompletedTest[]>([]);
  const [run, setRun] = useState<{ session: Session; draft: Draft } | null>(null);
  const [result, setResult] = useState<CompletedTest | null>(null);
  const [confirmAbandon, setConfirmAbandon] = useState(false);

  const reload = useCallback(async () => {
    const ss = await repo.listSessions(profile.id);
    setHistory(completedTests(ss));
    setDraftSession(ss.find((s) => s.mode === 'test' && s.status === 'inProgress' && s.activeDraft) ?? null);
  }, [repo, profile.id]);

  useEffect(() => {
    void reload();
  }, [reload, stage]);

  const startNew = async (s: TestSettings) => {
    const problems = generateTest(createRng(randomSeed()), s);
    const draft: Draft = { settings: s, problems, answers: problems.map(() => null), index: 0, activeMs: 0 };
    const session: Session = { id: newId(), profileId: profile.id, mode: 'test', createdAt: nowIso(), updatedAt: nowIso(), status: 'inProgress', settingsSnapshot: s, activeDraft: draft };
    if (draftSession) await repo.saveSession({ ...draftSession, status: 'abandoned', activeDraft: undefined }).catch(() => undefined);
    await repo.saveSession(session).catch(() => undefined);
    void updateSettings({ lastTestSettings: s }).catch(() => undefined);
    setRun({ session, draft });
    setStage('run');
  };

  const last = settings.lastTestSettings as TestSettings | undefined;

  if (stage === 'run' && run)
    return (
      <TestRun
        key={run.session.id}
        session={run.session}
        draft={run.draft}
        onFinished={(t) => {
          setResult(t);
          setStage('result');
        }}
        onLeave={() => {
          setRun(null);
          setStage('home');
        }}
      />
    );

  if (stage === 'result' && result) return <TestResult test={result} history={history} onDone={() => setStage('home')} onAgain={() => void startNew(result.settings)} />;

  return (
    <main className="screen narrow" style={accent}>
      <TopBar title="テスト" onBack={() => navigate('/home')} right={<SoundToggle />} />
      <div className="banner info">テストでは ヒントは つかえないよ。こたえは さいごに まとめて わかるよ。じかんの せいげんは ないよ。</div>
      {draftSession && (
        <div className="card stack">
          <strong>とちゅうの テストが あるよ</strong>
          <span className="small muted">{describeSettings((draftSession.activeDraft as Draft).settings)}・{(draftSession.activeDraft as Draft).index}もん まで こたえた</span>
          <div className="row">
            <button
              type="button"
              className="btn primary"
              onClick={() => {
                setRun({ session: draftSession, draft: draftSession.activeDraft as Draft });
                setStage('run');
              }}
            >
              つづきから
            </button>
            <button type="button" className="btn" onClick={() => setConfirmAbandon(true)}>
              この テストを やめる
            </button>
          </div>
        </div>
      )}
      {last && (
        <button type="button" className="btn primary big block" onClick={() => void startNew(last)}>
          まえと おなじ じょうけんで テスト
          <span className="small" style={{ display: 'block', fontWeight: 400 }}>
            {describeSettings(last)}
          </span>
        </button>
      )}
      <div className="card">
        <h2>テストを つくる</h2>
        <TestSettingsForm value={form} onChange={setForm} />
        <button type="button" className="btn primary big block" style={{ marginTop: 12 }} onClick={() => void startNew(form)}>
          この テストを はじめる
        </button>
      </div>
      {history.length > 0 && (
        <div className="card">
          <h2>これまでの テスト</h2>
          <div className="stack">
            {history.slice(0, 10).map((t) => (
              <button key={t.session.id} type="button" className="btn" style={{ justifyContent: 'space-between', borderRadius: 14 }} onClick={() => { setResult(t); setStage('result'); }}>
                <span className="small" style={{ textAlign: 'left' }}>
                  {new Date(t.session.completedAt ?? t.session.createdAt).toLocaleDateString('ja-JP')}
                  <br />
                  {describeSettings(t.settings)}
                </span>
                <span className="num">
                  ○ {t.score.correct}/{t.score.total}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
      {confirmAbandon && draftSession && (
        <Confirm
          title="とちゅうの テストを やめる？"
          message="この テストは きろくに のこりません（せいせきに まざりません）。"
          okLabel="やめる"
          cancelLabel="もどる"
          danger
          onCancel={() => setConfirmAbandon(false)}
          onOk={async () => {
            await repo.saveSession({ ...draftSession, status: 'abandoned', activeDraft: undefined }).catch(() => undefined);
            setConfirmAbandon(false);
            void reload();
          }}
        />
      )}
    </main>
  );
}

function TestRun({ session: initialSession, draft: initial, onFinished, onLeave }: { session: Session; draft: Draft; onFinished(t: CompletedTest): void; onLeave(): void }) {
  const { profile, repo } = useProfile();
  const [draft, setDraft] = useState<Draft>(initial);
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const sessionRef = useRef(initialSession);
  const [value, setValue] = useState('');
  const [paused, setPaused] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const busy = useRef(false);
  const total = useRef(new ActiveClock());
  const perQ = useRef(new ActiveClock());

  // 時計：見えていて一時停止していないときだけ進む
  useEffect(() => {
    total.current.reset(initial.activeMs);
    total.current.start();
    perQ.current.reset(0);
    perQ.current.start();
    const onVis = () => {
      if (document.hidden) {
        total.current.stop();
        perQ.current.stop();
        setPaused(true);
        void persistRef.current(draftRef.current).catch(() => undefined);
      }
    };
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('pagehide', onVis);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('pagehide', onVis);
    };
  }, [initial.activeMs]);

  const pause = () => {
    total.current.stop();
    perQ.current.stop();
    setPaused(true);
    void persist(draftRef.current).catch(() => undefined);
  };
  const resume = () => {
    total.current.start();
    perQ.current.start();
    setPaused(false);
  };

  const persist = (d: Draft) => {
    const s: Session = { ...sessionRef.current, activeDraft: { ...d, activeMs: total.current.elapsed() } };
    sessionRef.current = s;
    return repo.saveSession(s);
  };

  const persistRef = useRef(persist);
  persistRef.current = persist;

  const p = draft.problems[draft.index];

  const confirm = async (skip: boolean) => {
    if (busy.current || paused) return;
    const v = skip ? null : parseAnswer(value);
    if (!skip && v === null) return;
    busy.current = true;
    const ms = perQ.current.elapsed();
    const correct = !skip && judgeArith(p, v);
    const ans: TestAnswer = { value: v, skipped: skip, correct, activeMs: Math.round(ms) };
    const answers = draft.answers.map((a, i) => (i === draft.index ? ans : a));
    const next: Draft = { ...draft, answers, index: draft.index + 1, activeMs: total.current.elapsed() };
    const attempt: StoredAttempt = {
      id: `${sessionRef.current.id}-${draft.index}`,
      profileId: profile.id,
      sessionId: sessionRef.current.id,
      mode: 'test',
      op: p.op,
      difficulty: difficultyOf(p),
      levelKey: p.levelKey,
      questionKey: p.key,
      generatorVersion: ARITH_GENERATOR_VERSION,
      questionSnapshot: p,
      answerSnapshot: v,
      firstTryCorrect: correct,
      finalCorrect: correct,
      skipped: skip,
      retryCount: 0,
      hintsUsed: 0,
      elapsedActiveMs: Math.round(ms),
      answeredAt: nowIso(),
    };
    const isLast = next.index >= draft.problems.length;
    let s: Session = { ...sessionRef.current, activeDraft: next };
    if (isLast) {
      total.current.stop();
      const score = scoreTest(next.problems, next.answers, total.current.elapsed());
      const summary: TestSummary = { settings: next.settings, key: settingsKey(next.settings), score };
      s = { ...s, status: 'completed', completedAt: nowIso(), activeDraft: undefined, summary };
    }
    try {
      await repo.saveAttemptAndSession(attempt, s);
      sessionRef.current = s;
      setSaveError(false);
    } catch {
      // 保存できなかったときは進めない（保存できたと偽らない）
      setSaveError(true);
      busy.current = false;
      return;
    }
    play('tap');
    setValue('');
    perQ.current.reset(0);
    perQ.current.start();
    busy.current = false;
    if (isLast) {
      const sum = s.summary as TestSummary;
      play('complete');
      onFinished({ session: s, settings: sum.settings, key: sum.key, score: sum.score });
    } else setDraft(next);
  };

  return (
    <main className="screen narrow" style={accent}>
      <TopBar
        title={`テスト ${draft.index + 1}/${draft.problems.length}`}
        onBack={() => {
          pause();
          setLeaving(true);
        }}
        right={
          <button type="button" className="btn" onClick={pause}>
            ⏸ やすむ
          </button>
        }
      />
      {draft.problems.length <= 30 && <ProgressDots total={draft.problems.length} done={draft.index} current={draft.index} />}
      <p className="center-text small muted" style={{ margin: 0 }}>
        のこり {draft.problems.length - draft.index}もん
      </p>
      <div className="card center-text">
        <div className="big-expr">{formatProblem(p)} =</div>
        <AnswerBox value={value} active label="こたえ" />
      </div>
      {saveError && (
        <div className="banner" role="alert">
          ほぞん できませんでした。もういちど「けってい」を おしてください。
        </div>
      )}
      <NumberPad value={value} onChange={setValue} onSubmit={() => void confirm(false)} submitLabel="けってい" maxDigits={5} disabled={paused} />
      <div className="row center">
        <button type="button" className="btn ghost" onClick={() => void confirm(true)} disabled={paused}>
          スキップ
        </button>
      </div>
      <p className="center-text small muted">「けってい」を おすまでは なおせるよ。</p>
      {paused && !leaving && (
        <Modal title="いちじ ていし ちゅう" onClose={resume}>
          <p>じかんは とまっているよ。</p>
          <button type="button" className="btn primary big block" onClick={resume}>
            つづける
          </button>
        </Modal>
      )}
      {leaving && (
        <Modal title="テストを とちゅうで やめる？" onClose={() => { setLeaving(false); resume(); }}>
          <div className="stack">
            <p style={{ margin: 0 }}>「あとで つづける」なら、いまの ところから また はじめられるよ。</p>
            <button
              type="button"
              className="btn primary big"
              onClick={async () => {
                await persist(draftRef.current).catch(() => undefined);
                onLeave();
              }}
            >
              あとで つづける
            </button>
            <button
              type="button"
              className="btn danger"
              onClick={async () => {
                await repo.saveSession({ ...sessionRef.current, status: 'abandoned', activeDraft: undefined }).catch(() => undefined);
                onLeave();
              }}
            >
              テストを やめる（きろくしない）
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => {
                setLeaving(false);
                resume();
              }}
            >
              テストに もどる
            </button>
          </div>
        </Modal>
      )}
    </main>
  );
}

function TestResult({ test, history, onDone, onAgain }: { test: CompletedTest; history: CompletedTest[]; onDone(): void; onAgain(): void }) {
  const { repo } = useProfile();
  const [attempts, setAttempts] = useState<StoredAttempt[]>([]);
  const [open, setOpen] = useState<number | null>(null);
  useEffect(() => {
    repo.listAttemptsBySession(test.session.id).then((as) => setAttempts(as.sort((a, b) => Number(a.id.split('-').pop()) - Number(b.id.split('-').pop()))));
  }, [repo, test.session.id]);
  const prev = useMemo(() => previousSame(history, test), [history, test]);
  const s = test.score;
  const diff = prev ? s.correct - prev.score.correct : null;
  return (
    <main className="screen narrow" style={accent}>
      <TopBar title="テストの けっか" onBack={onDone} />
      <div className="card stack center-text pop">
        <div className="num" style={{ fontSize: '3rem', color: MODES.test.color }}>
          ○ {s.correct} / {s.total}
        </div>
        {diff !== null && diff > 0 && <strong>まえより {diff}もん おおく できたね！</strong>}
        {diff !== null && diff <= 0 && <strong>さいごまで がんばったね！</strong>}
        {diff === null && <strong>さいごまで がんばったね！</strong>}
        <div className="small muted">{describeSettings(test.settings)}</div>
      </div>
      <div className="card">
        <h2>くわしく（おとな むけ）</h2>
        <table className="data">
          <tbody>
            <tr>
              <th>せいかいりつ</th>
              <td>
                {Math.round(s.rate * 100)}%（{s.correct} ÷ {s.total}）
              </td>
            </tr>
            <tr>
              <th>まちがい / スキップ</th>
              <td>
                {s.wrong}もん / {s.skipped}もん
              </td>
            </tr>
            <tr>
              <th>かかった じかん</th>
              <td>{formatMs(s.totalActiveMs)}（やすんだ じかんは のぞく）</td>
            </tr>
            <tr>
              <th>1もん あたり（ちゅうおうち）</th>
              <td>{formatMs(s.medianMs)}</td>
            </tr>
            {(Object.keys(s.byOp) as Op[]).map((op) => (
              <tr key={op}>
                <th>
                  {OP_SYMBOL[op]} {OP_LABEL[op]}
                </th>
                <td>
                  {s.byOp[op]!.correct}/{s.byOp[op]!.total}
                  {s.byOp[op]!.skipped ? `（スキップ ${s.byOp[op]!.skipped}）` : ''}
                </td>
              </tr>
            ))}
            <tr>
              <th>おなじ じょうけんの まえの テスト</th>
              <td>{prev ? `${prev.score.correct}/${prev.score.total}（${new Date(prev.session.completedAt ?? '').toLocaleDateString('ja-JP')}）` : 'まだ ありません'}</td>
            </tr>
          </tbody>
        </table>
        {!prev && <p className="small muted">じょうけんが ちがう テストとは くらべません。</p>}
      </div>
      <div className="card">
        <h2>こたえあわせ</h2>
        <div className="stack">
          {attempts.map((a, i) => {
            const p = a.questionSnapshot as ArithProblem;
            const mark = a.skipped ? 'スキップ' : a.finalCorrect ? '○' : '×';
            return (
              <div key={a.id} style={{ borderBottom: '1px solid #e3eef7', paddingBottom: 6 }}>
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <span className="num" style={{ fontSize: '1.2rem' }}>
                    {formatProblem(p)} = {p.answer}
                  </span>
                  <span style={{ fontWeight: 800, color: a.finalCorrect ? '#1f9d6a' : '#8a5a00' }}>
                    {mark}
                    {!a.finalCorrect && !a.skipped && <span className="small">（{String(a.answerSnapshot)} と こたえた）</span>}
                  </span>
                </div>
                <button type="button" className="btn ghost small" onClick={() => setOpen(open === i ? null : i)} aria-expanded={open === i}>
                  ほかの かんがえかた
                </button>
                {open === i && (
                  <div className="small">
                    {explain(p).map((e) => (
                      <div key={e.id}>
                        <strong>{e.title}</strong>
                        <ul style={{ margin: '2px 0', paddingLeft: '1.2em' }}>
                          {e.steps.map((st, k) => (
                            <li key={k} className="num">
                              {st}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
      <div className="row">
        <button type="button" className="btn primary big" onClick={onAgain}>
          おなじ じょうけんで もういちど
        </button>
        <button type="button" className="btn" onClick={onDone}>
          テストの はじめへ
        </button>
      </div>
    </main>
  );
}
