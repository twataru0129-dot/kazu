import { navigate } from '../../app/router';
import { SoundToggle, TopBar } from '../../components/ui';
import { MODES } from '../../config/theme';

export function LearnHome() {
  return (
    <main className="screen narrow" style={{ ['--accent' as string]: MODES.learn.color, ['--accent-soft' as string]: MODES.learn.soft }}>
      <TopBar title="まなぶ" onBack={() => navigate('/home')} right={<SoundToggle />} />
      <p className="muted" style={{ margin: 0 }}>
        どこから はじめても いいよ。「みる」「うごかす」「れんしゅう」を すきな じゅんばんで。
      </p>
      {(
        [
          ['/learn/mul', 'かけざん', '「2こずつ 3さら」で かけざんの いみが わかるよ', '2×3'],
          ['/learn/div', 'わりざん', '「おなじ かずずつ わける」を あめで ためそう', '10÷2'],
        ] as const
      ).map(([path, title, sub, mark]) => (
        <button key={path} type="button" className="mode-card" style={{ ['--soft' as string]: MODES.learn.soft, minHeight: 140, flexDirection: 'row', textAlign: 'left', gap: 16, padding: 18 }} onClick={() => navigate(path)}>
          <span className="num" style={{ fontSize: '1.8rem', background: MODES.learn.color, color: '#fff', borderRadius: 18, padding: '14px 12px', minWidth: 96, textAlign: 'center' }}>
            {mark}
          </span>
          <span>
            <strong style={{ display: 'block' }}>{title}</strong>
            <span>{sub}</span>
          </span>
        </button>
      ))}
    </main>
  );
}
