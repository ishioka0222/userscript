# Show Environment Label

URL がルールに一致するページに「本番」「開発」などのラベルを常時表示し、今どの環境を操作しているかを一目で分かるようにします。
同じ見た目の管理画面（本番 / 開発 / 検証など）を取り違えないためのスクリプトです。

- 環境（`environments`）ごとに文字色 / 背景色 / 縁の色枠などを定義し、ルールやインスタンスは「環境 + 名前」を書くだけでラベルになります（例: `検証 db2_test12`）。
- タブタイトルに `[本番 db2_prod] ` のような接頭辞を付けたり、画面の縁に色枠を出したりできます。
- URL のテンプレート（`services`）を登録しておくと、**まだルールが無い環境を開いたときに「未登録」の注意ラベル**が出て、その場からルールを追加できます。
- 設定は 1 つの JSON で、Tampermonkey のメニューから編集 / コピー / 貼り付け（= エクスポート / インポート）できます。
- **外部通信は一切行いません。** 設定はこのスクリプトのストレージ（Tampermonkey の `GM_setValue`）にのみ保存されます。

## インストール

[Install](https://raw.githubusercontent.com/ishioka0222/userscript/master/scripts/show-environment-label/show-environment-label.user.js)

※ 事前に [Tampermonkey](https://www.tampermonkey.net/) などのユーザースクリプトマネージャーが必要です。

## 対象ページ

- `*://*/*`（すべての http / https ページ。iframe 内では動作しません）

すべてのページで動作しますが、行うのは URL の照合とラベル要素の追加だけです。

## 使い方

### Tampermonkey のメニュー

ツールバーの Tampermonkey アイコンをクリックすると、「Show Environment Label」の下に次のコマンドが表示されます。

| コマンド                     | 内容                                                                         |
| ---------------------------- | ---------------------------------------------------------------------------- |
| 設定を開く                   | 設定 JSON を編集するモーダルを開きます（保存 / コピー / 例を挿入）           |
| この URL のルールを追加…     | 現在の URL を元に pattern・名前・環境（・色）を入力して `rules` に追加します |
| ラベルを表示する（このタブ） | 一時的に隠したラベルを再表示します                                           |
| ラベルを隠す（このタブ）     | このタブではラベルを表示しません（ラベルをクリックしても同じ）               |

### 未登録の環境を開いたとき

`services` の pattern に一致するが、どの `instances` にも一致しない URL を開くと、黄色の注意ラベル「⚠ 未登録: <サービス名>（instance=…）」が表示されます。
「追加」ボタンを押し、名前と環境 ID（環境を使わない場合は色）を入力すると、捕捉した値を `match` に入れた instance が自動で追加されます。

## 設定 JSON

```json
{
  "defaults": {
    "position": "top-right",
    "titlePrefix": true,
    "frame": false,
    "labelFormat": "{env} {name}"
  },
  "environments": [
    { "id": "dev", "name": "開発", "bg": "#388e3c", "fg": "#ffffff" },
    { "id": "test", "name": "検証", "bg": "#fbc02d", "fg": "#000000" },
    {
      "id": "prod",
      "name": "本番",
      "bg": "#d32f2f",
      "fg": "#ffffff",
      "frame": true
    }
  ],
  "services": [
    {
      "name": "Db2 管理コンソール",
      "pattern": "https://*.db2.*.ibm.com/crn%3Av1%3Abluemix%3Apublic%3Adashdb-for-transactions%3A{region}%3Aa%2F{account:[0-9a-f]+}%3A{instance:[0-9a-f-]+}%3A%3A/console/*",
      "instances": [
        {
          "match": { "instance": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" },
          "name": "db2_prod",
          "env": "prod"
        },
        {
          "match": { "instance": "yyyyyyyy-yyyy-yyyy-yyyy-yyyyyyyyyyyy" },
          "name": "db2_test12",
          "env": "test"
        },
        {
          "match": { "instance": "zzzzzzzz-zzzz-zzzz-zzzz-zzzzzzzzzzzz" },
          "name": "db2_test13",
          "env": "test"
        }
      ]
    }
  ],
  "rules": [
    {
      "pattern": "https://*.dev.example.com/*",
      "env": "dev",
      "titlePrefix": false
    },
    {
      "pattern": "/^https:\\/\\/stg\\./",
      "label": "ステージング",
      "bg": "#1976d2",
      "fg": "#ffffff",
      "position": "top-bar"
    }
  ]
}
```

上の例では、Db2 の本番を開くと赤い「本番 db2_prod」（縁に赤枠、タブタイトルは `[本番 db2_prod] …`）、検証を開くと黄色い「検証 db2_test12」のように表示されます。

### 項目

| 項目                           | 内容                                                                                                                                                                                                                                                    |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `defaults.position`            | ラベルの既定位置。`top-left` / `top-right` / `bottom-left` / `bottom-right` / `top-bar`（画面上端の帯）                                                                                                                                                 |
| `defaults.titlePrefix`         | タブタイトルに `[ラベル] ` を付けるか（既定 `true`）                                                                                                                                                                                                    |
| `defaults.frame`               | 画面の縁に背景色の枠を出すか（既定 `false`）                                                                                                                                                                                                            |
| `defaults.labelFormat`         | `label` を省略したときのラベル文言の形式。`{env}` は環境名、`{name}` は名前に置き換わります（既定 `"{env} {name}"`）                                                                                                                                    |
| `environments[].id`            | 環境 ID。instance / rule の `env` から参照します                                                                                                                                                                                                        |
| `environments[].name`          | 環境名（「本番」など）。`{env}` に入ります                                                                                                                                                                                                              |
| `environments[]` のスタイル    | `bg` / `fg` / `position` / `titlePrefix` / `frame`。この環境を指定した instance / rule の既定値になります                                                                                                                                               |
| `services[].name`              | 人間が読めるサービス名。未登録ラベルに表示されます（URL 中の ID が読みにくい場合に便利）                                                                                                                                                                |
| `services[].pattern`           | URL のテンプレート。`{name}` や名前付きグループで値を捕捉します                                                                                                                                                                                         |
| `services[].instances[].match` | 捕捉した値と照合する `{ name: 値 }` の組。すべて一致した instance が採用されます                                                                                                                                                                        |
| `rules[].pattern`              | URL のパターン。一致したらそのルールのラベルを表示します                                                                                                                                                                                                |
| instance / rule 共通           | `name`（インスタンス名など）、`env`（環境 ID）、`label`（文言を直接指定。指定すると `name` / `env` からの組み立てより優先）、`bg` / `fg` / `position` / `titlePrefix` / `frame`（環境・`defaults` より優先）。`label` / `name` / `env` のいずれかは必須 |

- ラベル文言: `label` があればそれ。無ければ `labelFormat` の `{env}` と `{name}` から組み立てます（環境だけ、名前だけでも可）。
- スタイルの優先順位: **instance / rule → environment → defaults**。`fg` を省略すると背景色の明るさから黒 / 白を自動で選びます。
- 評価順は **services（先頭から）→ rules（先頭から）** で、最初に一致したものを採用します。

### pattern の記法

| 記法                        | 意味                                                                      |
| --------------------------- | ------------------------------------------------------------------------- |
| `*`                         | 任意の文字列（`/` を含む）                                                |
| `{name}`                    | `/` を含まない 1 区切り（`[^/]+`）を捕捉して `name` に入れる              |
| `{name:正規表現}`           | 指定した正規表現を捕捉して `name` に入れる（例: `{instance:[0-9a-f-]+}`） |
| `/正規表現/`、`/正規表現/i` | 正規表現そのもの。`(?<name>...)` の名前付きグループで捕捉                 |

簡易形は URL 全体（`location.href`、クエリやハッシュを含む）と先頭から末尾まで照合します。末尾に `*` を付けると「それ以降は何でもよい」になります。正規表現形は `^` `$` を自分で付けない限り部分一致です。

## 動作の仕組み

- `location.href` を 1 秒間隔で監視し、変わっていればルールを再評価します（SPA でも追従します）。
- ラベルは `document.documentElement` 直下に置いた要素の Shadow DOM 内に描画し、ページの CSS や CSP の影響を受けないよう `<style>` や `innerHTML` は使わず CSSOM（`el.style`）だけでスタイルを当てます。ラベル以外は `pointer-events: none` で、下の画面の操作を妨げません。
- タブタイトルは SPA で書き換えられることがあるため、接頭辞が外れていれば付け直します。ルールに一致しなくなったら接頭辞を外します。
- 設定の保存は他のタブにも反映されます（`GM_addValueChangeListener`）。
- 「このタブで隠す」は `sessionStorage` に保存するため、タブを閉じるまで有効です。

## 依存しているサイト内部の実装

なし（`location.href` と `document.title` のみを使用します）。
