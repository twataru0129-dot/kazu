import type { Difficulty } from '../types';
import type { GameCategory, GameId, GameLogic } from './types';
import { decompose } from './decompose';
import { pittari } from './pittari';
import { make10 } from './make10';
import { kufuu } from './kufuu';
import { balance } from './balance';
import { sequence } from './sequence';
import { machine } from './machine';
import { flash } from './flash';
import { numberline } from './numberline';
import { coins } from './coins';
import { shopping } from './shopping';
import { sudoku } from './sudoku';
import { maze } from './maze';
import { shapes } from './shapes';
import { mirror } from './mirror';
import { pattern } from './pattern';

/**
 * ゲーム登録表。一覧・カテゴリ・起動はすべてここから決まる。
 * 新しいゲームを追加するときは docs/ADDING_A_GAME.md を参照。
 */
export interface GameMeta {
  id: GameId;
  no: string;
  title: string;
  category: GameCategory;
  /** 短い説明（2文まで） */
  description: string;
  /** set: 5問で1セット / board: 1盤面で1区切り */
  kind: 'set' | 'board';
  /** 途中の盤面を保存して再開できるか */
  resumable: boolean;
  /** 入力方法の説明（一覧用） */
  input: string;
  difficultyNotes: Record<Difficulty, string>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  logic: GameLogic<any, any>;
}

export const CATEGORY_LABEL: Record<GameCategory, string> = {
  make: 'かずを つくる・わける',
  compare: 'かずを くらべる・みぬく',
  life: 'くらしの さんすう',
  puzzle: 'パズル・かたち・ひらめき',
};

export const SET_SIZE = 5;

