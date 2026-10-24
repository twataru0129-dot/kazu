import { useState } from 'react';
import { useApp } from '../../app/AppContext';

export function StoragePanel() {
  const app = useApp();
  const [persistMsg, setPersistMsg] = useState<string | null>(null);
  return (
    <div className="card stack">
      <h2>記録の保存について</h2>
      <p style={{ margin: 0 }}>
        アプリの版：<strong data-testid="app-version" className="selectable">{__APP_VERSION__}</strong>（新しい版は、ホームなどの画面にいるときに自動で切り替わります。ゲームやテストの途中では切り替えません）
      </p>
      <p style={{ margin: 0 }}>
        現在の保存先：<strong>{app.persistent ? 'このブラウザ内（IndexedDB）' : '一時的なメモリ（ページを閉じると消えます）'}</strong>
      </p>
      <ul style={{ margin: 0, paddingLeft: '1.2em', lineHeight: 1.7 }}>
        <li>記録は「この端末の、このブラウザ（またはホーム画面アプリ）の保存領域」だけに保存されます。サーバーやクラウドには送信しません。</li>
        <li>同じ端末でも、Safari と Chrome、ブラウザで開いた場合とホーム画面に追加したアプリでは、保存領域が別になることがあります（記録が共有されません）。</li>
        <li>ブラウザの「履歴・Webサイトデータの削除」、プライベート（シークレット）モード、端末の空き容量不足、長期間使わなかった場合のブラウザによる自動削除などで、記録が消える可能性があります。</li>
        <li>大切な記録は「バックアップ」から JSON ファイルに保存しておくことをおすすめします。別の端末やブラウザへの引っ越しにも使えます。</li>
        <li>アプリの更新（新しいバージョン）では記録は消えません。</li>
        <li>子どもの個人情報はニックネームとアイコンだけです。広告・外部の解析ツールは使っていません。</li>
      </ul>
      {app.persistent && typeof navigator !== 'undefined' && navigator.storage?.persist && (
        <div className="row">
          <button
            type="button"
            className="btn"
            onClick={async () => {
              try {
                const ok = await navigator.storage.persist();
                setPersistMsg(ok ? 'ブラウザに「消さないで保存」をお願いしました（許可されました）。' : 'ブラウザが許可しませんでした。バックアップをご利用ください。');
              } catch {
                setPersistMsg('この環境では使えません。');
              }
            }}
          >
            ブラウザに長期保存をお願いする
          </button>
          {persistMsg && <span className="small">{persistMsg}</span>}
        </div>
      )}
    </div>
  );
}
