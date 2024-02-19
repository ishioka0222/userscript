// ==UserScript==
// @name         Udemy - Go to Next - No-Wait
// @namespace    https://ishioka0222.github.io/
// @version      2024-02-19
// @description  Udemyで次の動画が表示されるまでの待機時間をなくします。
// @author       Hiroki Ishioka <ishioka0222@gmail.com>
// @match        https://udemy.com/course/*
// @match        https://*.udemy.com/course/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=udemy.com
// @grant        none
// ==/UserScript==

(function () {
  "use strict";

  const goToNextCallback = () => {
    // 「Go to Next」ボタンを取得する。
    const button = document.querySelector(
      'div[data-purpose="go-to-next-button"]'
    );
    // 「Go to Next」ボタンが存在する場合、クリックする。
    if (button) {
      button.click();
    }
  };

  // 100ミリ秒ごとにgoToNextCallback関数を実行する。
  setInterval(goToNextCallback, 100);
})();
