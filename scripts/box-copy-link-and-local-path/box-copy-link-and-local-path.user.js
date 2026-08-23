// ==UserScript==
// @name            Box - Copy Link and Local Path
// @name:ja         Box - リンクとローカルパスをコピー
// @namespace       https://github.com/ishioka0222/userscript
// @version         1.0.0
// @description     Adds Tampermonkey menu commands on Box that copy a shared link of the current file/folder as a Markdown / rich text link, or its local Box Drive path.
// @description:ja  Box で開いているファイル / フォルダの共有リンクを Markdown / リッチテキストのリンクとして、またはローカルの Box Drive のパスをクリップボードにコピーするメニューコマンドを Tampermonkey に追加します。
// @author          Hiroki Ishioka
// @license         MIT
// @homepageURL     https://github.com/ishioka0222/userscript/tree/master/scripts/box-copy-link-and-local-path
// @supportURL      https://github.com/ishioka0222/userscript/issues
// @updateURL       https://raw.githubusercontent.com/ishioka0222/userscript/master/scripts/box-copy-link-and-local-path/box-copy-link-and-local-path.user.js
// @downloadURL     https://raw.githubusercontent.com/ishioka0222/userscript/master/scripts/box-copy-link-and-local-path/box-copy-link-and-local-path.user.js
// @match           https://*.box.com/*
// @icon            https://www.google.com/s2/favicons?sz=64&domain=box.com
// @run-at          document-idle
// @noframes
// @grant           GM_registerMenuCommand
// @grant           GM_setClipboard
// @grant           GM_getValue
// @grant           GM_setValue
// ==/UserScript==

/*
 * 機能
 *   Tampermonkey のメニュー（ツールバーのアイコン → このスクリプトの項目）から、
 *   Box で開いているファイル（プレビュー）またはフォルダについて次をクリップボードにコピーする。
 *     - Markdown リンク:        [<ファイル名 or フォルダパス>](<共有リンク>)
 *     - リッチテキストリンク:   <a href="<共有リンク>"><ファイル名 or フォルダパス></a> + <共有リンク>（text/plain）
 *     - ローカルの Box パス:    <ローカルの Box フォルダ>\<フォルダ階層>[\<ファイル名>]
 *   共有リンクは Box の「共有」ボタンを押して表示される共有リンク入力欄から取得する。
 *   フォルダパス / ローカルパスはパンくずリストから組み立てる。
 *   コピー後は alert で内容を表示する。
 *
 * ローカルの Box フォルダ
 *   既定は %UserProfile%\Box\（Windows の Box Drive の既定）。
 *   メニューの「ローカルの Box フォルダを設定…」で変更でき、スクリプトのストレージに保存される。
 *
 * 依存しているサイト内部の実装（Box Web アプリ）
 *   [ファイル / フォルダの判定]
 *     - ファイルプレビュー: .preview-container（存在すればファイルとして扱う）
 *     - パンくずリスト:     .ItemListBreadcrumb
 *     - ファイル名:         .preview-container 内の h1[data-testid="preview-item-name"]
 *   [パンくずリスト → フォルダ階層]
 *     - 「その他のフォルダ」ボタン: button.FolderTreeButton（aria-expanded / aria-controls でメニューを参照）
 *     - 折りたたまれたフォルダ:     上記メニュー内の li > a
 *     - 表示中のリスト:             .ItemListBreadcrumb-list:not(.is-measurer)（.is-measurer は幅測定用の複製）
 *     - 階層のリンク:               .ItemListBreadcrumb-link
 *     - 現在のフォルダ名:           .ItemListBreadcrumb-currentItemTitle（バッジを含まないタイトル要素）
 *     - 先頭要素は「すべてのファイル」（言語設定で名称が変わる）なので除外する
 *   [共有リンク]
 *     - 共有ボタン:           [data-testid="one-click-share-button"]
 *                             （ファイルの場合は .preview-container 内に限定。フォルダ側のボタンも DOM に残るため）
 *     - 共有リンク入力欄:     input[value^="https://"][value*=".box.com/s/"]
 *                             （過去に開いたモーダルの input が残っている場合に備え、最後の要素を使う）
 *   これらが変更されると、このスクリプトは動作しなくなる。
 *
 * 実装上の前提
 *   - Tampermonkey のメニューから実行されるため、ページがフォーカスを持っていない場合がある。
 *     テキストのコピーはフォーカスに依存しない GM_setClipboard を使う。
 *     リッチテキストは text/html と text/plain を同時に書き込むため navigator.clipboard.write を試し、
 *     失敗した場合は GM_setClipboard(html, "html") にフォールバックする。
 *   - 共有ボタンを押して開いた共有リンクのポップアップは閉じない（Esc で閉じられる）。
 *   - ファイルを直接開いた場合（パンくずリストが無い場合）は、フォルダ階層を取得できないため
 *     ローカルパス / フォルダパスは組み立てられない。
 */

