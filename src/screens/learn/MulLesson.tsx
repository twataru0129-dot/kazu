import { useState } from 'react';
import { navigate } from '../../app/router';
import { play } from '../../audio/sfx';
import { NumberPad } from '../../components/NumberPad';
import { Apple, Plate, TimelinePlayer } from '../../components/TimelinePlayer';
import { AnswerBox, Feedback, SoundToggle, TopBar } from '../../components/ui';
import { MODES } from '../../config/theme';
import { judgeMul, mulPractice, type MulPractice } from '../../domain/learning/practice';
import { parseAnswer } from '../../domain/input';
import { createRng, randomSeed } from '../../domain/random';
import { MUL_SCENES } from './scenes';
import { LessonTabs, newAttemptId, Stepper, useLearningRecorder } from './practiceKit';

type Tab = 'watch' | 'move' | 'add' | 'practice' | 'table';

/** a こずつ b さらの絵 */
export function PlatesPicture({ per, groups, maxWidth = 360 }: { per: number; groups: number; maxWidth?: number }) {
  const cols = Math.min(groups, 3);
  const rows = Math.ceil(groups / cols);
  const pw = Math.max(70, per * 22 + 20);
  const W = cols * (pw + 12);
  const H = rows * 64;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ maxWidth: Math.min(maxWidth, W * 1.3) }} role="img" aria-label={`${per}こずつ ${groups}さら`}>
      {Array.from({ length: groups }, (_, g) => {
        const cx = (g % cols) * (pw + 12) + pw / 2 + 6;
        const cy = Math.floor(g / cols) * 64 + 48;
        return (
          <g key={g}>
            <Plate x={cx} y={cy} w={pw} />
            {Array.from({ length: per }, (_, k) => (
              <Apple key={k} x={cx + (k - (per - 1) / 2) * 20} y={cy - 12} s={0.85} />
            ))}
          </g>
        );
      })}
    </svg>
  );
}

function MovePanel() {
  const [per, setPer] = useState(2);
  const [groups, setGroups] = useState(3);
  return (
    <div className="card stack">
      <Stepper label="1さらの りんご" value={per} min={1} max={9} onChange={setPer} />
      <Stepper label="おさらの かず" value={groups} min={1} max={9} onChange={setGroups} />
      <div className="center-text">
        <PlatesPicture per={per} groups={groups} />
      </div>
      <div className="center-text num" style={{ fontSize: '1.3rem', overflowWrap: 'anywhere' }}>
        {Array.from({ length: groups }, () => per).join(' + ')} = {per * groups}
      </div>
      <div className="center-text num" style={{ fontSize: '2.2rem', color: MODES.learn.color }} aria-live="polite">
        {per} × {groups} = {per * groups}
      </div>
      <p className="center-text small muted" style={{ margin: 0 }}>
        「{per} が {groups}つぶん」
      </p>
    </div>
  );
}

function AddPanel() {
  const [n, setN] = useState(2);
  const [limit, setLimit] = useState(10);
  const [count, setCount] = useState(0);
  const totals = Array.from({ length: count }, (_, i) => n * (i + 1));
  return (
    <div className="card stack">
      <span className="field-label">たす かず</span>
      <div className="chips">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((k) => (
          <button
            key={k}
            type="button"
            className="chip"
            aria-pressed={n === k}
            onClick={() => {
              setN(k);
              setCount(0);
            }}
          >
            {k}
          </button>
        ))}
      </div>
      <span className="field-label">なんかいまで</span>
      <div className="chips">
        {[5, 10, 20].map((l) => (
          <button
            key={l}
            type="button"
            className="chip"
            aria-pressed={limit === l}
            onClick={() => {
              setLimit(l);
              setCount((c) => Math.min(c, l));
            }}
          >
            {l}かい
          </button>
        ))}
      </div>
      <button
        type="button"
        className="btn primary big"
        disabled={count >= limit}
        onClick={() => {
          play('tap');
          setCount((c) => c + 1);
        }}
      >
        ＋{n} する
      </button>
      <div className="row center num" style={{ gap: 4, fontSize: '1.3rem' }} aria-live="polite">
        <span>0</span>
        {totals.map((t, i) => (
          <span key={i} className="pop">
            → {t}
          </span>
        ))}
      </div>
      {count > 0 && (
        <div className="center-text num" style={{ fontSize: '2rem', color: MODES.learn.color }}>
          {n} × {count} = {n * count}
        </div>
      )}
      <button type="button" className="btn ghost" onClick={() => setCount(0)}>
        さいしょから
      </button>
    </div>
  );
}

