import type { ComponentType } from 'react';
import type { GameId } from '../domain/games/types';
import { DecomposeView } from './views/DecomposeView';
import { PittariView } from './views/PittariView';
import { Make10View } from './views/Make10View';
import { KufuuView } from './views/KufuuView';
import { BalanceView } from './views/BalanceView';
import { SequenceView } from './views/SequenceView';
import { MachineView } from './views/MachineView';
import { FlashView } from './views/FlashView';
import { NumberLineView } from './views/NumberLineView';
import { CoinsView } from './views/CoinsView';
import { ShoppingView } from './views/ShoppingView';
import { SudokuView } from './views/SudokuView';
import { MazeView } from './views/MazeView';
import { ShapesView } from './views/ShapesView';
import { MirrorView } from './views/MirrorView';
import { PatternView } from './views/PatternView';
import { MissingView } from './views/MissingView';
import { TriangleView } from './views/TriangleView';
import { DotsView } from './views/DotsView';
import { SymbolMemoryView } from './views/SymbolMemoryView';
import { NonogramView } from './views/NonogramView';
import { LightSequenceView } from './views/LightSequenceView';
import { NetQuizView } from './views/NetQuizView';
import { ShuffleCupsView } from './views/ShuffleCupsView';
import { VanishingPathView } from './views/VanishingPathView';
import { ClockMasterView } from './views/ClockMasterView';
import { NumberHuntView } from './views/NumberHuntView';

/** ゲームID → ゲーム固有の画面。ドメインの登録表（registry）と対になる。 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const GAME_VIEWS: Record<GameId, ComponentType<any>> = {
  decompose: DecomposeView,
  pittari: PittariView,
  make10: Make10View,
  kufuu: KufuuView,
  balance: BalanceView,
  sequence: SequenceView,
  machine: MachineView,
  flash: FlashView,
  numberline: NumberLineView,
  coins: CoinsView,
  shopping: ShoppingView,
  sudoku: SudokuView,
  maze: MazeView,
  shapes: ShapesView,
  mirror: MirrorView,
  pattern: PatternView,
  'missing-number': MissingView,
  'triangle-pattern': TriangleView,
  'dot-connect': DotsView,
  'symbol-memory': SymbolMemoryView,
  nonogram: NonogramView,
  'light-sequence': LightSequenceView,
  'net-quiz': NetQuizView,
  'shuffle-cups': ShuffleCupsView,
  'vanishing-path': VanishingPathView,
  'clock-master': ClockMasterView,
  'number-hunt': NumberHuntView,
};
