// ==UserScript==
// @name            X - Export / Import
// @name:ja         X - エクスポート / インポート
// @namespace       https://github.com/ishioka0222/userscript
// @version         1.0.0
// @description     Exports following/followers/list members on X (Twitter) as TSV, and bulk-adds users to a list.
// @description:ja  X（旧Twitter）でフォロー/フォロワー/リストメンバーの一覧をTSVでエクスポートし、ユーザーをリストへ一括追加（インポート）します。
// @author          Hiroki Ishioka
// @license         MIT
// @homepageURL     https://github.com/ishioka0222/userscript/tree/master/scripts/x-export-import
// @supportURL      https://github.com/ishioka0222/userscript/issues
// @updateURL       https://raw.githubusercontent.com/ishioka0222/userscript/master/scripts/x-export-import/x-export-import.user.js
// @downloadURL     https://raw.githubusercontent.com/ishioka0222/userscript/master/scripts/x-export-import/x-export-import.user.js
// @match           https://x.com/*
// @match           https://twitter.com/*
// @icon            https://www.google.com/s2/favicons?sz=64&domain=x.com
// @run-at          document-idle
// @noframes
// @grant           GM_setClipboard
// @grant           GM_setValue
// @grant           GM_getValue
// @grant           unsafeWindow
// ==/UserScript==

/*
 * 機能
 *   [エクスポート] /<sn>/following などのユーザー一覧ページ、または /i/lists/<id>/members で「取得開始」
 *                  → 自動スクロールしてユーザーセルを収集 → TSV ダウンロード / スクリーンネームをクリップボードへ
 *                  → 取得結果はスクリプトのストレージ（GM_setValue）にも保存される
 *                    （別アカウントでログインし直した後でも「前回の取得結果を読み込む」で呼び出せる）
 *   [インポート]   リスト ID とユーザー一覧（1 行 1 ユーザー）を入力して「開始」
 *                  → 2〜5 秒間隔で 1 件ずつリストへ追加。進捗はストレージに保存され、
 *                    中断・日次上限到達後も「再開」で続きから実行できる
 *
 * 運用上の注意（実績ベース）
 *   - 追加の 1 日上限は約 100 件。403 が 5 連続したら上限到達とみなして自動中断し、
 *     直近 5 件を未処理に戻す → 翌日「再開」
 *   - 散発的な 403 は鍵アカウント（追加不可）
 *   - authorization の Bearer は X の Web アプリ共通の公開トークン（秘密情報ではない）
 *
 * 依存しているサイト内部の実装
 *   [DOM]（エクスポート）
 *     - ユーザーセル: [data-testid="UserCell"]
 *     - スクリーンネーム: セル内の最初の a[href^="/"] の href（先頭の "/" を除いた、"/" を含まないもの）
 *     - 表示名: セルの innerText の 1 行目
 *     - リストメンバー一覧は [role="dialog"] 内に表示され、その配下の
 *       overflow-y が auto|scroll かつ scrollHeight > clientHeight + 100 の最初の div をスクロールする
 *       （following 等のページはダイアログが無いので window をスクロールする）
 *   [URL パターン]
 *     - /i/lists/<数字>/members
 *     - /<sn>/(following|followers|verified_followers|followers_you_follow)
 *   [非公式 API]（インポート）
 *     - POST {origin}/i/api/1.1/lists/members/create.json
 *       body: list_id=<id>&screen_name=<sn>（application/x-www-form-urlencoded）
 *       headers: authorization: Bearer <公開トークン>, x-csrf-token: Cookie "ct0" の値
 *       credentials: include（ログイン Cookie を送る）
 *     - ステータス: 200 成功 / 403 日次上限または鍵アカウント / 429 レート制限
 *   これらが変更されると、このスクリプトは動作しなくなる。
 *
 * 実装上の前提
 *   - x.com の CSP / Trusted Types の影響を受けないよう、UI は innerHTML や <style> を使わず
 *     createElement + CSSOM（el.style）で構築している。innerHTML / GM_addStyle への書き換えは避けること。
 *   - fetch はページ側（unsafeWindow.fetch）を使う。
 */

