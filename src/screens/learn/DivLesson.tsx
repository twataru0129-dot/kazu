import { useState } from 'react';
import { navigate } from '../../app/router';
import { play } from '../../audio/sfx';
import { NumberPad } from '../../components/NumberPad';
import { DockLayout, InDock } from '../../components/Dock';
import { Bag, Candy, Kid, TimelinePlayer } from '../../components/TimelinePlayer';
import { AnswerBox, Feedback, SoundToggle, TopBar } from '../../components/ui';
import { MODES } from '../../config/theme';
import { divPractice, judgeDiv, sharedEqually, type DivPractice } from '../../domain/learning/practice';
import { parseAnswer } from '../../domain/input';
import { createRng, randomSeed } from '../../domain/random';
import { DIV_SCENES } from './scenes';
import { LessonTabs, newAttemptId, Stepper, useLearningRecorder } from './practiceKit';

type Tab = 'watch' | 'share' | 'group' | 'practice';
const KID_COLORS = ['#4aa3df', '#ef7d57', '#5cc28b', '#a678de'];

function CandyButton({ onClick, label, disabled }: { onClick(): void; label: string; disabled?: boolean }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} disabled={disabled} style={{ width: 48, height: 48, border: 'none', background: 'transparent', padding: 0 }}>
      <svg viewBox="-16 -12 32 24" width="44" height="34" aria-hidden>
        <Candy x={0} y={0} />
      </svg>
    </button>
  );
}

