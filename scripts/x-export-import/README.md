# X - Export / Import

[X（旧 Twitter）](https://x.com/)で、ユーザー一覧（フォロー / フォロワー / リストメンバー）を TSV でエクスポートし、ユーザーをリストへ一括追加（インポート）します。
x.com の右下に「X Export / Import」ボタンが表示され、クリックするとパネルが開きます。

## インストール

[Install](https://raw.githubusercontent.com/ishioka0222/userscript/master/scripts/x-export-import/x-export-import.user.js)

※ 事前に [Tampermonkey](https://www.tampermonkey.net/) などのユーザースクリプトマネージャーが必要です。
※ Chrome（Manifest V3）では `chrome://extensions` で「デベロッパーモード」を ON にしないとユーザースクリプトが実行されません（Tampermonkey 5.x 以降）。

## 対象ページ

- `https://x.com/*`
- `https://twitter.com/*`（x.com にリダイレクトされる前提）

## 使い方

### エクスポート（一覧取得）

1. 対象ページを開きます。
   - フォロー一覧: `https://x.com/<スクリーンネーム>/following`（`followers` なども可）
   - リストのメンバー: `https://x.com/i/lists/<リストID>/members`（メンバー一覧ダイアログが表示された状態）
2. 「X Export / Import」→「エクスポート（一覧取得）」タブ →「取得開始」
   - 自動スクロールしてユーザーを収集します。6 回連続で件数が増えなければ終了します。
   - 取りこぼす場合（遅い回線など）は「読み込み待ち(ms)」を 1500 程度にして再実行してください。
3. 完了後、「TSV ダウンロード」（`screen_name<TAB>name`、UTF-8 BOM 付き）または「スクリーンネームをコピー」が使えます。
   - 取得結果はスクリプトのストレージにも保存され、インポート側の「前回の取得結果を読み込む」で呼び出せます（別アカウントにログインし直しても残ります）。

### インポート（リストに追加）

1. リストの所有アカウントでログインし、x.com の任意ページで「X Export / Import」→「インポート（リストに追加）」タブを開きます。
2. リスト ID を入力します（`/i/lists/<ID>` のページを開いていれば自動で入ります。前回値も記憶されます）。
3. ユーザー一覧を貼り付けます（1 行 1 件。`@` 付き・プロフィール URL・TSV の 1 列目でも可。重複は除去されます）。
   - または「前回の取得結果を読み込む」でエクスポート結果を読み込めます。
4. 「開始」を押すと、2〜5 秒のランダム間隔で 1 件ずつリストに追加します。
   - 進捗（成功 / 失敗 / 未処理）は 1 件ごとにストレージへ保存され、「中断」でいつでも止められます。
5. 終了条件と対処
   - **403 が 5 連続** → 日次上限（約 100 件）とみなして自動中断し、直近 5 件を未処理に戻します。翌日パネルを開くと「未処理キューあり」と出るので「再開」してください。
   - **429** → レート制限。時間をおいて「再開」してください。
   - 散発的な 403 → 鍵アカウント（追加不可）。FAIL としてログに残ります。
   - `ct0クッキーが見つかりません` → ログインしていません。

## 注意事項

- インポートは X の**非公式 API**（`POST /i/api/1.1/lists/members/create.json`）を利用しています。X 側の仕様変更で予告なく動かなくなる可能性があり、利用は自己責任でお願いします。
- `authorization` ヘッダーの Bearer トークンは X の Web アプリ共通の公開トークンで、秘密情報ではありません。
- 1 日に追加できる件数には上限（実測で約 100 件）があります。
- 取得・追加のいずれも自動操作にあたるため、短時間に大量実行するとレート制限を受けることがあります。

## 動作の仕組み・設計メモ

- Bookmarklet ではなくユーザースクリプトにしたのは、x.com の CSP が厳しく外部スクリプトを読み込めないことと、`GM_setValue` で進捗を永続化して翌日「再開」できるようにするためです。
- x.com の CSP / Trusted Types の影響を受けないよう、UI は `innerHTML` や `<style>` を使わず `createElement` + CSSOM（`el.style`）で構築しています。
- `fetch` はページ側（`unsafeWindow.fetch`）を使い、`credentials: 'include'` でログイン Cookie を送ります。
- x.com は SPA のため、1 秒間隔で `location.href` を監視して対象ページの表示とリスト ID の自動入力を更新します。

## 依存しているサイト内部の実装

以下が変更されると動作しなくなります。

| 区分 | 対象                       | 内容                                                                                                                                                                                             |
| ---- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| DOM  | ユーザーセル               | `[data-testid="UserCell"]`                                                                                                                                                                       |
| DOM  | スクリーンネーム           | セル内の最初の `a[href^="/"]` の `href`（先頭の `/` を除いた、`/` を含まないもの）                                                                                                               |
| DOM  | 表示名                     | セルの `innerText` の 1 行目                                                                                                                                                                     |
| DOM  | リストメンバー一覧         | `[role="dialog"]` 内。配下の `overflow-y: auto\|scroll` かつ `scrollHeight > clientHeight + 100` の最初の `div` をスクロール                                                                     |
| DOM  | 収集範囲（ダイアログ無し） | メインカラム `[data-testid="primaryColumn"]` 内のみ。右サイドバー `[data-testid="sidebarColumn"]`（「おすすめユーザー」も `UserCell` で描画される）は除外                                        |
| URL  | リストメンバー             | `/i/lists/<数字>/members`                                                                                                                                                                        |
| URL  | ユーザー一覧               | `/<sn>/(following\|followers\|verified_followers\|followers_you_follow)`                                                                                                                         |
| API  | リストに追加               | `POST {origin}/i/api/1.1/lists/members/create.json`、body `list_id=<id>&screen_name=<sn>`、headers `authorization: Bearer <公開トークン>` / `x-csrf-token: <Cookie ct0>`、`credentials: include` |
| API  | ステータス                 | 200 成功 / 403 日次上限または鍵アカウント / 429 レート制限                                                                                                                                       |