(function () {
  "use strict";

  const DEFAULT_LOCAL_BOX_ROOT = "%UserProfile%\\Box\\";
  const KEY_LOCAL_BOX_ROOT = "localBoxRoot";

  // 共有リンク入力欄が表示されるまでの待機
  const SHARE_LINK_MAX_TRY = 30;
  const SHARE_LINK_TRY_INTERVAL_MS = 100;
  // 「その他のフォルダ」メニューが開くまでの待機
  const FOLDER_TREE_MENU_WAIT_MS = 300;

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  const escapeHtml = (s) =>
    s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");

  // ---------- クリップボード ----------

  const copyText = (text, label) => {
    try {
      GM_setClipboard(text, "text");
      alert(`${label}をクリップボードにコピーしました:\n${text}`);
    } catch (err) {
      console.error("クリップボードへのコピーに失敗しました:", err);
      prompt(`${label}（手動でコピーしてください）`, text);
    }
  };

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

  // ---------- Box の画面からの情報取得 ----------

  // ファイルプレビューが開いていればファイル、フォルダ画面ならフォルダとして扱う
  const getContext = () => {
    const previewContainer = document.querySelector(".preview-container");
    const breadcrumb = document.querySelector(".ItemListBreadcrumb");
    return { previewContainer, breadcrumb, isFile: Boolean(previewContainer) };
  };

  const getFileName = (previewContainer) => {
    const el = previewContainer.querySelector(
      'h1[data-testid="preview-item-name"]',
    );
    return el ? el.textContent.trim() : null;
  };

  // パンくずリストからフォルダ階層（ルート「すべてのファイル」を除く）を取得する
  // 「その他のフォルダ」メニューが閉じていれば開いて読み取り、読み取り後に閉じる
  const getFolderParts = async (breadcrumb) => {
    const folderTreeButton = breadcrumb.querySelector(
      "button.FolderTreeButton",
    );
    let openedMenu = false;
    if (
      folderTreeButton &&
      folderTreeButton.getAttribute("aria-expanded") !== "true"
    ) {
      folderTreeButton.click();
      openedMenu = true;
      await sleep(FOLDER_TREE_MENU_WAIT_MS);
    }

    const parts = [];

    // 「その他のフォルダ」メニュー内の項目（折りたたまれた階層）
    if (folderTreeButton) {
      const menuId = folderTreeButton.getAttribute("aria-controls");
      const menu = menuId ? document.getElementById(menuId) : null;
      if (menu) {
        menu.querySelectorAll("li > a").forEach((a) => {
          const name = a.textContent.trim();
          if (name) parts.push(name);
        });
      }
    }

    // 表示中のパンくずリスト（幅測定用の複製 .is-measurer は除外）
    const list = breadcrumb.querySelector(
      ".ItemListBreadcrumb-list:not(.is-measurer)",
    );
    if (!list) {
      if (openedMenu) folderTreeButton.click();
      return null;
    }
    list.querySelectorAll(".ItemListBreadcrumb-link").forEach((link) => {
      const name = link.textContent.trim();
      if (name) parts.push(name);
    });
    // 現在のフォルダ名（バッジのテキストを除外するためタイトル要素から取得）
    const current = list.querySelector(".ItemListBreadcrumb-currentItemTitle");
    if (current) {
      const name = current.textContent.trim();
      if (name) parts.push(name);
    }

    if (openedMenu) folderTreeButton.click();

    // 先頭は「すべてのファイル」（言語設定による別名）なので除外する
    if (parts.length > 0) parts.shift();
    return parts;
  };

  // 共有ボタンを押して共有リンクを取得する
  const getSharedLink = async (shareButton) => {
    shareButton.click();
    for (let i = 0; i < SHARE_LINK_MAX_TRY; i++) {
      // 過去に開いた共有モーダルの input が DOM に残っている場合に備え、最後の要素を使う
      // （モーダルは後から DOM 末尾に追加されるため、最後が最新）
      const inputs = document.querySelectorAll(
        'input[value^="https://"][value*=".box.com/s/"]',
      );
      if (inputs.length) return inputs[inputs.length - 1].value;
      await sleep(SHARE_LINK_TRY_INTERVAL_MS);
    }
    return null;
  };

  // 共有リンクと、リンクテキスト（ファイル名 or フォルダパス）を取得する
  const getShareInfo = async () => {
    const { previewContainer, breadcrumb, isFile } = getContext();
    if (!isFile && !breadcrumb) {
      alert("Box のファイルまたはフォルダの画面で実行してください。");
      return null;
    }

    // ファイルの場合はプレビューコンテナ内に限定する
    // （フォルダからファイルを開いた場合、フォルダページ側の共有ボタンも DOM に残っているため）
    const shareButton = (isFile ? previewContainer : document).querySelector(
      '[data-testid="one-click-share-button"]',
    );
    if (!shareButton) {
      alert(
        "共有ボタンが見つかりません。共有リンクを作成できない項目の可能性があります。",
      );
      return null;
    }

    let linkText;
    if (isFile) {
      linkText = getFileName(previewContainer);
      if (!linkText) {
        alert("ファイル名の取得に失敗しました。");
        return null;
      }
    } else {
      const parts = await getFolderParts(breadcrumb);
      linkText = parts ? parts.join("/") : "";
      if (!linkText) {
        alert("フォルダパスの取得に失敗しました。");
        return null;
      }
    }

    const url = await getSharedLink(shareButton);
    if (!url) {
      alert("共有リンクの取得に失敗しました。");
      return null;
    }
    return { url, linkText };
  };

  // ---------- メニューコマンド ----------

  const copyMarkdownLink = async () => {
    const info = await getShareInfo();
    if (!info) return;
    copyText(`[${info.linkText}](${info.url})`, "Markdown リンク");
  };

  const copyRichTextLink = async () => {
    const info = await getShareInfo();
    if (!info) return;
    const html = `<a href="${escapeHtml(info.url)}">${escapeHtml(info.linkText)}</a>`;
    await copyRichText(
      html,
      info.url,
      "リッチテキストリンク",
      `${info.linkText}\n→ ${info.url}`,
    );
  };

  const copyLocalPath = async () => {
    const { previewContainer, breadcrumb, isFile } = getContext();
    // フォルダ階層はパンくずリストから取得するため、パンくずリストが無い場合は処理できない
    // （ファイルを直接開いた場合、プレビューのヘッダーには直近の親フォルダ名しかなく、
    //   フルパスを組み立てられない）
    if (!breadcrumb) {
      alert(
        isFile
          ? "ファイルを直接開いた場合はフォルダ階層を取得できません。\nフォルダからファイルを開いた状態で実行してください。"
          : "Box のファイルまたはフォルダの画面で実行してください。",
      );
      return;
    }

    let fileName = null;
    if (isFile) {
      fileName = getFileName(previewContainer);
      if (!fileName) {
        alert("ファイル名の取得に失敗しました。");
        return;
      }
    }

    const parts = await getFolderParts(breadcrumb);
    if (!parts) {
      alert("パンくずリストの取得に失敗しました。");
      return;
    }

    const root = GM_getValue(KEY_LOCAL_BOX_ROOT, DEFAULT_LOCAL_BOX_ROOT);
    const localPath =
      root + parts.join("\\") + (fileName ? `\\${fileName}` : "");
    copyText(localPath, "ローカルの Box パス");
  };

  const configureLocalBoxRoot = () => {
    const current = GM_getValue(KEY_LOCAL_BOX_ROOT, DEFAULT_LOCAL_BOX_ROOT);
    const input = prompt(
      `ローカルの Box フォルダのパスを入力してください（末尾の区切り文字を含む）。\n既定: ${DEFAULT_LOCAL_BOX_ROOT}`,
      current,
    );
    if (input === null) return;
    const value = input.trim();
    if (!value) {
      GM_setValue(KEY_LOCAL_BOX_ROOT, DEFAULT_LOCAL_BOX_ROOT);
      alert(
        `ローカルの Box フォルダを既定値に戻しました:\n${DEFAULT_LOCAL_BOX_ROOT}`,
      );
      return;
    }
    GM_setValue(KEY_LOCAL_BOX_ROOT, value);
    alert(`ローカルの Box フォルダを設定しました:\n${value}`);
  };

  GM_registerMenuCommand("Markdown リンクをコピー", copyMarkdownLink);
  GM_registerMenuCommand("リッチテキストリンクをコピー", copyRichTextLink);
  GM_registerMenuCommand("ローカルの Box パスをコピー", copyLocalPath);
  GM_registerMenuCommand(
    "ローカルの Box フォルダを設定…",
    configureLocalBoxRoot,
  );
})();
