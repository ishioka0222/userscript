# Senzoku Online School - Dictation 810 - Skip Countdown

洗足オンラインスクールの「[オンライン聴音810](https://www.senzoku-online.jp/DICT/810JP/index.php)」で、演奏と演奏の間のカウントダウン（最大 20 秒）をスキップし、すぐに「次の演奏」ボタンが表示されるようにします。

## インストール

[Install](https://raw.githubusercontent.com/ishioka0222/userscript/master/scripts/senzoku-online-dictation-810-skip-countdown/senzoku-online-dictation-810-skip-countdown.user.js)

※ 事前に [Tampermonkey](https://www.tampermonkey.net/) などのユーザースクリプトマネージャーが必要です。

## 対象ページ

- `https://www.senzoku-online.jp/DICT/810JP/index.php`

## 動作の仕組み

サイト側のグローバル関数 `dict_ct()`（各演奏の終了時に呼ばれ、カウントダウンを開始する）をラップし、カウントダウンが始まった直後にカウンターを上限値まで進めて、即座に「次の演奏」ボタンを表示させます。

## 依存しているサイト内部の実装

`https://www.senzoku-online.jp/DICT/810JP/dict810js.js` で定義されている以下のグローバルに依存しています。
これらが変更されると動作しなくなります。

| 名前         | 種類 | 役割                                                                                          |
| ------------ | ---- | --------------------------------------------------------------------------------------------- |
| `dict_ct`    | 関数 | 各演奏の終了時に呼ばれ、`condition` を `"count"` にしてカウントダウンを開始する               |
| `ct_refresh` | 関数 | 1 秒ごとに呼ばれて `times` を進め、上限（21 または 11）に達すると「次の演奏」ボタンを表示する |
| `condition`  | 変数 | `"stop"` / `"play"` / `"pause"` / `"count"` / `"fin"` のいずれか                              |
| `times`      | 変数 | カウントダウンの経過秒数                                                                      |
| `timer1`     | 変数 | `ct_refresh` 用の `setTimeout` の ID                                                          |
