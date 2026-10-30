import { useEffect } from 'react';
import { useParental } from '../../app/ParentalContext';
import { modeOf } from '../../domain/parental/playtime';
import { speak } from '../../audio/speech';
import { PinEntry } from './PinEntry';

/**
 * 時間切れの画面。App 全体をこの画面に差し替えるので、うしろのゲームや設定には さわれない。
 * 保護者が PIN を入れると解除され、時間枠が設定値に戻る（つぎに遊びはじめるまで数えない）。
 * 毎日自動回復では、0時を すぎると 自動で とける（ParentalContext が 日付を みて いる）。PIN は その日の 追加の 許可。
 */
export function LockScreen() {
  const parental = useParental();
  const daily = modeOf(parental.config) === 'daily';
  useEffect(() => {
    speak('おしまいの じかんだよ！ おとうさん、おかあさんに かえしてね');
    // 開いていたダイアログなどのフォーカスを外す
    (document.activeElement as HTMLElement | null)?.blur?.();
  }, []);
  return (
    <main className="screen narrow lock-screen" role="alertdialog" aria-modal="true" aria-labelledby="lock-title" data-testid="lock-screen">
      <div className="center-text stack" style={{ marginTop: 16 }}>
        <svg viewBox="0 0 120 90" width="140" height="105" aria-hidden style={{ margin: '0 auto' }}>
          <circle cx="60" cy="48" r="36" fill="#ffd34d" />
          <path d="M44 44 q4 -6 8 0 M68 44 q4 -6 8 0" stroke="#5a3b25" strokeWidth="3.5" fill="none" strokeLinecap="round" />
          <path d="M46 58 q14 12 28 0" stroke="#5a3b25" strokeWidth="3.5" fill="none" strokeLinecap="round" />
          <circle cx="40" cy="56" r="5" fill="#ffb199" />
          <circle cx="80" cy="56" r="5" fill="#ffb199" />
          <path d="M14 20 l6 4 M106 20 l-6 4 M60 2 v8" stroke="#f4b400" strokeWidth="3" strokeLinecap="round" />
        </svg>
        <h1 id="lock-title" style={{ margin: 0, fontSize: '1.9rem' }}>
          おしまいの じかんだよ！
        </h1>
        <p style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700 }}>
          <span className="phrase">おとうさん、おかあさんに</span> <span className="phrase">かえしてね 😊</span>
        </p>
        {daily && (
          <p style={{ margin: 0, fontWeight: 700 }} data-testid="lock-daily">
            <span className="phrase">あしたに なったら</span> <span className="phrase">また あそべるよ 🌙</span>
          </p>
        )}
      </div>
      <div className="card stack">
        <p className="center-text" style={{ margin: 0, fontWeight: 700 }}>
          おとなの ひとが あんしょうばんごうを いれてね
        </p>
        {daily && (
          <p className="center-text small" style={{ margin: 0 }}>
            （保護者の方へ）暗証番号を入れると、今日だけ {parental.config.limitMinutes}分 追加で遊べます。
          </p>
        )}
        <PinEntry onSubmit={parental.unlockWithPin} submitLabel="かいじょ" />
      </div>
    </main>
  );
}
