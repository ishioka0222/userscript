// ==UserScript==
// @name            Save Page as Markdown
// @name:ja         ページを Markdown で保存
// @namespace       https://github.com/ishioka0222/userscript
// @version         1.0.0
// @description     Converts the main content (or a picked element) of the current page to Markdown and downloads it as a .md file. Conversion runs locally with pinned, hash-verified libraries.
// @description:ja  表示中のページの本文（または選んだ要素）を Markdown に変換して .md ファイルとしてダウンロードします。変換はローカルで行われ、ライブラリはバージョン固定 + ハッシュ検証付きで取り込みます。
// @author          Hiroki Ishioka
// @license         MIT
// @homepageURL     https://github.com/ishioka0222/userscript/tree/master/scripts/save-page-as-markdown
// @supportURL      https://github.com/ishioka0222/userscript/issues
// @updateURL       https://raw.githubusercontent.com/ishioka0222/userscript/master/scripts/save-page-as-markdown/save-page-as-markdown.user.js
// @downloadURL     https://raw.githubusercontent.com/ishioka0222/userscript/master/scripts/save-page-as-markdown/save-page-as-markdown.user.js
// @match           *://*/*
// @run-at          document-idle
// @noframes
// @require         https://cdn.jsdelivr.net/npm/turndown@7.2.4/dist/turndown.js#sha256=c97187f436d41638bf7acf346a39d9d42f2f2c02af18245a297c09e796f8e46f
// @require         https://cdn.jsdelivr.net/npm/turndown-plugin-gfm@1.0.2/dist/turndown-plugin-gfm.js#sha256=cf744cc1b7580f06d64ce236a4ff2630a53d389eccf2133a09d71ca443511912
// @grant           GM_registerMenuCommand
// ==/UserScript==

/*
 * 機能
 *   Tampermonkey のメニュー（ツールバーのアイコン → このスクリプトの項目）から、
 *   表示中のページを Markdown に変換して .md ファイルとしてダウンロードする。
 *     - 本文を Markdown でダウンロード:
 *         main / article / [role="main"] などの定番セレクタで本文を自動判定して変換する。
 *         見つからない場合は body 全体を対象にし、nav / header / footer / aside / form を除外する。
 *     - 要素を選んで Markdown でダウンロード:
 *         ピッカーモードになり、マウスオーバーでハイライトされた要素をクリックすると
 *         その要素以下だけを変換する（Esc でキャンセル）。
 *   出力の先頭には YAML フロントマター（title / source / saved）を付ける。
 *
 * 外部ライブラリ（@require）
 *   - turndown（HTML → Markdown 変換）と turndown-plugin-gfm（テーブル・打ち消し線など GFM 対応）。
 *   - @require はインストール時に一度だけ取得されて Tampermonkey にキャッシュされる
 *     （ページ閲覧時に外部通信は発生しない）。
 *   - URL はバージョン固定 + SHA-256 ハッシュ付きで、改ざん・差し替えを検知できる。
 *
 * 依存しているサイト内部の実装
 *   なし（ページの DOM・document.title・location.href のみを使う）。
 *
 * 実装上の前提
 *   - ページの CSS や CSP の影響を受けないよう、UI（トースト・案内バー）は Shadow DOM の中に
 *     createElement + CSSOM（el.style）で構築し、alert / prompt は使わない。
 *   - 変換は要素を cloneNode してから行い、ページの DOM は変更しない。
 *     script / style / noscript / template / iframe / canvas は常に除外する。
 *   - ダウンロードは Blob + a[download] で行う（CSP の sandbox でダウンロードが
 *     禁止されているページでは保存できないことがある）。
 */

/* global TurndownService, turndownPluginGfm */

