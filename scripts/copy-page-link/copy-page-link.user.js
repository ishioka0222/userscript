// ==UserScript==
// @name            Any Site - Copy Page Link
// @name:ja         任意のサイト - ページのリンクをコピー
// @namespace       https://github.com/ishioka0222/userscript
// @version         1.0.0
// @description     Adds Tampermonkey menu commands that copy the current page's title and URL to the clipboard as a text / Markdown / rich text link.
// @description:ja  現在のページのタイトルと URL を、テキスト / Markdown / リッチテキストのリンクとしてクリップボードにコピーするメニューコマンドを Tampermonkey に追加します。
// @author          Hiroki Ishioka
// @license         MIT
// @homepageURL     https://github.com/ishioka0222/userscript/tree/master/scripts/any-site-copy-page-link
// @supportURL      https://github.com/ishioka0222/userscript/issues
// @updateURL       https://raw.githubusercontent.com/ishioka0222/userscript/master/scripts/any-site-copy-page-link/any-site-copy-page-link.user.js
// @downloadURL     https://raw.githubusercontent.com/ishioka0222/userscript/master/scripts/any-site-copy-page-link/any-site-copy-page-link.user.js
// @match           *://*/*
// @run-at          document-idle
// @noframes
// @grant           GM_registerMenuCommand
// @grant           GM_setClipboard
// ==/UserScript==

/*
 * 機能
 *   Tampermonkey のメニュー（ツールバーのアイコン → このスクリプトの項目）から、
 *   現在のページのタイトルと URL を次のいずれかの形式でクリップボードにコピーする。
 *     - テキストリンク:         <タイトル>\n<URL>
 *     - Markdown リンク:        [<タイトル>](<URL>)
 *     - リッチテキストリンク:   <a href="<URL>"><タイトル></a>（text/html）+ <URL>（text/plain）
 *   コピー後は alert で内容を表示する。
 *
 * 依存しているサイト内部の実装
 *   なし（document.title と location.href のみを使う）。
 *
 * 実装上の前提
 *   - Tampermonkey のメニューから実行されるため、ページがフォーカスを持っていない場合がある。
 *     テキストのコピーはフォーカスに依存しない GM_setClipboard を使う。
 *     リッチテキストは text/html と text/plain を同時に書き込むため navigator.clipboard.write を試し、
 *     失敗した場合は GM_setClipboard(html, "html") にフォールバックする。
 */

(function () {
  "use strict";

  const getPageInfo = () => {
    const url = location.href;
    const title = document.title.trim() || url;
    return { title, url };
  };

  const escapeHtml = (s) =>
    s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");

  // テキストをクリップボードにコピーして通知する
  const copyText = (text, label) => {
    try {
      GM_setClipboard(text, "text");
      alert(`${label}をクリップボードにコピーしました:\n${text}`);
    } catch (err) {
      console.error("クリップボードへのコピーに失敗しました:", err);
      prompt(`${label}（手動でコピーしてください）`, text);
    }
  };

  // リッチテキスト（text/html + text/plain）をクリップボードにコピーして通知する
  const copyRichText = async (html, plain, label, summary) => {
    try {
      window.focus();
      const item = new ClipboardItem({
        "text/html": new Blob([html], { type: "text/html" }),
        "text/plain": new Blob([plain], { type: "text/plain" }),
      });
      await navigator.clipboard.write([item]);
    } catch (err) {
      console.warn(
        "navigator.clipboard.write に失敗したため GM_setClipboard にフォールバックします:",
        err,
      );
      try {
        GM_setClipboard(html, "html");
      } catch (err2) {
        console.error("クリップボードへのコピーに失敗しました:", err2);
        prompt(`${label}（手動でコピーしてください）`, plain);
        return;
      }
    }
    alert(`${label}をクリップボードにコピーしました:\n${summary}`);
  };

  const copyTextLink = () => {
    const { title, url } = getPageInfo();
    copyText(`${title}\n${url}`, "テキストリンク");
  };

  const copyMarkdownLink = () => {
    const { title, url } = getPageInfo();
    copyText(`[${title}](${url})`, "Markdown リンク");
  };

  const copyRichTextLink = () => {
    const { title, url } = getPageInfo();
    const html = `<a href="${escapeHtml(url)}">${escapeHtml(title)}</a>`;
    copyRichText(html, url, "リッチテキストリンク", `${title}\n→ ${url}`);
  };

  GM_registerMenuCommand("テキストリンクをコピー", copyTextLink);
  GM_registerMenuCommand("Markdown リンクをコピー", copyMarkdownLink);
  GM_registerMenuCommand("リッチテキストリンクをコピー", copyRichTextLink);
})();