function PracticePanel() {
  const record = useLearningRecorder('mul');
  const [rng] = useState(() => createRng(randomSeed()));
  const [q, setQ] = useState<MulPractice>(() => mulPractice(rng));
  const [id, setId] = useState(newAttemptId);
  const [value, setValue] = useState('');
  const [wrong, setWrong] = useState(0);
  const [done, setDone] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'good' | 'try'; text: string; n: number } | null>(null);
  const answer = (a: number | string | null) => {
    if (done) return;
    const ok = judgeMul(q, a);
    record(id, q as never, a, wrong === 0 && ok, ok, ok ? wrong : wrong + 1);
    if (ok) {
      setDone(true);
      play('correct');
    } else {
      setWrong(wrong + 1);
      play('soft');
    }
    setMsg({ kind: ok ? 'good' : 'try', text: ok ? `せいかい！ ${q.per} × ${q.groups} = ${q.per * q.groups}` : 'もういちど えを みてみよう', n: Date.now() });
  };
  const next = () => {
    setQ(mulPractice(rng));
    setId(newAttemptId());
    setValue('');
    setWrong(0);
    setDone(false);
    setMsg(null);
  };
  return (
    <div className="card stack">
      <div className="center-text">
        <PlatesPicture per={q.per} groups={q.groups} />
        <p style={{ fontWeight: 700 }}>{q.kind === 'count' ? `${q.per}こずつ ${q.groups}さら。ぜんぶで なんこ？` : 'この えの しきは どれ？'}</p>
      </div>
      {msg && (
        <Feedback key={msg.n} kind={msg.kind}>
          {msg.text}
        </Feedback>
      )}
      {q.kind === 'count' ? (
        <>
          <div className="row center">
            <AnswerBox value={value} active={!done} />
            <span>こ</span>
          </div>
          {!done && <NumberPad value={value} onChange={setValue} onSubmit={() => answer(parseAnswer(value))} maxDigits={3} />}
        </>
      ) : (
        <div className="stack">
          {q.options.map((o) => (
            <button key={o} type="button" className="btn big num" onClick={() => answer(o)} disabled={done}>
              {o}
            </button>
          ))}
        </div>
      )}
      {done && (
        <button type="button" className="btn primary big" onClick={next}>
          つぎの もんだい →
        </button>
      )}
    </div>
  );
}

function TablePanel() {
  const [sel, setSel] = useState<[number, number]>([2, 3]);
  return (
    <div className="card stack">
      <div className="table-wrap">
        <table className="data" style={{ textAlign: 'center' }}>
          <thead>
            <tr>
              <th>×</th>
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((b) => (
                <th key={b} style={{ textAlign: 'center' }}>
                  {b}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((a) => (
              <tr key={a}>
                <th style={{ textAlign: 'center' }}>{a}のだん</th>
                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((b) => (
                  <td key={b} style={{ padding: 2 }}>
                    <button
                      type="button"
                      className="num"
                      onClick={() => setSel([a, b])}
                      aria-label={`${a} × ${b} = ${a * b}`}
                      style={{ minWidth: 40, minHeight: 40, borderRadius: 8, border: '1px solid #d6e3ee', background: sel[0] === a && sel[1] === b ? '#e8dcff' : '#fff', fontWeight: 700 }}
                    >
                      {a * b}
                    </button>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="center-text num" style={{ fontSize: '1.8rem', color: MODES.learn.color }}>
        {sel[0]} × {sel[1]} = {sel[0] * sel[1]}
      </div>
      <p className="center-text small muted" style={{ margin: 0 }}>
        「{sel[0]} が {sel[1]}つぶん」
      </p>
      <div className="center-text">
        <PlatesPicture per={sel[0]} groups={sel[1]} maxWidth={320} />
      </div>
    </div>
  );
}

export function MulLesson() {
  const [tab, setTab] = useState<Tab>('watch');
  return (
    <main className="screen narrow" style={{ ['--accent' as string]: MODES.learn.color, ['--accent-soft' as string]: MODES.learn.soft }}>
      <TopBar title="かけざん" onBack={() => navigate('/learn')} right={<SoundToggle />} />
      <LessonTabs<Tab>
        tabs={[
          ['watch', 'みる'],
          ['move', 'うごかす'],
          ['add', 'たしていく'],
          ['practice', 'れんしゅう'],
          ['table', 'くくひょう'],
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === 'watch' && <TimelinePlayer scenes={MUL_SCENES} title="かけざんって なに？" />}
      {tab === 'move' && <MovePanel />}
      {tab === 'add' && <AddPanel />}
      {tab === 'practice' && <PracticePanel />}
      {tab === 'table' && <TablePanel />}
    </main>
  );
}
