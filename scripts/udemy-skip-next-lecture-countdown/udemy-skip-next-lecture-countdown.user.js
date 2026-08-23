// ==UserScript==
// @name            Udemy - Skip Next Lecture Countdown
// @name:ja         Udemy - 次のレクチャーまでのカウントダウンをスキップ
// @namespace       https://github.com/ishioka0222/userscript
// @version         1.0.0
// @description     Skips the countdown before the next lecture starts on Udemy by clicking "Go to Next" immediately.
// @description:ja  Udemyで次のレクチャーが始まるまでのカウントダウンを、「Go to Next」ボタンを即座にクリックしてスキップします。
// @author          Hiroki Ishioka
// @license         MIT
// @homepageURL     https://github.com/ishioka0222/userscript/tree/master/scripts/udemy-skip-next-lecture-countdown
// @supportURL      https://github.com/ishioka0222/userscript/issues
// @updateURL       https://raw.githubusercontent.com/ishioka0222/userscript/master/scripts/udemy-skip-next-lecture-countdown/udemy-skip-next-lecture-countdown.user.js
// @downloadURL     https://raw.githubusercontent.com/ishioka0222/userscript/master/scripts/udemy-skip-next-lecture-countdown/udemy-skip-next-lecture-countdown.user.js
// @match           https://udemy.com/course/*
// @match           https://*.udemy.com/course/*
// @icon            https://www.google.com/s2/favicons?sz=64&domain=udemy.com
// @run-at          document-idle
// @noframes
// @grant           none
// ==/UserScript==

/*
 * 依存しているサイト内部の実装
 *
 *   - レクチャー終了後に表示される「Go to Next」ボタンの DOM
 *       セレクタ: div[data-purpose="go-to-next-button"]
 *
 * Udemy 側でこの data-purpose 属性の名前や要素が変わると、このスクリプトは動作しなくなる。
 */

(function () {
  "use strict";

  // 「Go to Next」ボタンのセレクタ
  const GO_TO_NEXT_BUTTON_SELECTOR = 'div[data-purpose="go-to-next-button"]';

  // ボタンの監視間隔（ミリ秒）
  const POLLING_INTERVAL_MS = 100;

  const clickGoToNextButton = () => {
    // 「Go to Next」ボタンを取得する。
    const button = document.querySelector(GO_TO_NEXT_BUTTON_SELECTOR);
    // 「Go to Next」ボタンが存在する場合、クリックする。
    if (button) {
      button.click();
    }
  };

  // 一定間隔で「Go to Next」ボタンの有無を確認し、あればクリックする。
  // （Udemy は SPA で DOM の差し替えが多いため、単純なポーリングで検出している）
  setInterval(clickGoToNextButton, POLLING_INTERVAL_MS);
})();
