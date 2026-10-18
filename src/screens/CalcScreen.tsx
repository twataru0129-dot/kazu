import { useMemo, useRef, useState } from 'react';
import { useProfile } from '../app/AppContext';
import { navigate } from '../app/router';
import { play } from '../audio/sfx';
import { speak } from '../audio/speech';
import { NumberPad } from '../components/NumberPad';
import { DockLayout } from '../components/Dock';
import { AnswerBox, Feedback, HintButton, HintPanel, ProgressDots, SoundToggle, TopBar } from '../components/ui';
import { arithHints, explain } from '../domain/arithmetic/explain';
import {
  ARITH_GENERATOR_VERSION,
  DEFAULT_ARITH_SETTINGS,
  difficultyOf,
  formatProblem,
  generateProblem,
  judgeArith,
  type ArithProblem,
  type ArithSettings,
  type Carry,
  type Digits,
} from '../domain/arithmetic/problems';
import { parseAnswer } from '../domain/input';
import { createRng, newId, randomSeed } from '../domain/random';
import { OP_LABEL, OP_SYMBOL, type Op } from '../domain/types';
import { nowIso } from '../persistence/repo';
import type { Session, StoredAttempt } from '../persistence/types';
import { MODES } from '../config/theme';

type Count = 5 | 10 | 20 | 0; // 0 = ずっと