/** 等分除：あめを おさらに 1こずつ くばる */
function SharePanel() {
  const [people, setPeople] = useState(2);
  const [each, setEach] = useState(5);
  const total = people * each;
  const [plates, setPlates] = useState<number[]>(() => Array(2).fill(0));
  const pool = total - plates.reduce((s, x) => s + x, 0);
  const reset = (p = people, e = each) => {
    setPeople(p);
    setEach(e);
    setPlates(Array(p).fill(0));
  };
  const give = (k: number) => {
    if (pool <= 0) return;
    play('tap');
    setPlates((ps) => ps.map((x, i) => (i === k ? x + 1 : x)));
  };
  const takeBack = (k: number) => {
    if (plates[k] <= 0) return;
    setPlates((ps) => ps.map((x, i) => (i === k ? x - 1 : x)));
  };
  const roundRobin = () => {
    if (pool <= 0) return;
    const min = Math.min(...plates);
    give(plates.indexOf(min));
  };
  const done = pool === 0;
  const equal = done && sharedEqually(plates, total);
  return (
    <div className="card stack">
      <Stepper label="ひとの かず" value={people} min={2} max={4} onChange={(p) => reset(p, each)} />
      <Stepper label="ひとりぶん（こたえ）" value={each} min={1} max={6} onChange={(e) => reset(people, e)} />
      <p style={{ margin: 0, fontWeight: 700 }}>
        あめ {total}こを {people}にんで おなじ かずずつ わけよう。ひとの したの おさらを タップすると 1こ わたせるよ。
      </p>
      <div className="row center" aria-label={`のこりの あめ ${pool}こ`} style={{ minHeight: 52, gap: 0 }}>
        {Array.from({ length: pool }, (_, i) => (
          <CandyButton key={i} onClick={roundRobin} label="あめ（タップで じゅんばんに くばる）" />
        ))}
        {pool === 0 && <span className="muted">ぜんぶ くばったよ</span>}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${people}, 1fr)`, gap: 8 }}>
        {plates.map((n, k) => (
          <div key={k} className="center-text">
            <svg viewBox="-30 -32 60 90" width="70" height="100" aria-hidden>
              <Kid x={0} y={0} color={KID_COLORS[k]} />
            </svg>
            <button type="button" onClick={() => give(k)} disabled={pool === 0} aria-label={`${k + 1}ばんめの ひとに あめを わたす（いま ${n}こ）`} style={{ width: '100%', minHeight: 72, borderRadius: 16, border: '2px solid #b9cad9', background: '#fff', display: 'flex', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center', padding: 4 }}>
              {Array.from({ length: n }, (_, i) => (
                <svg key={i} viewBox="-16 -12 32 24" width="26" height="20" aria-hidden>
                  <Candy x={0} y={0} />
                </svg>
              ))}
            </button>
            <div className="row center" style={{ gap: 4 }}>
              <span className="num">{n}こ</span>
              <button type="button" className="btn ghost small" onClick={() => takeBack(k)} disabled={n === 0} aria-label={`${k + 1}ばんめの ひとから 1こ もどす`}>
                もどす
              </button>
            </div>
          </div>
        ))}
      </div>
      {done &&
        (equal ? (
          <Feedback kind="good">
            おなじ かずずつ わけられたね！ {total} ÷ {people} = {each}
          </Feedback>
        ) : (
          <Feedback kind="try">かずが ちがう ひとが いるよ。おおい ひとから もどしてみよう</Feedback>
        ))}
      {equal && <p className="center-text small muted">かけざんで たしかめ：{people} × {each} = {total}</p>}
      <button type="button" className="btn ghost" onClick={() => reset()}>
        さいしょから
      </button>
    </div>
  );
}

/** 包含除：k こずつ ふくろに いれる */
function GroupPanel() {
  const [size, setSize] = useState(3);
  const [bagsAns, setBagsAns] = useState(4);
  const total = size * bagsAns;
  const [filled, setFilled] = useState(0); // ふくろに いれた あめの数
  const pool = total - filled;
  const bags = Math.floor(filled / size);
  const reset = (s = size, b = bagsAns) => {
    setSize(s);
    setBagsAns(b);
    setFilled(0);
  };
  return (
    <div className="card stack">
      <Stepper label="1ふくろに いれる かず" value={size} min={2} max={5} onChange={(s) => reset(s, bagsAns)} />
      <Stepper label="ふくろの かず（こたえ）" value={bagsAns} min={1} max={5} onChange={(b) => reset(size, b)} />
      <p style={{ margin: 0, fontWeight: 700 }}>
        あめ {total}こを {size}こずつ ふくろに いれると、なんふくろ？ あめを タップして いれよう。
      </p>
      <div className="row center" style={{ minHeight: 52, gap: 0 }}>
        {Array.from({ length: pool }, (_, i) => (
          <CandyButton
            key={i}
            onClick={() => {
              play('tap');
              setFilled((f) => f + 1);
            }}
            label="あめを ふくろに いれる"
          />
        ))}
      </div>
      <div className="row center">
        {Array.from({ length: Math.max(1, Math.ceil(filled / size)) }, (_, b) => {
          const inBag = Math.min(size, filled - b * size);
          return (
            <svg key={b} viewBox="-34 -24 68 62" width="78" height="72" role="img" aria-label={`${b + 1}ふくろめ ${Math.max(0, inBag)}こ`}>
              <Bag x={0} y={0} />
              {Array.from({ length: Math.max(0, inBag) }, (_, k) => (
                <Candy key={k} x={-14 + (k % 3) * 14} y={4 + Math.floor(k / 3) * 12} s={0.5} />
              ))}
            </svg>
          );
        })}
      </div>
      <div className="center-text" aria-live="polite">
        できた ふくろ：<span className="num">{bags}</span>
      </div>
      {pool === 0 && (
        <Feedback kind="good">
          {size}こずつ わけると {bags}ふくろ！ {total} ÷ {size} = {bags}
        </Feedback>
      )}
      <button type="button" className="btn ghost" onClick={() => reset()}>
        さいしょから
      </button>
    </div>
  );
}

function PracticePanel() {
  const record = useLearningRecorder('div');
  const [rng] = useState(() => createRng(randomSeed()));
  const [q, setQ] = useState<DivPractice>(() => divPractice(rng));
  const [id, setId] = useState(newAttemptId);
  const [value, setValue] = useState('');
  const [wrong, setWrong] = useState(0);
  const [done, setDone] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'good' | 'try'; text: string; n: number } | null>(null);
  const text =
    q.kind === 'share'
      ? `あめ ${q.total}こを ${q.people}にんで おなじ かずずつ わけると、ひとり なんこ？`
      : q.kind === 'group'
        ? `あめ ${q.total}こを ${q.size}こずつ ふくろに いれると、なんふくろ？`
        : `${q.a} × ${q.b} = ${q.a * q.b} だから、${q.a * q.b} ÷ ${q.a} = □`;
  const answer = () => {
    const a = parseAnswer(value);
    if (a === null || done) return;
    const ok = judgeDiv(q, a);
    record(id, q as never, a, wrong === 0 && ok, ok, ok ? wrong : wrong + 1);
    if (ok) {
      setDone(true);
      play('correct');
    } else {
      setWrong(wrong + 1);
      play('soft');
    }
    setMsg({ kind: ok ? 'good' : 'try', text: ok ? 'せいかい！' : 'かけざんで たしかめてみよう', n: Date.now() });
  };
  const next = () => {
    setQ(divPractice(rng));
    setId(newAttemptId());
    setValue('');
    setWrong(0);
    setDone(false);
    setMsg(null);
  };
  const total = q.kind === 'inverse' ? 0 : q.total;
  return (
    <div className="card stack">
      {total > 0 && (
        <div className="row center" style={{ gap: 0 }} aria-hidden>
          {Array.from({ length: total }, (_, i) => (
            <svg key={i} viewBox="-16 -12 32 24" width="34" height="26">
              <Candy x={0} y={0} />
            </svg>
          ))}
        </div>
      )}
      <p style={{ fontWeight: 700, margin: 0 }}>{text}</p>
      {msg && (
        <Feedback key={msg.n} kind={msg.kind}>
          {msg.text}
        </Feedback>
      )}
      <div className="row center">
        <AnswerBox value={value} active={!done} />
      </div>
      {!done ? (
        <NumberPad value={value} onChange={setValue} onSubmit={answer} maxDigits={3} />
      ) : (
        <InDock>
          <button type="button" className="btn primary big block" onClick={next}>
            つぎの もんだい →
          </button>
        </InDock>
      )}
    </div>
  );
}

export function DivLesson() {
  const [tab, setTab] = useState<Tab>('watch');
  return (
    <main className="screen narrow" style={{ ['--accent' as string]: MODES.learn.color, ['--accent-soft' as string]: MODES.learn.soft }}>
      <TopBar title="わりざん" onBack={() => navigate('/learn')} right={<SoundToggle />} />
      <LessonTabs<Tab>
        tabs={[
          ['watch', 'みる'],
          ['share', 'おなじに わける'],
          ['group', 'ずつ わける'],
          ['practice', 'れんしゅう'],
        ]}
        value={tab}
        onChange={setTab}
      />
      <DockLayout>
      {tab === 'watch' && <TimelinePlayer scenes={DIV_SCENES} title="わりざんって なに？" />}
      {tab === 'share' && <SharePanel />}
      {tab === 'group' && <GroupPanel />}
      {tab === 'practice' && <PracticePanel />}
      <p className="small muted" style={{ margin: 0 }}>
        いまは あまりの ない わりざん だけ だよ。
      </p>
      </DockLayout>
    </main>
  );
}
