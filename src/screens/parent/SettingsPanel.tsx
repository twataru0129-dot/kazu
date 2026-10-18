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
      <h2>「{app.profile.nickname}」の設定</h2>
      {row('soundOn', '効果音', '正解したときの短い音など')}
      {row('speechOn', '読み上げ', speechAvailable() ? '説明やヒントを読み上げます（字幕は常に表示されます）' : 'このブラウザでは読み上げが使えません（字幕で利用できます）')}
      {row('reducedMotion', '動きを減らす', 'アニメーションを控えめにします（端末の「視差効果を減らす」設定も反映します）')}
      {row('largeText', '文字を大きく')}
      <div>
        <strong>ゲームごとの前回の難しさ</strong>
        <p className="small muted" style={{ margin: '2px 0' }}>
          {prefs.length ? prefs.map(([g, d]) => `${isGameId(g) ? GAME_BY_ID[g].title : g}：${DIFFICULTY_LABEL[d]}`).join('、') : 'まだありません'}
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