export function ArithSettingsForm({ value, onChange }: { value: ArithSettings; onChange(v: ArithSettings): void }) {
  const toggleOp = (op: Op) => {
    const has = value.ops.includes(op);
    const ops = has ? value.ops.filter((o) => o !== op) : [...value.ops, op];
    if (ops.length === 0) return; // 最低1つ
    onChange({ ...value, ops: (['add', 'subtract', 'multiply', 'divide'] as Op[]).filter((o) => ops.includes(o)) });
  };
  const addSub = value.ops.includes('add') || value.ops.includes('subtract');
  return (
    <div className="stack">
      <div>
        <span className="field-label">けいさんの しゅるい（いくつでも）</span>
        <div className="chips">
          {(['add', 'subtract', 'multiply', 'divide'] as Op[]).map((op) => (
            <button key={op} type="button" className="chip" aria-pressed={value.ops.includes(op)} onClick={() => toggleOp(op)}>
              {OP_SYMBOL[op]} {OP_LABEL[op]}
            </button>
          ))}
        </div>
      </div>
      {addSub && (
        <>
          <div>
            <span className="field-label">つかう かずの けた（＋・−）</span>
            <div className="chips">
              {([1, 2, 3] as Digits[]).map((d) => (
                <button key={d} type="button" className="chip" aria-pressed={value.digits === d} onClick={() => onChange({ ...value, digits: d })}>
                  {d}けた
                </button>
              ))}
            </div>
          </div>
          <div>
            <span className="field-label">くりあがり・くりさがり</span>
            <div className="chips">
              {(
                [
                  ['none', 'なし'],
                  ['with', 'あり'],
                  ['mixed', 'まぜる'],
                ] as [Carry, string][]
              ).map(([c, l]) => (
                <button key={c} type="button" className="chip" aria-pressed={value.carry === c} onClick={() => onChange({ ...value, carry: c })}>
                  {l}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
      {value.ops.includes('multiply') && (
        <div>
          <span className="field-label">かけざん</span>
          <div className="chips">
            <button type="button" className="chip" aria-pressed={value.mul === 'kuku'} onClick={() => onChange({ ...value, mul: 'kuku' })}>
              くく（1〜9）
            </button>
            <button type="button" className="chip" aria-pressed={value.mul === '2x1'} onClick={() => onChange({ ...value, mul: '2x1' })}>
              2けた × 1けた
            </button>
          </div>
        </div>
      )}
      {value.ops.includes('divide') && (
        <div>
          <span className="field-label">わりざん（わりきれる もんだい）</span>
          <div className="chips">
            <button type="button" className="chip" aria-pressed={value.div === 'kuku'} onClick={() => onChange({ ...value, div: 'kuku' })}>
              くくの わりざん
            </button>
            <button type="button" className="chip" aria-pressed={value.div === '2digit'} onClick={() => onChange({ ...value, div: '2digit' })}>
              2けた ÷ 1けた
            </button>
          </div>
        </div>
      )}
      {(value.ops.includes('multiply') || value.ops.includes('divide')) && (
        <p className="small muted" style={{ margin: 0 }}>
          かけざん・わりざんの いみは「まなぶ」でも みられるよ。
          <button type="button" className="btn ghost small" onClick={() => navigate('/learn')}>
            まなぶへ
          </button>
        </p>
      )}
    </div>
  );
}

interface Q {
  p: ArithProblem;
  attemptId: string;
  input: string;
  wrong: number;
  submits: number;
  first?: boolean;
  hints: number;
  solved: boolean;
  startedAt: number;
  solvedAt?: number;
}

export function CalcScreen() {
  const { profile, settings, repo, updateSettings } = useProfile();
  const saved = settings.lastCalcSettings as { arith?: ArithSettings; count?: Count } | undefined;
  const [arith, setArith] = useState<ArithSettings>(saved?.arith ?? DEFAULT_ARITH_SETTINGS);
  const [count, setCount] = useState<Count>(saved?.count ?? 5);
  const [stage, setStage] = useState<'setup' | 'play' | 'result'>('setup');
  const [index, setIndex] = useState(0);
  const [q, setQ] = useState<Q | null>(null);
  const [feedback, setFeedback] = useState<{ kind: 'good' | 'try'; text: string; n: number } | null>(null);
  const [showExplain, setShowExplain] = useState(false);
  const [results, setResults] = useState<{ first: boolean; skipped: boolean }[]>([]);
  const rng = useRef(createRng(randomSeed()));
  const recent = useRef<string[]>([]);
  const session = useRef<Session | null>(null);
  const qRef = useRef<Q | null>(null);
  qRef.current = q;

  const nextQuestion = () => {
    const op = arith.ops[Math.floor(rng.current.next() * arith.ops.length)];
    const p = generateProblem(rng.current, op, arith, new Set(recent.current.slice(-20)));
    recent.current.push(p.key);
    const nq: Q = { p, attemptId: newId(), input: '', wrong: 0, submits: 0, hints: 0, solved: false, startedAt: Date.now() };
    setQ(nq);
    window.scrollTo(0, 0);
    setFeedback(null);
    setShowExplain(false);
  };

  const start = () => {
    void updateSettings({ lastCalcSettings: { arith, count } }).catch(() => undefined);
    session.current = { id: newId(), profileId: profile.id, mode: 'calculation', createdAt: nowIso(), updatedAt: nowIso(), status: 'inProgress', settingsSnapshot: { arith, count } };
    void repo.saveSession(session.current).catch(() => undefined);
    setIndex(0);
    setResults([]);
    setStage('play');
    nextQuestion();
  };

  const record = (x: Q, extra: Partial<StoredAttempt> = {}) => {
    if (!session.current) return;
    const a: StoredAttempt = {
      id: x.attemptId,
      profileId: profile.id,
      sessionId: session.current.id,
      mode: 'calculation',
      op: x.p.op,
      difficulty: difficultyOf(x.p),
      levelKey: x.p.levelKey,
      questionKey: x.p.key,
      generatorVersion: ARITH_GENERATOR_VERSION,
      questionSnapshot: x.p,
      answerSnapshot: parseAnswer(x.input),
      firstTryCorrect: x.first,
      finalCorrect: x.solved,
      retryCount: x.wrong,
      hintsUsed: x.hints,
      elapsedActiveMs: Date.now() - x.startedAt,
      answeredAt: nowIso(),
      ...extra,
    };
    void repo.saveAttempt(a).catch(() => undefined);
  };

  const submit = () => {
    const x = qRef.current;
    if (!x || x.solved) return;
    const v = parseAnswer(x.input);
    if (v === null) return;
    const ok = judgeArith(x.p, v);
    const nx: Q = { ...x, submits: x.submits + 1, first: x.first ?? ok, solved: ok, wrong: ok ? x.wrong : x.wrong + 1, solvedAt: ok ? Date.now() : undefined };
    setQ(nx);
    record(nx);
    if (ok) {
      play('correct');
      setFeedback({ kind: 'good', text: 'せいかい！', n: nx.submits });
      speak('せいかい');
    } else {
      play('soft');
      setFeedback({ kind: 'try', text: 'おしい！ なおして もういちど こたえてみよう', n: nx.submits });
    }
  };

  const finish = (all: { first: boolean; skipped: boolean }[]) => {
    if (session.current) {
      session.current = { ...session.current, status: 'completed', completedAt: nowIso(), summary: { answered: all.length, firstCorrect: all.filter((r) => r.first).length } };
      void repo.saveSession(session.current).catch(() => undefined);
    }
    setResults(all);
    setStage('result');
    play('complete');
  };

  const goNext = (skip = false) => {
    const x = qRef.current;
    if (!x) return;
    // 正解直後の連打で つぎの問題を とばさない
    if (!skip && x.solvedAt && Date.now() - x.solvedAt < 600) return;
    if (skip && !x.solved) record(x, { skipped: true });
    const all = [...results, { first: !!x.first && x.solved, skipped: skip && !x.solved }];
    setResults(all);
    if (count !== 0 && index + 1 >= count) finish(all);
    else {
      setIndex(index + 1);
      nextQuestion();
    }
  };

  const hints = useMemo(() => (q ? arithHints(q.p) : ['', '', '']), [q]);
  const accent = { ['--accent' as string]: MODES.calc.color, ['--accent-soft' as string]: MODES.calc.soft };

  if (stage === 'setup')
    return (
      <main className="screen narrow" style={accent}>
        <TopBar title="けいさん" onBack={() => navigate('/home')} right={<SoundToggle />} />
        <div className="card">
          <ArithSettingsForm value={arith} onChange={setArith} />
          <span className="field-label">もんだいの かず</span>
          <div className="chips">
            {([5, 10, 20, 0] as Count[]).map((c) => (
              <button key={c} type="button" className="chip" aria-pressed={count === c} onClick={() => setCount(c)}>
                {c === 0 ? 'ずっと' : `${c}もん`}
              </button>
            ))}
          </div>
        </div>
        <button type="button" className="btn primary big block" onClick={start}>
          はじめる
        </button>
      </main>
    );

  if (stage === 'result') {
    const firsts = results.filter((r) => r.first).length;
    return (
      <main className="screen narrow" style={accent}>
        <TopBar title="けいさん" onBack={() => navigate('/home')} />
        <div className="card stack center-text pop">
          <div style={{ fontSize: '3rem' }} aria-hidden>
            🎉
          </div>
          <h2 style={{ margin: 0 }}>{results.length}もん がんばったね！</h2>
          <p className="muted">1かいめで せいかい：{firsts}もん</p>
          <button type="button" className="btn primary big" onClick={start}>
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

  if (!q) return null;
  const ex = q.solved && showExplain ? explain(q.p) : [];
  return (
    <main className="screen narrow" style={accent}>
      <TopBar
        title={count === 0 ? `けいさん（${index + 1}もんめ）` : `けいさん ${index + 1}/${count}`}
        onBack={() => setStage('setup')}
        right={
          <>
            <SoundToggle />
            {count === 0 && (
              <button type="button" className="btn" onClick={() => finish([...results, ...(q.solved ? [{ first: !!q.first, skipped: false }] : [])])}>
                おわる
              </button>
            )}
          </>
        }
      />
      <DockLayout
        footer={
          q.solved ? (
            <button type="button" className="btn primary big block" onClick={() => goNext(false)} autoFocus>
              つぎへ →
            </button>
          ) : (
            <>
              <HintButton level={q.hints} onClick={() => setQ({ ...q, hints: Math.min(3, q.hints + 1) })} />
              <button type="button" className="btn ghost" onClick={() => goNext(true)}>
                とばす
              </button>
            </>
          )
        }
      >
      {count !== 0 && count <= 20 && <ProgressDots total={count} done={index + (q.solved ? 1 : 0)} current={index} />}
      <div className="card center-text">
        <div className="big-expr" aria-label={`${formatProblem(q.p)} は？`}>
          {formatProblem(q.p)} =
        </div>
        <AnswerBox value={q.input} active={!q.solved} label="こたえ" />
      </div>
      {feedback && (
        <Feedback key={feedback.n} kind={feedback.kind}>
          {feedback.text}
        </Feedback>
      )}
      <HintPanel hints={hints} level={q.hints} />
      {!q.solved ? (
        <NumberPad value={q.input} onChange={(v) => setQ({ ...q, input: v })} onSubmit={submit} maxDigits={5} />
      ) : (
        <div className="stack">
          <button type="button" className="btn" onClick={() => setShowExplain(!showExplain)} aria-expanded={showExplain}>
            {showExplain ? 'かんがえかたを とじる' : 'ほかの かんがえかたを みる'}
          </button>
          {ex.length > 0 && (
            <div className="card stack">
              <p className="small muted" style={{ margin: 0 }}>
                こんな けいさんの しかたも あるよ（どれでも せいかい）
              </p>
              {ex.map((e) => (
                <div key={e.id}>
                  <h3>{e.title}</h3>
                  <ul style={{ margin: 0, paddingLeft: '1.2em' }}>
                    {e.steps.map((s, i) => (
                      <li key={i} className="num" style={{ fontWeight: 600, margin: '2px 0' }}>
                        {s}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      </DockLayout>
    </main>
  );
}
