# Copy Page Link

任意のページで、ページのタイトルと URL をリンクとしてクリップボードにコピーします。
Tampermonkey のメニューに次の 3 つのコマンドを追加します。

| コマンド                     | コピーされる内容                                                                                                                                                    |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| テキストリンクをコピー       | `<タイトル>` + 改行 + `<URL>`                                                                                                                                       |
| Markdown リンクをコピー      | `[<タイトル>](<URL>)`                                                                                                                                               |
| リッチテキストリンクをコピー | `<a href="<URL>"><タイトル></a>`（text/html）と `<URL>`（text/plain）。Slack や Word などリッチテキストを受け付ける場所ではリンク付きテキストとして貼り付けられます |

## インストール

[Install](https://raw.githubusercontent.com/ishioka0222/userscript/master/scripts/copy-page-link/copy-page-link.user.js)

※ 事前に [Tampermonkey](https://www.tampermonkey.net/) などのユーザースクリプトマネージャーが必要です。

## 対象ページ

- `*://*/*`（すべての http / https ページ）

ページ読み込み時に行うのはメニューコマンドの登録だけで、ページの内容は変更しません。

## 使い方

1. リンクをコピーしたいページを開きます。
2. ツールバーの Tampermonkey アイコンをクリックします。
3. 「Copy Page Link」の下に表示されるコマンド（テキスト / Markdown / リッチテキスト）をクリックします。
4. クリップボードにコピーされ、内容が alert で表示されます。

## 動作の仕組み

- テキストのコピーには `GM_setClipboard` を使います（Tampermonkey のメニューから実行した直後はページがフォーカスを持っていないことがあり、`navigator.clipboard` が失敗しうるため）。
- リッチテキストは text/html と text/plain を同時に書き込むため `navigator.clipboard.write` を試し、失敗した場合は `GM_setClipboard(html, "html")` にフォールバックします。
- どちらも失敗した場合は `prompt` で内容を表示し、手動でコピーできるようにします。

## 依存しているサイト内部の実装

なし（`document.title` と `location.href` のみを使用します）。
