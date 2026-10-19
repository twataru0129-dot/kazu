# 新しいゲームを追加する手順

ゲームは「ドメインのロジック（純粋関数）」と「固有の画面」の2つでできています。
進行（難しさ選択・5問セット・ヒント・記録・途中保存・次へ）は共通の `src/games/GameScreen.tsx` が担当します。

## 1. ID を決める

`src/domain/games/types.ts` の `GameId` に新しい ID（例 `'clock'`）を追加します。

## 2. ロジックを書く（`src/domain/games/clock.ts`）

`GameLogic<Puzzle, Answer>` を実装します。UI のコードは入れません。

```ts
export const clock: GameLogic<ClockPuzzle, number | null> = {
  id: 'clock',
  generatorVersion: 1,          // 生成方法を変えたら上げる（記録に残る）
  create(rng, d) { ... },        // 乱数から候補を1つ。作れなければ null
  validate(p, d) { ... },        // 出題条件（可解・一意・範囲）を満たせば null、だめなら理由
  fallback(d) { ... },           // 検証済みの予備問題（各難易度1つ以上）
  judge(p, answer) { ... },      // 正誤の唯一の判定。多解なら solutionKey を返す
  hints(p, progress) { ... },    // 3段階。最後の操作は子ども自身にさせる
  key(p) { ... },                // 同じ問題を見分けるキー
};
```

守ること：
- 乱数は引数の `rng` だけを使う（シードで再現できるように）
- `eval` / `new Function` を使わない（ESLint で禁止）
- 曖昧な問題（答えが複数ありうる規則問題など）は `validate` で落とす
- 正当な別解は `judge` で必ず受理する

## 3. 登録表に追加（`src/domain/games/registry.ts`）

`GAMES` 配列に `GameMeta` を1つ追加します（番号・タイトル・カテゴリ・2文までの説明・`kind: 'set' | 'board'`・`resumable`・難易度ごとの説明・`logic`）。
一覧画面・おとなのメニューの集計は登録表から自動で反映されます。カテゴリを増やすときは `CATEGORY_LABEL` に追加します。
カテゴリは いま「かずを つくる・わける」「かずを くらべる・みぬく」「くらしの さんすう」「パズル・かたち・ひらめき」「きおく・しゅうちゅう（memory）」の5つです。

## 4. 画面を書く（`src/games/views/ClockView.tsx`）

`GameViewProps<Puzzle, Answer>` を受け取るコンポーネントを作り、`src/games/views.ts` の `GAME_VIEWS` に登録します。

- 正誤は必ず `submit(answer)` で判定する（画面で答えを計算し直さない）
- `status`（フィードバックとヒント）を入力欄の近くに置く
- 盤面型で途中保存するなら `saveDraft(state)` を呼び、`draft` から復元する（`resumable: true`）
- 盤面に応じたヒントが必要なら `reportProgress(progress)` を呼ぶ
- タップだけで遊べるようにする（ドラッグは任意の追加手段）。押せる場所は 48px 以上
- 色だけで区別させない（形・模様・文字を併用）
- アイコンは `src/components/Icons.tsx` の `GameIcon` に追加

## 5. テスト

- `src/domain/games/generation.test.ts` は登録表を読むので、追加するだけで全難易度×500シードの検証が走ります
- ゲーム固有の性質（一意性・多解の受理など）を `src/domain/games/games.test.ts` に追加
- 画面を操作して正解できることを `src/games/views.test.tsx` に追加
- `e2e/layout.spec.ts` の `GAMES` に ID を追加（各画面幅ではみ出しがないか）
- ID は `missing-number` のような 英小文字とハイフンの組み合わせでもよい（`GameId` と `GAME_VIEWS` のキーを一致させる）

## 6. 記録

`GameScreen` が自動で `StoredAttempt`（`mode: 'game'`・`gameId`・難易度・`generatorVersion`・問題と答えのスナップショット・初回正誤・最終正誤・再挑戦数・ヒント数）を保存します。
記録の形式を変える必要はありません。将来メダル等を付けるときは、この記録から判定します。

## 7. 時間を使うゲーム（見せてから かくす・光らせる など）

`20 きごうを おぼえよう`・`22 ひかる じゅんばん` が参考になります。

- 見せる・光らせるのは「みる」を押したときだけ。途中保存から再開したときに 自動で見せない（答えが見えてしまうのを防ぐ）
- `visibilitychange`（hidden）と `pagehide` で タイマーを止め、「みる」待ちに戻す。画面が かくれている あいだに 時間を へらさない
- タイマーは 再生ごとの番号（世代）を持ち、古い `setTimeout` が つぎの問題や ラウンドに 入りこまないようにする。アンマウントで すべて止める
- 1つの盤面の中に いくつかのラウンドがあるときは `kind: 'board'` にして、ラウンドの記録は `submit` に渡す答えの中に入れる（`answerSnapshot` に のこる。DB の形は変えない）