export const GAMES: GameMeta[] = [
  {
    id: 'decompose', no: '01', title: 'すうじ分解パズル', category: 'make', kind: 'set', resumable: false, input: 'すうじを いれる',
    description: 'おおきな かずを いくつかの かずに わけよう。わけかたは いろいろ あるよ。',
    difficultyNotes: { easy: '5〜20を 2つに', normal: '100までを 2〜3つに', hard: '3けたを 3つに', challenge: '4けたまで・つかえない かず あり' },
    logic: decompose,
  },
  {
    id: 'pittari', no: '02', title: 'ぴったり計算', category: 'make', kind: 'set', resumable: false, input: 'すうじと きごう',
    description: 'こたえが めあての かずに なる しきを つくろう。いくつ みつけられるかな？',
    difficultyNotes: { easy: '10まで・たしざん', normal: '30まで・＋−', hard: '100まで・＋−', challenge: '3つの かずの しき' },
    logic: pittari,
  },
  {
    id: 'make10', no: '03', title: '10をつくれ！', category: 'make', kind: 'set', resumable: false, input: 'カードを タップ',
    description: 'カードを ぜんぶ 1かいずつ つかって 10 を つくろう。',
    difficultyNotes: { easy: '3まい・＋と−', normal: '3〜4まい・＋−', hard: '4〜5まい・＋−', challenge: '20や50を つくる' },
    logic: make10,
  },
  {
    id: 'kufuu', no: '04', title: '計算のくふう', category: 'make', kind: 'set', resumable: false, input: 'かずを うつす',
    description: 'かずを すこし うつして、きりのよい かずに してから けいさんしよう。',
    difficultyNotes: { easy: '9 を 10 に', normal: '19・29… を 10 の まとまりに', hard: '99・199… を 100 に', challenge: '2・5・10 うつす' },
    logic: kufuu,
  },
  {
    id: 'balance', no: '05', title: '天秤バトル', category: 'compare', kind: 'set', resumable: false, input: '3つから えらぶ',
    description: 'ひだりと みぎ、どちらの しきが おおきいかな？ おなじ ことも あるよ。',
    difficultyNotes: { easy: '1けた', normal: '2けた', hard: '3けた・くりあがり', challenge: 'ちかい かず・おなじ しき' },
    logic: balance,
  },
  {
    id: 'sequence', no: '06', title: 'すうじの法則', category: 'compare', kind: 'set', resumable: false, input: 'すうじを いれる',
    description: 'ならんだ かずの きまりを みつけて、□ に はいる かずを こたえよう。',
    difficultyNotes: { easy: '+1〜+5', normal: '+2〜+10', hard: 'へる ならびも', challenge: 'かけざん・こうごの ならび' },
    logic: sequence,
  },
  {
    id: 'machine', no: '07', title: 'ふしぎな数字マシン', category: 'compare', kind: 'set', resumable: false, input: 'すうじを いれる',
    description: 'マシンに かずを いれると かわって でてくるよ。ひみつの きまりを みつけよう。',
    difficultyNotes: { easy: '+1〜+5', normal: '+6〜+20・ひきざん', hard: '×2〜×5', challenge: 'かけて たす' },
    logic: machine,
  },
  {
    id: 'flash', no: '08', title: 'フラッシュ計算', category: 'compare', kind: 'set', resumable: false, input: 'すうじを いれる',
    description: 'つぎつぎ でてくる かずを ぜんぶ たそう。こたえる じかんは ゆっくりで いいよ。',
    difficultyNotes: { easy: '2〜3こ・1けた', normal: '4〜5こ・1けた', hard: '4〜6こ・2けた', challenge: '6〜8こ・はやめ' },
    logic: flash,
  },
  {
    id: 'numberline', no: '09', title: 'すうじの位置', category: 'compare', kind: 'set', resumable: false, input: 'タップ・うごかす',
    description: 'すうちょくせんの どこに その かずが あるかな？ マーカーを おこう。',
    difficultyNotes: { easy: '0〜10', normal: '0〜20', hard: '0〜100', challenge: '100〜1000' },
    logic: numberline,
  },
  {
    id: 'coins', no: '10', title: 'こぜに数え', category: 'life', kind: 'set', resumable: false, input: 'すうじを いれる',
    description: 'つくえの うえの おかねは ぜんぶで いくら？',
    difficultyNotes: { easy: '1えん・10えん', normal: '50えんまで', hard: '500えんまで・8まい', challenge: '6しゅるい・12まい' },
    logic: coins,
  },
  {
    id: 'shopping', no: '11', title: 'おかいものゲーム', category: 'life', kind: 'set', resumable: false, input: 'しょうひん＋すうじ',
    description: 'メモの ものを かごに いれて、ねだんを けいさんしよう。',
    difficultyNotes: { easy: '2こ・10えん きざみ', normal: '3こ・10えん きざみ', hard: '4こ・1えん たんい', challenge: 'こすう・おつり' },
    logic: shopping,
  },
  {
    id: 'sudoku', no: '12', title: 'ミニ数独', category: 'puzzle', kind: 'board', resumable: true, input: 'マス＋すうじ',
    description: 'たて・よこ・ふとい わくの なかに 1〜4 が 1かいずつ はいるように うめよう。',
    difficultyNotes: { easy: 'あき 4〜5', normal: 'あき 6〜7', hard: 'あき 8〜10', challenge: 'あき 10〜12' },
    logic: sudoku,
  },
  {
    id: 'maze', no: '13', title: 'かずの迷路', category: 'puzzle', kind: 'board', resumable: false, input: 'マスを タップ',
    description: 'しきの こたえが かいてある となりの マスへ すすんで、ゴールを めざそう。',
    difficultyNotes: { easy: '3×3・たしざん', normal: '4×4・2けた', hard: '5×5・まがりみち', challenge: '6×6・3つの かず' },
    logic: maze,
  },
  {
    id: 'shapes', no: '14', title: 'かたちパズル', category: 'puzzle', kind: 'board', resumable: true, input: 'うごかす・タップ',
    description: 'ピースを うごかして、かげの かたちを ぴったり うめよう。',
    difficultyNotes: { easy: '2ピース・ガイドあり', normal: '3ピース・まわす', hard: '4ピース', challenge: '5ピース・にた かたち' },
    logic: shapes,
  },
  {
    id: 'mirror', no: '15', title: 'かがみのかたち', category: 'puzzle', kind: 'board', resumable: true, input: 'マスを タップ',
    description: 'まんなかの せんを かがみに して、みぎがわを ぬろう。',
    difficultyNotes: { easy: '4×4', normal: '6×6', hard: '8×8', challenge: '10×10・2しょく' },
    logic: mirror,
  },
  {
    id: 'pattern', no: '16', title: 'なにがはいる？', category: 'puzzle', kind: 'set', resumable: false, input: 'えらぶ',
    description: 'かたちの ならびの きまりを みつけて、？に はいる ものを えらぼう。',
    difficultyNotes: { easy: 'ABAB', normal: 'AAB・ABC', hard: 'ABB・ABBA など', challenge: 'かたちと いろの 2つの きまり' },
    logic: pattern,
  },
];

export const GAME_BY_ID: Record<GameId, GameMeta> = Object.fromEntries(GAMES.map((g) => [g.id, g])) as Record<GameId, GameMeta>;

export function isGameId(id: string): id is GameId {
  return id in GAME_BY_ID;
}
