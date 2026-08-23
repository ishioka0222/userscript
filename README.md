# UserScript

[![CI](https://github.com/ishioka0222/userscript/actions/workflows/ci.yml/badge.svg)](https://github.com/ishioka0222/userscript/actions/workflows/ci.yml)

[Tampermonkey](https://www.tampermonkey.net/) などのユーザースクリプトマネージャー向けに作成したユーザースクリプトを公開しています。

## スクリプト一覧

| スクリプト                                                                                                     | 説明                                                                                              | 対象サイト                                                              | インストール                                                                                                                                                                       |
| -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Senzoku Online School - Dictation 810 - Skip Countdown](scripts/senzoku-online-dictation-810-skip-countdown/) | 洗足オンラインスクールの「オンライン聴音810」で、演奏と演奏の間のカウントダウンをスキップします。 | [senzoku-online.jp](https://www.senzoku-online.jp/DICT/810JP/index.php) | [Install](https://raw.githubusercontent.com/ishioka0222/userscript/master/scripts/senzoku-online-dictation-810-skip-countdown/senzoku-online-dictation-810-skip-countdown.user.js) |
| [Udemy - Skip Next Lecture Countdown](scripts/udemy-skip-next-lecture-countdown/)                              | Udemy で次のレクチャーが始まるまでのカウントダウンをスキップします。                              | [udemy.com](https://www.udemy.com/)                                     | [Install](https://raw.githubusercontent.com/ishioka0222/userscript/master/scripts/udemy-skip-next-lecture-countdown/udemy-skip-next-lecture-countdown.user.js)                     |

## インストール方法

1. ブラウザにユーザースクリプトマネージャーをインストールします。
   - [Tampermonkey](https://www.tampermonkey.net/)（Chrome / Edge / Firefox / Safari など）
   - [Violentmonkey](https://violentmonkey.github.io/)
2. 上の一覧の「Install」リンクをクリックすると、スクリプトマネージャーのインストール画面が開きます。
3. 内容を確認してインストールしてください。

各スクリプトには `@updateURL` / `@downloadURL` が設定されているため、インストール後はスクリプトマネージャーの自動更新で最新版が配信されます。

## 免責事項

これらのスクリプトは対象サイトの内部実装（DOM 構造やグローバル関数など）に依存しており、サイト側の変更によって予告なく動作しなくなることがあります。
不具合を見つけた場合は [Issues](https://github.com/ishioka0222/userscript/issues) からお知らせください。

## リポジトリ構成

```
.
├── .github/workflows/ci.yml   # CI（lint / ヘッダー検証 / @version 更新チェック）
├── scripts/
│   └── <name>/
│       ├── <name>.user.js     # スクリプト本体（配布物）
│       └── README.md          # スクリプトの説明・依存しているサイト内部のメモ
├── tools/
│   └── check-version-bump.mjs # @version の上げ忘れを検出するスクリプト
├── eslint.config.js
└── package.json
```

- スクリプトは `scripts/<name>/<name>.user.js` に 1 スクリプト 1 フォルダで配置します。
- `<name>` は `<サイト識別子>-<ユーザーから見た効果>` の kebab-case で命名します（例: `udemy-skip-next-lecture-countdown`）。
- ファイル名（= インストール URL）は一度公開したら変更しません。

## 開発

```sh
npm ci
npm run check          # lint + format check
npm run lint:fix       # ESLint の自動修正
npm run format         # Prettier で整形
npm run check:version  # 変更した .user.js の @version が origin/master より上がっているか確認
```

### スクリプトを追加・変更するときのルール

- メタデータヘッダーは英語を既定とし、`@name:ja` / `@description:ja` で日本語を併記します。
- `@version` は [semver](https://semver.org/lang/ja/) で管理し、**スクリプトを変更したら必ず上げます**（上げないと利用者に更新が配信されません。CI でもチェックしています）。
- 依存しているサイト内部の実装（セレクタ・グローバル関数など）は、スクリプト冒頭のコメントと各スクリプトの README に記録します。
- コミットメッセージは [Conventional Commits](https://www.conventionalcommits.org/ja/) に従います（例: `feat(udemy): ...`, `fix(senzoku): ...`）。

## ライセンス

[MIT](LICENSE)
