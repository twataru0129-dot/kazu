import { useApp } from '../../app/AppContext';
import { speechAvailable } from '../../audio/speech';
import { GAME_BY_ID, isGameId } from '../../domain/games/registry';
import { DIFFICULTY_LABEL } from '../../domain/types';
import type { UserSettings } from '../../persistence/types';

export function SettingsPanel() {
  const app = useApp();
  const s = app.settings;
  if (!s || !app.profile) return null;
  const row = (key: keyof Pick<UserSettings, 'soundOn' | 'speechOn' | 'reducedMotion' | 'largeText'>, label: string, note?: string) => (
    <div className="row" style={{ justifyContent: 'space-between', borderBottom: '1px solid #e3eef7', paddingBottom: 8 }}>
      <span>
        <strong>{label}</strong>
        {note && <span className="small muted" style={{ display: 'block' }}>{note}</span>}
      </span>
      <button type="button" className="chip" role="switch" aria-checked={s[key]} aria-pressed={s[key]} aria-label={label} onClick={() => void app.updateSettings({ [key]: !s[key] })}>
        {s[key] ? 'オン' : 'オフ'}
      </button>
    </div>
  );
  const prefs = Object.entries(s.preferredDifficultyByGame);
  return (
    <div className="card stack">
      <h2>「{app.profile.nickname}」の せってい</h2>
      {row('soundOn', 'こうかおん', 'ただしい ときの みじかい おと など')}
      {row('speechOn', 'よみあげ', speechAvailable() ? 'せつめいや ヒントを よみあげます（じまくは いつも でます）' : 'この ブラウザでは よみあげが つかえません（じまくで つかえます）')}
      {row('reducedMotion', 'うごきを へらす', 'アニメーションを ひかえめに します（たんまつの「視差効果を減らす」設定も 反映します）')}
      {row('largeText', 'もじを おおきく')}
      <div>
        <strong>ゲームの まえの むずかしさ</strong>
        <p className="small muted" style={{ margin: '2px 0' }}>
          {prefs.length ? prefs.map(([g, d]) => `${isGameId(g) ? GAME_BY_ID[g].title : g}：${DIFFICULTY_LABEL[d]}`).join('、') : 'まだ ありません'}
        </p>
        {prefs.length > 0 && (
          <button type="button" className="btn small" onClick={() => void app.updateSettings({ preferredDifficultyByGame: {} })}>
            リセット
          </button>
        )}
      </div>
    </div>
  );
}
