# Udemy - Skip Next Lecture Countdown

[Udemy](https://www.udemy.com/) でレクチャーが終了したあと、次のレクチャーが始まるまでのカウントダウンをスキップします。
表示される「Go to Next」ボタンを自動的にクリックすることで実現しています。

## インストール

[Install](https://raw.githubusercontent.com/ishioka0222/userscript/master/scripts/udemy-skip-next-lecture-countdown/udemy-skip-next-lecture-countdown.user.js)

※ 事前に [Tampermonkey](https://www.tampermonkey.net/) などのユーザースクリプトマネージャーが必要です。

## 対象ページ

- `https://udemy.com/course/*`
- `https://*.udemy.com/course/*`

## 動作の仕組み

100 ミリ秒ごとに「Go to Next」ボタンの有無を確認し、存在すればクリックします。

## 依存しているサイト内部の実装

以下の DOM に依存しています。Udemy 側で変更されると動作しなくなります。

| 対象                 | セレクタ                                |
| -------------------- | --------------------------------------- |
| 「Go to Next」ボタン | `div[data-purpose="go-to-next-button"]` |
