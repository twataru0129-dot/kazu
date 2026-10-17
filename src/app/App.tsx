import { useEffect } from 'react';
import { useApp } from './AppContext';
import { match, navigate, usePath } from './router';
import { HomeScreen } from '../screens/HomeScreen';
import { ProfileCreateScreen, ProfileSelectScreen } from '../screens/ProfileScreens';
import { GamesListScreen } from '../screens/GamesListScreen';
import { GameScreen } from '../games/GameScreen';
import { isGameId } from '../domain/games/registry';
import { CalcScreen } from '../screens/CalcScreen';
import { LearnHome } from '../screens/learn/LearnHome';
import { MulLesson } from '../screens/learn/MulLesson';
import { DivLesson } from '../screens/learn/DivLesson';
import { TestScreen } from '../screens/test/TestScreen';
import { ParentScreen } from '../screens/parent/ParentScreen';

/** プロフィールが必要な画面 */
const NEEDS_PROFILE = ['/home', '/calc', '/play', '/learn', '/test', '/parent'];

export function App() {
  const app = useApp();
  const path = usePath();
  const base = '/' + (path.split('/')[1] ?? '');

  useEffect(() => {
    if (app.profiles.length === 0 && path !== '/create') navigate('/create', { replace: true });
    else if (!app.profile && NEEDS_PROFILE.includes(base)) navigate('/', { replace: true });
  }, [app.profiles.length, app.profile, path, base]);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [path]);

  if (path === '/create') return <ProfileCreateScreen />;
  if (!app.profile || path === '/' || path === '') return app.profiles.length ? <ProfileSelectScreen /> : <ProfileCreateScreen />;

  const key = app.profile.id; // プロフィールが変わったら画面ごと作り直す（途中の状態を持ち越さない）
  if (path === '/home') return <HomeScreen key={key} />;
  if (path === '/calc') return <CalcScreen key={key} />;
  if (path === '/play') return <GamesListScreen key={key} />;
  const g = match('/play/:id', path);
  if (g && isGameId(g.id)) return <GameScreen key={`${key}-${g.id}`} gameId={g.id} />;
  if (path === '/learn') return <LearnHome key={key} />;
  if (path === '/learn/mul') return <MulLesson key={key} />;
  if (path === '/learn/div') return <DivLesson key={key} />;
  if (path === '/test') return <TestScreen key={key} />;
  if (path === '/parent') return <ParentScreen key={key} />;
  return <HomeScreen key={key} />;
}