(function () {
  "use strict";

  // 本文の自動判定に使うセレクタ（先勝ち。テキストが少なすぎる要素はスキップ）
  const MAIN_SELECTORS = [
    "main",
    "article",
    '[role="main"]',
    "#main-content",
    "#content",
  ];
  const MIN_MAIN_TEXT_LENGTH = 50;

  // 常に除外する要素と、body 全体を対象にしたときに追加で除外する要素
  const REMOVE_ALWAYS = "script, style, noscript, template, iframe, canvas";
  const REMOVE_PAGE_CHROME = "nav, header, footer, aside, form";

  const FONT =
    'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

  const el = (tag, style = {}, props = {}) => {
    const e = document.createElement(tag);
    Object.assign(e.style, style);
    Object.assign(e, props);
    return e;
  };

  // ---------- 通知・案内（Shadow DOM） ----------

  const host = el("div", {
    position: "fixed",
    inset: "0",
    zIndex: "2147483647",
    pointerEvents: "none",
  });
  const shadow = host.attachShadow({ mode: "open" });
  document.documentElement.appendChild(host);

  const toastEl = el("div", {
    position: "fixed",
    top: "48px",
    left: "50%",
    transform: "translateX(-50%)",
    maxWidth: "80vw",
    padding: "8px 14px",
    borderRadius: "6px",
    background: "#323232",
    color: "#fff",
    fontFamily: FONT,
    fontSize: "13px",
    lineHeight: "1.4",
    boxShadow: "0 2px 8px rgba(0,0,0,.4)",
    whiteSpace: "pre-wrap",
    wordBreak: "break-all",
    display: "none",
    pointerEvents: "none",
  });
  const barEl = el(
    "div",
    {
      position: "fixed",
      top: "8px",
      left: "50%",
      transform: "translateX(-50%)",
      padding: "6px 14px",
      borderRadius: "9999px",
      background: "#1976d2",
      color: "#fff",
      fontFamily: FONT,
      fontSize: "13px",
      fontWeight: "bold",
      boxShadow: "0 2px 8px rgba(0,0,0,.4)",
      display: "none",
      pointerEvents: "none",
    },
    {
      textContent:
        "Markdown 化する要素をクリックしてください（Esc でキャンセル）",
    },
  );
  shadow.append(toastEl, barEl);

  let toastTimer = null;
  const notify = (message, isError = false) => {
    toastEl.textContent = message;
    toastEl.style.background = isError ? "#c62828" : "#323232";
    toastEl.style.display = "block";
    clearTimeout(toastTimer);
    toastTimer = setTimeout(
      () => {
        toastEl.style.display = "none";
      },
      isError ? 6000 : 4000,
    );
  };

  // ---------- 変換 ----------

  const buildTurndown = () => {
    const turndown = new TurndownService({
      headingStyle: "atx",
      codeBlockStyle: "fenced",
      bulletListMarker: "-",
      hr: "---",
    });
    turndown.use(turndownPluginGfm.gfm);
    return turndown;
  };

  // 変換対象を複製し、不要な要素を取り除く（ページの DOM は変更しない）
  const cleanClone = (element, removePageChrome) => {
    const clone = element.cloneNode(true);
    clone.querySelectorAll(REMOVE_ALWAYS).forEach((e) => e.remove());
    if (removePageChrome) {
      clone.querySelectorAll(REMOVE_PAGE_CHROME).forEach((e) => e.remove());
    }
    return clone;
  };

  const today = () => {
    const now = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  };

  const frontMatter = () => {
    const title = document.title.replace(/"/g, '\\"');
    return `---\ntitle: "${title}"\nsource: ${location.href}\nsaved: ${today()}\n---\n\n`;
  };

  const sanitizeFileName = (s) =>
    s
      .replace(/[\\/:*?"<>|]/g, "_")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 100) || "page";

  const download = (markdown) => {
    const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = el(
      "a",
      {},
      {
        href: url,
        download: `${sanitizeFileName(document.title)}_${today()}.md`,
      },
    );
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  };

  const saveElement = (element, removePageChrome) => {
    let markdown;
    try {
      markdown = buildTurndown().turndown(
        cleanClone(element, removePageChrome),
      );
    } catch (err) {
      console.error("[Save Page as Markdown] 変換に失敗しました:", err);
      notify(`変換に失敗しました: ${err}`, true);
      return;
    }
    if (!markdown.trim()) {
      notify("変換結果が空でした。対象の要素を確認してください。", true);
      return;
    }
    download(frontMatter() + markdown + "\n");
    notify(
      `Markdown をダウンロードしました（${markdown.length.toLocaleString()} 文字）`,
    );
  };

  // ---------- 本文の自動判定 ----------

  const findMainElement = () => {
    for (const selector of MAIN_SELECTORS) {
      const element = document.querySelector(selector);
      if (element && element.innerText.trim().length >= MIN_MAIN_TEXT_LENGTH) {
        return { element, removePageChrome: false };
      }
    }
    // 見つからなければ body 全体（ナビゲーションなどを除外して変換する）
    return { element: document.body, removePageChrome: true };
  };

  // ---------- 要素ピッカー ----------

  let picking = null; // { hoverEl, prevOutline, prevOutlineOffset }

  const restoreHover = () => {
    if (picking && picking.hoverEl) {
      picking.hoverEl.style.outline = picking.prevOutline;
      picking.hoverEl.style.outlineOffset = picking.prevOutlineOffset;
      picking.hoverEl = null;
    }
  };

  const setHover = (element) => {
    restoreHover();
    picking.hoverEl = element;
    picking.prevOutline = element.style.outline;
    picking.prevOutlineOffset = element.style.outlineOffset;
    element.style.outline = "2px solid #1976d2";
    element.style.outlineOffset = "-2px";
  };

  const onPickerMove = (e) => {
    const target = e.target;
    if (!picking || target === picking.hoverEl || target === host) return;
    setHover(target);
  };

  const onPickerClick = (e) => {
    if (!picking) return;
    e.preventDefault();
    e.stopPropagation();
    const element = picking.hoverEl || e.target;
    stopPicker();
    saveElement(element, false);
  };

  const onPickerKey = (e) => {
    if (!picking || e.key !== "Escape") return;
    e.preventDefault();
    e.stopPropagation();
    stopPicker();
    notify("キャンセルしました。");
  };

  const startPicker = () => {
    if (picking) return;
    picking = { hoverEl: null, prevOutline: "", prevOutlineOffset: "" };
    barEl.style.display = "block";
    document.addEventListener("mousemove", onPickerMove, true);
    document.addEventListener("click", onPickerClick, true);
    document.addEventListener("keydown", onPickerKey, true);
  };

  const stopPicker = () => {
    restoreHover();
    barEl.style.display = "none";
    document.removeEventListener("mousemove", onPickerMove, true);
    document.removeEventListener("click", onPickerClick, true);
    document.removeEventListener("keydown", onPickerKey, true);
    picking = null;
  };

  // ---------- メニュー ----------

  GM_registerMenuCommand("本文を Markdown でダウンロード", () => {
    const { element, removePageChrome } = findMainElement();
    saveElement(element, removePageChrome);
  });
  GM_registerMenuCommand("要素を選んで Markdown でダウンロード", startPicker);
})();
