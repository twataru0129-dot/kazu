import { useEffect, useState } from 'react';
import { useParental } from '../../app/ParentalContext';
import { play } from '../../audio/sfx';
import { speak } from '../../audio/speech';

/** 残り5分の みじかい 案内（1回分につき1度だけ。音・読み上げは設定どおり） */
export function PlaytimeNotice() {
  const { warnCount } = useParental();
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (warnCount === 0) return;
    setShow(true);
    play('soft');
    speak('あと 5ふんで おしまいだよ');
    const id = window.setTimeout(() => setShow(false), 8000);
    return () => window.clearTimeout(id);
  }, [warnCount]);
  if (!show) return null;
  return (
    <div className="playtime-notice" role="status" data-testid="playtime-notice">
      ⏰ あと 5ふんで おしまいだよ
    </div>
  );
}
