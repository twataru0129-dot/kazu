import { navigate } from '../app/router';
import { GameIcon } from '../components/Icons';
import { SoundToggle, TopBar } from '../components/ui';
import { CATEGORY_LABEL, GAMES } from '../domain/games/registry';
import type { GameCategory } from '../domain/games/types';
import { MODES } from '../config/theme';

export function GamesListScreen() {
  const cats = Object.keys(CATEGORY_LABEL) as GameCategory[];
  return (
    <main className="screen" style={{ ['--accent' as string]: MODES.play.color, ['--accent-soft' as string]: MODES.play.soft }}>
      <TopBar title="あそぶ" onBack={() => navigate('/home')} right={<SoundToggle />} />
      {cats.map((c) => (
        <section key={c} aria-labelledby={`cat-${c}`}>
          <h2 id={`cat-${c}`} style={{ fontSize: '1rem', margin: '4px 0 8px', color: MODES.play.color }}>
            {CATEGORY_LABEL[c]}
          </h2>
          <div className="game-grid">
            {GAMES.filter((g) => g.category === c).map((g) => (
              <button key={g.id} type="button" className="game-card" onClick={() => navigate(`/play/${g.id}`)}>
                <GameIcon id={g.id} />
                <span className="no">{g.no}</span>
                <strong>{g.title}</strong>
                <span className="small muted">{g.input}</span>
              </button>
            ))}
          </div>
        </section>
      ))}
    </main>
  );
}
