import { useEffect, useMemo, useState } from 'react';
import { useApp } from '../../app/AppContext';
import { levelLabel } from '../../domain/arithmetic/problems';
import { GAME_BY_ID, isGameId } from '../../domain/games/registry';
import { describeSettings, formatMs } from '../../domain/tests/scoring';
import { completedTests, practiceSuggestions, previousSame, statsByGame, statsByLevel, strengths, MIN_SAMPLES_FOR_SUGGESTION } from '../../domain/tests/stats';
import { OP_LABEL, type Op } from '../../domain/types';
import type { Session, StoredAttempt } from '../../persistence/types';

const fmtDate = (iso?: string) => (iso ? new Date(iso).toLocaleString('ja-JP', { year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '');

export function RecordsPanel() {
  const app = useApp();
  const [pid, setPid] = useState(app.profile?.id ?? app.profiles[0]?.id ?? '');
  const [attempts, setAttempts] = useState<StoredAttempt[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  useEffect(() => {
    if (!pid) return;
    Promise.all([app.repo.listAttempts(pid), app.repo.listSessions(pid)]).then(([a, s]) => {
      setAttempts(a);
      setSessions(s);
    });
  }, [app.repo, pid]);

  const calcStats = useMemo(() => statsByLevel(attempts, sessions, ['calculation']), [attempts, sessions]);
  const testStats = useMemo(() => statsByLevel(attempts, sessions, ['test']), [attempts, sessions]);
  const allStats = useMemo(() => statsByLevel(attempts, sessions), [attempts, sessions]);
  const games = useMemo(() => statsByGame(attempts), [attempts]);
  const tests = useMemo(() => completedTests(sessions), [sessions]);
  const learning = attempts.filter((a) => a.mode === 'learning');
  const suggest = practiceSuggestions(allStats);
  const good = strengths(allStats);

  const levelTable = (rows: typeof calcStats, label: string) => (
    <div className="table-wrap">
      <table className="data">
        <thead>
          <tr>
            <th>けいさん</th>
            <th>むずかしさ</th>
            <th>もんだい数</th>
            <th>{label}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((s) => (
            <tr key={s.key}>
              <td>{OP_LABEL[s.op as Op]}</td>
              <td>{levelLabel(s.levelKey)}</td>
              <td>{s.n}</td>
              <td>
                <div className="row" style={{ gap: 6, flexWrap: 'nowrap' }}>
                  <div className="bar" style={{ width: 80 }}>
                    <i style={{ width: `${s.rate * 100}%` }} />
                  </div>
                  {Math.round(s.rate * 100)}%
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="stack">
      <div className="card row">
        <label htmlFor="rec-profile" style={{ fontWeight: 700 }}>
          だれの きろく？
        </label>
        <select id="rec-profile" className="text-input" style={{ maxWidth: 260, minHeight: 48, fontSize: '1rem' }} value={pid} onChange={(e) => setPid(e.target.value)}>
          {app.profiles.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nickname}（{fmtDate(p.createdAt).split(' ')[0]} から）
            </option>
          ))}
        </select>
      </div>

      <div className="card">
        <h2>まとめ</h2>
        <p className="small muted" style={{ marginTop: 0 }}>
          きろくから その都度 計算しています。{MIN_SAMPLES_FOR_SUGGESTION}問以上の記録がある項目だけを「練習してみよう」「よくできている」に出します。少ない記録から得意・不得意を決めつけないためです。あそびモードの成績は学力の評価としては扱いません。
        </p>
        <p style={{ margin: '4px 0' }}>
          <strong>練習してみよう：</strong>
          {suggest.length ? suggest.map((s) => `${OP_LABEL[s.op as Op]}（${levelLabel(s.levelKey)}）`).join('、') : 'いまは とくに ありません'}
        </p>
        <p style={{ margin: '4px 0' }}>
          <strong>よくできている：</strong>
          {good.length ? good.map((s) => `${OP_LABEL[s.op as Op]}（${levelLabel(s.levelKey)}）`).join('、') : '—'}
        </p>
      </div>

      <div className="card">
        <h2>けいさんモード（1回目で正解した割合）</h2>
        {calcStats.length ? levelTable(calcStats, '1回目で正解') : <p className="muted">まだ記録がありません</p>}
      </div>

      <div className="card">
        <h2>テスト（完了したテストのみ・演算/難易度別）</h2>
        {testStats.length ? levelTable(testStats, '正解') : <p className="muted">まだ完了したテストがありません</p>}
      </div>

      <div className="card">
        <h2>テストの履歴</h2>
        <p className="small muted" style={{ marginTop: 0 }}>
          比較は「同じ条件」のひとつ前のテストとだけ行います。条件の違うテストは並べても優劣は比べません。正答率＝正解数÷問題数（スキップも分母に含む）。
        </p>
        {tests.length === 0 ? (
          <p className="muted">まだありません</p>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>日時</th>
                  <th>条件</th>
                  <th>正解</th>
                  <th>正答率</th>
                  <th>スキップ</th>
                  <th>時間</th>
                  <th>1問の中央値</th>
                  <th>同条件の前回</th>
                </tr>
              </thead>
              <tbody>
                {tests.map((t) => {
                  const prev = previousSame(tests, t);
                  const d = prev ? t.score.correct - prev.score.correct : null;
                  return (
                    <tr key={t.session.id}>
                      <td>{fmtDate(t.session.completedAt)}</td>
                      <td style={{ whiteSpace: 'normal', minWidth: 160 }}>{describeSettings(t.settings)}</td>
                      <td>
                        {t.score.correct}/{t.score.total}
                      </td>
                      <td>{Math.round(t.score.rate * 100)}%</td>
                      <td>{t.score.skipped}</td>
                      <td>{formatMs(t.score.totalActiveMs)}</td>
                      <td>{formatMs(t.score.medianMs)}</td>
                      <td>{prev ? `${prev.score.correct}/${prev.score.total}（${d! > 0 ? '+' : ''}${d}）` : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card">
        <h2>あそび</h2>
        {games.length === 0 ? (
          <p className="muted">まだありません</p>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>ゲーム</th>
                  <th>問題数</th>
                  <th>できた</th>
                  <th>ヒント</th>
                  <th>最後に遊んだ日</th>
                </tr>
              </thead>
              <tbody>
                {games.map((g) => (
                  <tr key={g.gameId}>
                    <td>{isGameId(g.gameId) ? `${GAME_BY_ID[g.gameId].no} ${GAME_BY_ID[g.gameId].title}` : g.gameId}</td>
                    <td>{g.plays}</td>
                    <td>{g.solved}</td>
                    <td>{g.hints}</td>
                    <td>{fmtDate(g.lastAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card">
        <h2>まなび（れんしゅう）</h2>
        <p style={{ margin: 0 }}>
          かけざん：{learning.filter((a) => a.op === 'multiply').length}問（正解 {learning.filter((a) => a.op === 'multiply' && a.finalCorrect).length}）／ わりざん：
          {learning.filter((a) => a.op === 'divide').length}問（正解 {learning.filter((a) => a.op === 'divide' && a.finalCorrect).length}）
        </p>
      </div>
    </div>
  );
}
