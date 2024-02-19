// ==UserScript==
// @name         洗足オンラインスクール - オンライン聴音810 - 待機時間なし
// @namespace    https://ishioka0222.github.io/
// @version      2024-02-19
// @description  オンライン聴音810の待機時間をなくします。
// @author       Hiroki Ishioka <ishioka0222@gmail.com>
// @match        https://www.senzoku-online.jp/DICT/810JP/index.php
// @icon         https://www.google.com/s2/favicons?sz=64&domain=senzoku-online.jp
// @grant        none
// ==/UserScript==

(function () {
  "use strict";

  // ct_refresh関数で設定される秒数の最大値
  const TIMES_MAX = 21;

  // dict_ct関数の直後に呼び出す関数
  const after_dict_ct = () => {
    const is_count = condition === "count";
    if (is_count) {
      // 秒数をカウント中の場合
      // 秒数に最大値を設定する。
      times = TIMES_MAX;
      // dict_ct関数で設定されたタイマーを解除する。
      clearTimeout(timer1);
      // ct_refresh関数を直ちに実行する。
      timer1 = setTimeout(ct_refresh, 0);
    }
  };

  // dict_ct関数をラップする。
  const original_dict_ct = dict_ct;
  dict_ct = () => {
    original_dict_ct();
    after_dict_ct();
  };
})();
