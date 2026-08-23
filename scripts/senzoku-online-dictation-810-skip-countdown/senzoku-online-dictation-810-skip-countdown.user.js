// ==UserScript==
// @name            Senzoku Online School - Dictation 810 - Skip Countdown
// @name:ja         洗足オンラインスクール - オンライン聴音810 - カウントダウンをスキップ
// @namespace       https://github.com/ishioka0222/userscript
// @version         1.0.0
// @description     Skips the countdown between playbacks in "Online Dictation 810" on Senzoku Online School.
// @description:ja  洗足オンラインスクールの「オンライン聴音810」で、演奏と演奏の間のカウントダウンをスキップします。
// @author          Hiroki Ishioka
// @license         MIT
// @homepageURL     https://github.com/ishioka0222/userscript/tree/master/scripts/senzoku-online-dictation-810-skip-countdown
// @supportURL      https://github.com/ishioka0222/userscript/issues
// @updateURL       https://raw.githubusercontent.com/ishioka0222/userscript/master/scripts/senzoku-online-dictation-810-skip-countdown/senzoku-online-dictation-810-skip-countdown.user.js
// @downloadURL     https://raw.githubusercontent.com/ishioka0222/userscript/master/scripts/senzoku-online-dictation-810-skip-countdown/senzoku-online-dictation-810-skip-countdown.user.js
// @match           https://www.senzoku-online.jp/DICT/810JP/index.php
// @icon            https://www.google.com/s2/favicons?sz=64&domain=senzoku-online.jp
// @run-at          document-idle
// @noframes
// @grant           none
// ==/UserScript==

/*
 * 依存しているサイト内部の実装（https://www.senzoku-online.jp/DICT/810JP/dict810js.js）
 *
 *   - グローバル関数 dict_ct()
 *       各演奏（audio の ended イベント）の終了時に呼ばれ、
 *       condition を "count" にして次の演奏までのカウントダウンを開始する。
 *   - グローバル関数 ct_refresh()
 *       1 秒ごとに setTimeout で呼ばれ、times をインクリメントする。
 *       times が上限（dictV が "1"/"2" なら 21、"4"/"r" なら 11）に達すると
 *       「次の演奏」ボタンを表示する。
 *   - グローバル変数 condition : "stop" | "play" | "pause" | "count" | "fin"
 *   - グローバル変数 times     : カウントダウンの経過秒数
 *   - グローバル変数 timer1    : ct_refresh 用の setTimeout の ID
 *
 * これらの名前や挙動が変わると、このスクリプトは動作しなくなる。
 */

(function () {
  "use strict";

  // @grant none のためこのスクリプトはページのコンテキストで動作し、
  // サイト側が var / function で宣言したグローバルには window 経由でアクセスできる。

  // ct_refresh 関数で times と比較される上限値の最大値
  // （dictV によって 21 または 11 だが、大きいほうに合わせておけばどちらでも即座に終了する）
  const TIMES_MAX = 21;

  // dict_ct 関数の直後に呼び出す関数
  const afterDictCt = () => {
    // 秒数をカウント中でなければ何もしない（演奏終了時など）
    if (window.condition !== "count") {
      return;
    }
    // 秒数に上限値を設定する。
    window.times = TIMES_MAX;
    // dict_ct 関数で設定されたタイマーを解除する。
    clearTimeout(window.timer1);
    // ct_refresh 関数を直ちに実行する。
    window.timer1 = setTimeout(window.ct_refresh, 0);
  };

  // dict_ct 関数をラップする。
  // audio の ended イベントリスナーは dict_play 実行時に dict_ct を参照して登録されるため、
  // ページ読み込み後・再生開始前に差し替えておけばラップ後の関数が呼ばれる。
  const originalDictCt = window.dict_ct;
  window.dict_ct = () => {
    originalDictCt();
    afterDictCt();
  };
})();