(() => {
  "use strict";

  const W = typeof unsafeWindow !== "undefined" ? unsafeWindow : window;
  const BEARER =
    "AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA";
  const KEY_LIST_ID = "listId";
  const KEY_QUEUE = "addQueue";
  const KEY_LAST_COLLECT = "lastCollect";
  const BOM = String.fromCharCode(0xfeff); // Excel向けUTF-8 BOM

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const today = () => new Date().toISOString().slice(0, 10);
  const state = {
    collecting: false,
    adding: false,
    stop: false,
    lastUsers: [],
  };

  // ---------- ページ判定 ----------
  function pageContext() {
    const p = location.pathname;
    let m;
    if ((m = p.match(/^\/i\/lists\/(\d+)\/members/))) {
      return {
        listId: m[1],
        label: `リスト ${m[1]} のメンバー一覧`,
        file: `x-list-${m[1]}-members_${today()}.tsv`,
      };
    }
    if ((m = p.match(/^\/i\/lists\/(\d+)/))) {
      return {
        listId: m[1],
        label: `リスト ${m[1]}（メンバー一覧を取るには /members を開く）`,
        file: `x-list-${m[1]}_${today()}.tsv`,
      };
    }
    if (
      (m = p.match(
        /^\/([A-Za-z0-9_]{1,15})\/(following|followers|verified_followers|followers_you_follow)\b/,
      ))
    ) {
      return {
        label: `@${m[1]} の ${m[2]}`,
        file: `x-${m[1]}-${m[2]}_${today()}.tsv`,
      };
    }
    return {
      label: "このページ内のユーザーセルを取得（汎用）",
      file: `x-users_${today()}.tsv`,
    };
  }

  // ---------- エクスポート（一覧取得） ----------
  async function collectUsers(waitMs, onProgress, root) {
    // ダイアログがあればその中だけを対象にする（なければページ全体）
    const dialog = document.querySelector('[role="dialog"]') || document.body;
    // スクロール可能な要素を探す（自分のパネルは除外）
    const scroller = [...dialog.querySelectorAll("div")].find(
      (e) =>
        !root.contains(e) &&
        e.scrollHeight > e.clientHeight + 100 &&
        ["auto", "scroll"].includes(W.getComputedStyle(e).overflowY),
    );
    const users = new Map();
    const harvest = () => {
      dialog.querySelectorAll('[data-testid="UserCell"]').forEach((cell) => {
        const link = cell.querySelector('a[href^="/"]');
        if (!link) return;
        const sn = link.getAttribute("href").slice(1);
        if (sn && !sn.includes("/"))
          users.set(sn, (cell.innerText.split("\n")[0] || "").trim());
      });
    };
    let idle = 0,
      last = 0;
    while (idle < 6 && !state.stop) {
      // 6回連続で増えなければ終了
      harvest();
      if (scroller) scroller.scrollTop += scroller.clientHeight * 2;
      else W.scrollBy(0, W.innerHeight * 2);
      onProgress(users.size, !!scroller);
      await sleep(waitMs);
      if (users.size === last) idle++;
      else {
        idle = 0;
        last = users.size;
      }
    }
    harvest();
    return { users: [...users], scroller: !!scroller };
  }

  // ---------- インポート（リストに追加） ----------
  function parseUsers(text) {
    const out = [];
    const seen = new Set();
    for (const raw of text.replace(BOM, "").split(/\r?\n/)) {
      const line = raw.trim();
      if (!line) continue;
      const first = line.split(/[\t ,]/)[0];
      if (first === "screen_name") continue; // TSVヘッダ行
      const m = first.match(
        /^(?:https?:\/\/(?:x|twitter)\.com\/)?@?([A-Za-z0-9_]{1,15})$/,
      );
      if (!m) continue;
      const sn = m[1];
      if (seen.has(sn)) continue;
      seen.add(sn);
      out.push(sn);
    }
    return out;
  }
  const loadQueue = () => GM_getValue(KEY_QUEUE, null);
  const saveQueue = (q) => GM_setValue(KEY_QUEUE, q);

  async function addMembers(q, log, onProgress) {
    const ct0 = document.cookie.match(/ct0=([^;]+)/)?.[1];
    if (!ct0) {
      log("ct0クッキーが見つかりません。ログインした状態で実行してください。");
      return;
    }
    const headers = {
      authorization: "Bearer " + BEARER,
      "x-csrf-token": ct0,
      "content-type": "application/x-www-form-urlencoded",
    };
    const url = `${location.origin}/i/api/1.1/lists/members/create.json`;
    let consecutive403 = 0;
    const total = () => q.ok.length + q.fail.length + q.pending.length;
    while (q.pending.length && !state.stop) {
      const sn = q.pending[0];
      let status;
      try {
        const r = await W.fetch(url, {
          method: "POST",
          credentials: "include",
          headers,
          body:
            "list_id=" + q.listId + "&screen_name=" + encodeURIComponent(sn),
        });
        status = r.status;
      } catch {
        status = "error";
      }
      q.pending.shift();
      log(`${q.ok.length + q.fail.length + 1}/${total()} ${sn} -> ${status}`);
      if (status === 200) {
        q.ok.push(sn);
        consecutive403 = 0;
      } else {
        q.fail.push(`${sn} (${status})`);
        if (status === 403) {
          consecutive403++;
          if (consecutive403 >= 5) {
            // 直近5件の403は日次上限によるものと考えられるので未処理に戻す
            const back = q.fail
              .splice(-5)
              .map((s) => s.replace(/ \(403\)$/, ""));
            q.pending.unshift(...back);
            saveQueue(q);
            log(
              "403が5連続 -> 日次上限とみなして中断します。直近5件は未処理に戻しました。翌日「再開」で続きから実行してください。",
            );
            break;
          }
        } else consecutive403 = 0;
        if (status === 429) {
          saveQueue(q);
          log(
            "レート制限(429) -> 中断します。時間をおいて「再開」してください。",
          );
          break;
        }
      }
      saveQueue(q);
      onProgress(q);
      if (q.pending.length) await sleep(2000 + Math.random() * 3000); // 2〜5秒のランダム間隔
    }
    log(
      `=== 成功 ${q.ok.length} / 失敗 ${q.fail.length} / 未処理 ${q.pending.length} ===`,
    );
    if (q.fail.length) log("FAIL:\n" + q.fail.join("\n"));
    if (q.pending.length)
      log(`未処理 ${q.pending.length}件はストレージに保存済み（次回「再開」）`);
  }

  // ---------- UI ----------
  // ※ CSP/Trusted Types の影響を受けないよう、innerHTML や <style> は使わず CSSOM で直接スタイルを当てる
  const C = {
    bg: "#15202b",
    border: "#38444d",
    fg: "#e7e9ea",
    sub: "#8b98a5",
    accent: "#1d9bf0",
    danger: "#f4212e",
    gray: "#536471",
    field: "#0f1419",
  };
  const el = (tag, style = {}, props = {}) => {
    const e = document.createElement(tag);
    Object.assign(e.style, style);
    Object.assign(e, props);
    return e;
  };
  const fieldStyle = {
    width: "100%",
    boxSizing: "border-box",
    background: C.field,
    color: C.fg,
    border: `1px solid ${C.border}`,
    borderRadius: "6px",
    padding: "6px",
    fontSize: "12px",
    fontFamily: "inherit",
  };
  const btn = (label, onClick, color = C.accent) =>
    el(
      "button",
      {
        background: color,
        color: "#fff",
        border: "none",
        borderRadius: "9999px",
        padding: "6px 12px",
        cursor: "pointer",
        fontWeight: "bold",
        fontSize: "12px",
        marginRight: "6px",
        marginTop: "6px",
      },
      { textContent: label, onclick: onClick },
    );
  const row = (...children) => {
    const d = el("div", { marginTop: "4px" });
    children.forEach((c) => d.appendChild(c));
    return d;
  };
  const text = (s, style = {}) =>
    el(
      "div",
      {
        color: C.sub,
        marginTop: "6px",
        whiteSpace: "pre-wrap",
        wordBreak: "break-all",
        ...style,
      },
      { textContent: s },
    );
  const textarea = (rows, ro = false) =>
    el(
      "textarea",
      { ...fieldStyle, marginTop: "6px", resize: "vertical" },
      { rows, readOnly: ro, spellcheck: false },
    );
  const download = (filename, body) => {
    const blob = new Blob([BOM + body], {
      type: "text/tab-separated-values;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = el("a", {}, { href: url, download: filename });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  };

  const root = el("div", {
    position: "fixed",
    right: "16px",
    bottom: "16px",
    zIndex: 2147483647,
    fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
    fontSize: "13px",
    color: C.fg,
    lineHeight: "1.4",
  });
  const panel = el("div", {
    display: "none",
    position: "fixed",
    right: "16px",
    bottom: "56px",
    width: "400px",
    maxHeight: "80vh",
    overflowY: "auto",
    background: C.bg,
    border: `1px solid ${C.border}`,
    borderRadius: "12px",
    padding: "12px",
    boxShadow: "0 4px 16px rgba(0,0,0,.5)",
  });
  const toggle = btn("X Export / Import", () => {
    const open = panel.style.display === "none";
    panel.style.display = open ? "block" : "none";
    if (open) {
      refreshContext();
      refreshAddPanel();
    }
  });
  toggle.style.boxShadow = "0 2px 8px rgba(0,0,0,.4)";
  toggle.style.margin = "0";
  root.append(panel, toggle);

  // タブ
  const tabBar = el("div", {
    display: "flex",
    gap: "6px",
    borderBottom: `1px solid ${C.border}`,
    paddingBottom: "6px",
  });
  const secCollect = el("div");
  const secAdd = el("div", { display: "none" });
  const mkTab = (label, sec) =>
    el(
      "button",
      {
        background: "transparent",
        color: C.fg,
        border: "none",
        cursor: "pointer",
        fontWeight: "bold",
        padding: "4px 8px",
        borderRadius: "6px",
      },
      {
        textContent: label,
        onclick: () => {
          [secCollect, secAdd].forEach((s) => {
            s.style.display = s === sec ? "block" : "none";
          });
          [tabCollect, tabAdd].forEach((t) => {
            t.style.background = "transparent";
          });
          (sec === secCollect ? tabCollect : tabAdd).style.background =
            C.border;
          if (sec === secAdd) refreshAddPanel();
        },
      },
    );
  const tabCollect = mkTab("エクスポート（一覧取得）", secCollect);
  const tabAdd = mkTab("インポート（リストに追加）", secAdd);
  tabCollect.style.background = C.border;
  tabBar.append(tabCollect, tabAdd);
  panel.append(tabBar, secCollect, secAdd);

  // --- エクスポートセクション ---
  const ctxLine = text("");
  const waitInput = el(
    "input",
    { ...fieldStyle, width: "80px", marginLeft: "6px" },
    { type: "number", value: "800", min: "200", step: "100" },
  );
  const waitRow = row(
    el(
      "span",
      { color: C.sub },
      { textContent: "読み込み待ち(ms)・取りこぼすなら1500程度に:" },
    ),
    waitInput,
  );
  const collectStatus = text("");
  const collectOut = textarea(8, true);
  collectOut.placeholder = "screen_name<TAB>name の一覧がここに出ます";
  const collectBtn = btn("取得開始", async () => {
    if (state.collecting) {
      state.stop = true;
      return;
    }
    state.collecting = true;
    state.stop = false;
    collectBtn.textContent = "中断";
    collectBtn.style.background = C.danger;
    collectOut.value = "";
    const ctx = pageContext();
    try {
      const res = await collectUsers(
        Number(waitInput.value) || 800,
        (n, sc) => {
          collectStatus.textContent = `取得中… ${n}人（scroller: ${sc ? "検出" : "未検出→ページ全体をスクロール"}）`;
        },
        root,
      );
      state.lastUsers = res.users;
      collectOut.value = res.users
        .map(([sn, name]) => `${sn}\t${name}`)
        .join("\n");
      collectStatus.textContent = `${state.stop ? "中断" : "完了"}: ${res.users.length}人（scroller: ${res.scroller ? "検出" : "未検出"}）。TSVダウンロード / コピー が使えます。`;
      GM_setValue(KEY_LAST_COLLECT, {
        date: today(),
        label: ctx.label,
        file: ctx.file,
        users: res.users,
      });
    } catch (e) {
      collectStatus.textContent = "エラー: " + e;
    } finally {
      state.collecting = false;
      state.stop = false;
      collectBtn.textContent = "取得開始";
      collectBtn.style.background = C.accent;
    }
  });
  const dlBtn = btn(
    "TSVダウンロード",
    () => {
      if (!state.lastUsers.length) {
        collectStatus.textContent = "先に取得してください。";
        return;
      }
      const body =
        "screen_name\tname\n" +
        state.lastUsers.map(([sn, name]) => `${sn}\t${name}`).join("\n") +
        "\n";
      download(pageContext().file, body);
    },
    C.gray,
  );
  const cpBtn = btn(
    "スクリーンネームをコピー",
    () => {
      if (!state.lastUsers.length) {
        collectStatus.textContent = "先に取得してください。";
        return;
      }
      GM_setClipboard(state.lastUsers.map(([sn]) => sn).join("\n"), "text");
      collectStatus.textContent = `${state.lastUsers.length}件のスクリーンネームをコピーしました。`;
    },
    C.gray,
  );
  secCollect.append(
    ctxLine,
    waitRow,
    row(collectBtn, dlBtn, cpBtn),
    collectStatus,
    collectOut,
  );

  // --- インポートセクション ---
  const listIdInput = el(
    "input",
    { ...fieldStyle, marginTop: "4px" },
    { type: "text", placeholder: "リストID（URLの /i/lists/<ここ> の数字）" },
  );
  listIdInput.onchange = () =>
    GM_setValue(KEY_LIST_ID, listIdInput.value.trim());
  const usersInput = textarea(8);
  usersInput.placeholder =
    "追加するユーザー（1行1件。@付き・URL・TSVの1列目でも可）";
  const addStatus = text("");
  const addLog = textarea(10, true);
  const log = (s) => {
    addLog.value += s + "\n";
    addLog.scrollTop = addLog.scrollHeight;
  };
  const loadLastBtn = btn(
    "前回の取得結果を読み込む",
    () => {
      const last = GM_getValue(KEY_LAST_COLLECT, null);
      if (!last || !last.users?.length) {
        addStatus.textContent = "保存された取得結果がありません。";
        return;
      }
      usersInput.value = last.users.map(([sn]) => sn).join("\n");
      addStatus.textContent = `${last.date} 取得「${last.label}」${last.users.length}件を読み込みました。`;
    },
    C.gray,
  );
  const resumeBox = el("div", {
    display: "none",
    border: `1px solid ${C.accent}`,
    borderRadius: "8px",
    padding: "8px",
    marginTop: "8px",
  });
  const resumeText = text("", { marginTop: "0" });
  const resumeBtn = btn("再開", () => startAdd(loadQueue()));
  const discardBtn = btn(
    "破棄",
    () => {
      GM_setValue(KEY_QUEUE, null);
      refreshAddPanel();
      addStatus.textContent = "未処理キューを破棄しました。";
    },
    C.gray,
  );
  resumeBox.append(resumeText, row(resumeBtn, discardBtn));
  const addBtn = btn("開始", () => {
    if (state.adding) {
      state.stop = true;
      return;
    }
    const listId = listIdInput.value.trim();
    if (!/^\d+$/.test(listId)) {
      addStatus.textContent = "リストIDを数字で入力してください。";
      return;
    }
    const users = parseUsers(usersInput.value);
    if (!users.length) {
      addStatus.textContent = "ユーザーが1件も読み取れませんでした。";
      return;
    }
    GM_setValue(KEY_LIST_ID, listId);
    const q = { listId, date: today(), pending: users, ok: [], fail: [] };
    saveQueue(q);
    startAdd(q);
  });
  async function startAdd(q) {
    if (!q || state.adding) return;
    state.adding = true;
    state.stop = false;
    addBtn.textContent = "中断";
    addBtn.style.background = C.danger;
    resumeBox.style.display = "none";
    addLog.value = "";
    log(
      `リスト ${q.listId} に ${q.pending.length}件を追加します（成功済み ${q.ok.length} / 失敗済み ${q.fail.length}）`,
    );
    const prog = (qq) => {
      addStatus.textContent = `進行中: 成功 ${qq.ok.length} / 失敗 ${qq.fail.length} / 未処理 ${qq.pending.length}`;
    };
    prog(q);
    try {
      await addMembers(q, log, prog);
    } catch (e) {
      log("エラー: " + e);
    } finally {
      state.adding = false;
      state.stop = false;
      addBtn.textContent = "開始";
      addBtn.style.background = C.accent;
      addStatus.textContent = `終了: 成功 ${q.ok.length} / 失敗 ${q.fail.length} / 未処理 ${q.pending.length}`;
      refreshAddPanel();
    }
  }
  function refreshAddPanel() {
    const ctx = pageContext();
    if (!listIdInput.value)
      listIdInput.value = ctx.listId || GM_getValue(KEY_LIST_ID, "");
    const q = loadQueue();
    if (q && q.pending?.length && !state.adding) {
      resumeText.textContent = `未処理キューあり: ${q.date} 開始 / リスト ${q.listId} / 未処理 ${q.pending.length}件（成功 ${q.ok.length} / 失敗 ${q.fail.length}）`;
      resumeBox.style.display = "block";
    } else resumeBox.style.display = "none";
  }
  secAdd.append(
    text("リストID（リスト所有アカウントでログインしていること）", {
      marginTop: "8px",
    }),
    listIdInput,
    usersInput,
    row(loadLastBtn, addBtn),
    resumeBox,
    addStatus,
    addLog,
  );

  // --- コンテキスト更新（SPAなのでURL変化を監視） ---
  function refreshContext() {
    ctxLine.textContent = "対象: " + pageContext().label;
  }
  let lastHref = "";
  setInterval(() => {
    if (!document.body.contains(root)) document.body.appendChild(root);
    if (location.href !== lastHref) {
      lastHref = location.href;
      refreshContext();
      if (secAdd.style.display !== "none") refreshAddPanel();
    }
  }, 1000);
  document.body.appendChild(root);
  refreshContext();
})();
