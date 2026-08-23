// ==UserScript==
// @name            Show Environment Label
// @name:ja         環境ラベルを表示
// @namespace       https://github.com/ishioka0222/userscript
// @version         1.1.0
// @description     Shows a label (e.g. "Production" / "Development") on pages whose URL matches your rules, so you always know which environment you are looking at. Rules are stored locally; no network access.
// @description:ja  URL がルールに一致するページに「本番」「開発」などのラベルを常時表示し、今どの環境を操作しているかを分かるようにします。設定はローカルに保存され、外部通信は行いません。
// @author          Hiroki Ishioka
// @license         MIT
// @homepageURL     https://github.com/ishioka0222/userscript/tree/master/scripts/show-environment-label
// @supportURL      https://github.com/ishioka0222/userscript/issues
// @updateURL       https://raw.githubusercontent.com/ishioka0222/userscript/master/scripts/show-environment-label/show-environment-label.user.js
// @downloadURL     https://raw.githubusercontent.com/ishioka0222/userscript/master/scripts/show-environment-label/show-environment-label.user.js
// @match           *://*/*
// @run-at          document-end
// @noframes
// @grant           GM_getValue
// @grant           GM_setValue
// @grant           GM_addValueChangeListener
// @grant           GM_registerMenuCommand
// @grant           GM_setClipboard
// ==/UserScript==

/*
 * 機能
 *   - 現在の URL がルールに一致したら、画面の隅（または上端の帯）にラベルを常時表示する。
 *     ラベルごとに文字色 / 背景色 / 位置、タブタイトルへの接頭辞、画面の縁の色枠を設定できる。
 *   - services（URL のテンプレート）に一致するが、どの instances にも一致しない場合は
 *     「未登録」の注意ラベルを表示し、そこからルール（instance）を追加できる。
 *   - 設定は 1 つの JSON（Tampermonkey のメニュー「設定を開く」で編集）。
 *     JSON をコピー / 貼り付けすることで import / export になる。
 *   - 外部通信は一切行わない。設定はこのスクリプトのストレージ（GM_setValue）にのみ保存される。
 *
 * 設定 JSON の構造（詳細は README）
 *   {
 *     "defaults":      { "position": "top-right", "titlePrefix": true, "frame": false, "labelFormat": "{env} {name}" },
 *     "environments":  [ { "id": "prod", "name": "本番", "bg": "#...", "fg": "#...", "frame": true } ],
 *     "services":      [ { "name": "...", "pattern": "...", "instances": [ { "match": {...}, "name": "...", "env": "prod" } ] } ],
 *     "rules":         [ { "pattern": "...", "name": "...", "env": "...", "label": "...", "bg": "#...", "fg": "#...", "position": "...", "titlePrefix": true, "frame": false } ]
 *   }
 *   ラベル文言: label があればそれ。無ければ labelFormat の {env}（環境名）と {name} から組み立てる。
 *   スタイル（bg / fg / position / titlePrefix / frame）の優先順位: instance・rule → environment → defaults。
 *   pattern の記法
 *     - 簡易形: `*` は任意の文字列、`{name}` は `/` を含まない 1 区切り、`{name:正規表現}` は指定した正規表現。
 *               先頭から末尾まで URL 全体（location.href）と照合する。
 *     - 正規表現: `/.../` または `/.../i`。名前付きグループ (?<name>...) で値を捕捉する。
 *   評価順: services（先頭から）→ rules（先頭から）。最初に一致したものを採用する。
 *
 * 依存しているサイト内部の実装
 *   なし（location.href と document.title のみを使う）。
 *
 * 実装上の前提
 *   - ページの CSS や CSP の影響を受けないよう、UI は Shadow DOM の中に createElement + CSSOM（el.style）で構築する
 *     （<style> 要素や innerHTML は使わない）。
 *   - SPA での URL 変化に追従するため、location.href を 1 秒間隔で監視する。
 *   - ラベルの要素は document.documentElement 直下に置き、ページが body を差し替えても消えないようにする。
 */

(function () {
  "use strict";

  const STORAGE_KEY = "config";
  const SESSION_HIDDEN_KEY = "show-environment-label:hidden";
  const POLL_INTERVAL_MS = 1000;

  const POSITIONS = [
    "top-left",
    "top-right",
    "bottom-left",
    "bottom-right",
    "top-bar",
  ];

  const DEFAULT_CONFIG = {
    defaults: {
      position: "top-right",
      titlePrefix: true,
      frame: false,
      labelFormat: "{env} {name}",
    },
    environments: [],
    services: [],
    rules: [],
  };

  // 色の候補（「追加」フローで番号で選べるようにする）
  const PALETTE = [
    ["赤", "#d32f2f"],
    ["橙", "#ef6c00"],
    ["黄", "#fbc02d"],
    ["緑", "#388e3c"],
    ["青", "#1976d2"],
    ["紫", "#7b1fa2"],
    ["灰", "#616161"],
  ];

  // ---------- 設定の読み書き ----------

  const loadConfig = () => {
    const raw = GM_getValue(STORAGE_KEY, null);
    if (!raw) return structuredClone(DEFAULT_CONFIG);
    try {
      return normalizeConfig(JSON.parse(raw));
    } catch (err) {
      console.error(
        "[Show Environment Label] 設定の読み込みに失敗しました:",
        err,
      );
      return structuredClone(DEFAULT_CONFIG);
    }
  };

  const saveConfig = (config) => {
    GM_setValue(STORAGE_KEY, JSON.stringify(config, null, 2));
  };

  // 設定の形を検証し、不足項目を補う。不正なら Error を投げる
  const normalizeConfig = (input) => {
    if (!input || typeof input !== "object" || Array.isArray(input)) {
      throw new Error("設定はオブジェクトである必要があります。");
    }
    const config = {
      defaults: { ...DEFAULT_CONFIG.defaults, ...(input.defaults || {}) },
      environments: Array.isArray(input.environments) ? input.environments : [],
      services: Array.isArray(input.services) ? input.services : [],
      rules: Array.isArray(input.rules) ? input.rules : [],
    };
    if (!POSITIONS.includes(config.defaults.position)) {
      throw new Error(
        `defaults.position が不正です: ${config.defaults.position}（${POSITIONS.join(" / ")}）`,
      );
    }
    if (typeof config.defaults.labelFormat !== "string") {
      throw new Error("defaults.labelFormat は文字列である必要があります。");
    }
    const checkStyleFields = (obj, where) => {
      if (obj.position !== undefined && !POSITIONS.includes(obj.position)) {
        throw new Error(`${where}: position が不正です: ${obj.position}`);
      }
    };
    const envIds = new Set();
    config.environments.forEach((env, i) => {
      const where = `environments[${i}]`;
      if (typeof env.id !== "string" || !env.id) {
        throw new Error(`${where}: id は必須です。`);
      }
      if (envIds.has(env.id)) {
        throw new Error(`${where}: id が重複しています: ${env.id}`);
      }
      envIds.add(env.id);
      if (typeof env.name !== "string" || !env.name) {
        throw new Error(`${where}: name は必須です。`);
      }
      checkStyleFields(env, where);
    });
    const checkLabelFields = (obj, where) => {
      const hasLabel = typeof obj.label === "string" && obj.label;
      const hasName = typeof obj.name === "string" && obj.name;
      const hasEnv = typeof obj.env === "string" && obj.env;
      if (!hasLabel && !hasName && !hasEnv) {
        throw new Error(`${where}: label、name、env のいずれかは必須です。`);
      }
      if (hasEnv && !envIds.has(obj.env)) {
        throw new Error(
          `${where}: env "${obj.env}" が environments に定義されていません。`,
        );
      }
      checkStyleFields(obj, where);
    };
    config.services.forEach((service, i) => {
      const where = `services[${i}]`;
      if (typeof service.name !== "string" || !service.name) {
        throw new Error(`${where}: name は必須です。`);
      }
      if (typeof service.pattern !== "string" || !service.pattern) {
        throw new Error(`${where}: pattern は必須です。`);
      }
      compilePattern(service.pattern); // 構文チェック
      if (!Array.isArray(service.instances)) service.instances = [];
      service.instances.forEach((instance, j) => {
        const w = `${where}.instances[${j}]`;
        if (
          !instance.match ||
          typeof instance.match !== "object" ||
          Array.isArray(instance.match)
        ) {
          throw new Error(`${w}: match はオブジェクトである必要があります。`);
        }
        checkLabelFields(instance, w);
      });
    });
    config.rules.forEach((rule, i) => {
      const where = `rules[${i}]`;
      if (typeof rule.pattern !== "string" || !rule.pattern) {
        throw new Error(`${where}: pattern は必須です。`);
      }
      compilePattern(rule.pattern);
      checkLabelFields(rule, where);
    });
    return config;
  };

  // ---------- pattern ----------

  const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");

  // pattern 文字列を RegExp にする（結果はキャッシュ）
  const patternCache = new Map();
  const compilePattern = (pattern) => {
    if (patternCache.has(pattern)) return patternCache.get(pattern);
    let re;
    const regexForm = pattern.match(/^\/(.*)\/([a-z]*)$/s);
    if (regexForm) {
      re = new RegExp(regexForm[1], regexForm[2]);
    } else {
      // 簡易形: `*` / `{name}` / `{name:regex}` 以外は文字どおりに一致させる
      let src = "^";
      const token =
        /\{([A-Za-z_][A-Za-z0-9_]*)(?::((?:[^{}]|\{[^{}]*\})*))?\}|\*/g;
      let last = 0;
      let m;
      while ((m = token.exec(pattern)) !== null) {
        src += escapeRegExp(pattern.slice(last, m.index));
        if (m[0] === "*") {
          src += ".*";
        } else {
          src += `(?<${m[1]}>${m[2] !== undefined ? m[2] : "[^/]+"})`;
        }
        last = m.index + m[0].length;
      }
      src += escapeRegExp(pattern.slice(last)) + "$";
      re = new RegExp(src);
    }
    patternCache.set(pattern, re);
    return re;
  };

  // ---------- 判定 ----------

  // 現在の URL に対する表示内容を決める
  // 返り値: { kind: "label", label, bg, fg, position, titlePrefix, frame }
  //       | { kind: "unregistered", service, groups }
  //       | null
  // 表示するラベル文言を決める。label があればそれを使い、無ければ labelFormat から組み立てる
  const formatLabel = (obj, env, labelFormat) => {
    if (obj.label) return obj.label;
    const envName = env ? env.name : "";
    const name = obj.name || "";
    if (!envName) return name;
    if (!name) return envName;
    return labelFormat
      .replace(/\{env\}/g, envName)
      .replace(/\{name\}/g, name)
      .trim();
  };

  const resolve = (config, href) => {
    const d = config.defaults;
    const envById = new Map(config.environments.map((e) => [e.id, e]));
    // スタイルは instance・rule → environment → defaults の順に採用する
    const toLabel = (obj) => {
      const env = obj.env ? envById.get(obj.env) : null;
      const pick = (key) => {
        if (obj[key] !== undefined) return obj[key];
        if (env && env[key] !== undefined) return env[key];
        return d[key];
      };
      const bg = pick("bg") || "#d32f2f";
      return {
        kind: "label",
        label: formatLabel(obj, env, d.labelFormat),
        bg,
        fg: pick("fg") || pickForeground(bg),
        position: pick("position"),
        titlePrefix: pick("titlePrefix"),
        frame: pick("frame"),
      };
    };

    for (const service of config.services) {
      let m;
      try {
        m = compilePattern(service.pattern).exec(href);
      } catch {
        continue;
      }
      if (!m) continue;
      const groups = m.groups || {};
      const instance = service.instances.find((inst) =>
        Object.entries(inst.match).every(([k, v]) => groups[k] === v),
      );
      if (instance) return toLabel(instance);
      return { kind: "unregistered", service, groups };
    }
    for (const rule of config.rules) {
      try {
        if (compilePattern(rule.pattern).test(href)) return toLabel(rule);
      } catch {
        // 不正なパターンは無視
      }
    }
    return null;
  };

  // 背景色の明るさから文字色（黒 / 白）を決める
  const pickForeground = (bg) => {
    const m = /^#?([0-9a-f]{6})$/i.exec(bg.trim());
    if (!m) return "#ffffff";
    const n = parseInt(m[1], 16);
    const r = (n >> 16) & 255;
    const g = (n >> 8) & 255;
    const b = n & 255;
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance > 0.6 ? "#000000" : "#ffffff";
  };

  // ---------- UI（Shadow DOM + CSSOM） ----------

  const el = (tag, style = {}, props = {}) => {
    const e = document.createElement(tag);
    Object.assign(e.style, style);
    Object.assign(e, props);
    return e;
  };

  const FONT =
    'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

  // ルート要素（ページの body 差し替えに耐えるよう documentElement 直下に置く）
  const host = el("div", {
    position: "fixed",
    inset: "0",
    zIndex: "2147483647",
    pointerEvents: "none",
  });
  host.id = "show-environment-label-host";
  const shadow = host.attachShadow({ mode: "open" });

  const frameEl = el("div", {
    position: "fixed",
    inset: "0",
    pointerEvents: "none",
    display: "none",
  });
  const badgeEl = el("div", {
    position: "fixed",
    pointerEvents: "auto",
    cursor: "pointer",
    fontFamily: FONT,
    fontSize: "12px",
    fontWeight: "bold",
    lineHeight: "1",
    padding: "6px 12px",
    borderRadius: "6px",
    boxShadow: "0 2px 8px rgba(0,0,0,.35)",
    userSelect: "none",
    whiteSpace: "nowrap",
    display: "none",
  });
  badgeEl.title =
    "クリックでこのタブでは非表示（Tampermonkey のメニューから再表示）";
  // 未登録警告用の「追加」ボタン
  const addBtn = el(
    "button",
    {
      marginLeft: "10px",
      padding: "3px 8px",
      border: "1px solid rgba(0,0,0,.4)",
      borderRadius: "4px",
      background: "#ffffff",
      color: "#000000",
      fontFamily: FONT,
      fontSize: "11px",
      fontWeight: "bold",
      cursor: "pointer",
    },
    { textContent: "追加" },
  );
  const badgeText = el("span");
  badgeEl.append(badgeText, addBtn);
  shadow.append(frameEl, badgeEl);

  const applyPosition = (position) => {
    const s = badgeEl.style;
    s.top = s.right = s.bottom = s.left = "auto";
    s.transform = "none";
    s.borderRadius = "6px";
    s.textAlign = "left";
    switch (position) {
      case "top-left":
        s.top = "8px";
        s.left = "8px";
        break;
      case "bottom-left":
        s.bottom = "8px";
        s.left = "8px";
        break;
      case "bottom-right":
        s.bottom = "8px";
        s.right = "8px";
        break;
      case "top-bar":
        s.top = "0";
        s.left = "0";
        s.right = "0";
        s.borderRadius = "0";
        s.textAlign = "center";
        break;
      case "top-right":
      default:
        s.top = "8px";
        s.right = "8px";
    }
  };

  const isHidden = () => {
    try {
      return sessionStorage.getItem(SESSION_HIDDEN_KEY) === "1";
    } catch {
      return false;
    }
  };
  const setHidden = (hidden) => {
    try {
      if (hidden) sessionStorage.setItem(SESSION_HIDDEN_KEY, "1");
      else sessionStorage.removeItem(SESSION_HIDDEN_KEY);
    } catch {
      // sessionStorage が使えない環境では無視
    }
  };

  // ---------- タブタイトル ----------

  let appliedPrefix = "";
  const applyTitlePrefix = (prefix) => {
    const title = document.title;
    if (appliedPrefix && title.startsWith(appliedPrefix)) {
      if (appliedPrefix === prefix) return;
      document.title = title.slice(appliedPrefix.length);
    }
    appliedPrefix = prefix;
    if (prefix && !document.title.startsWith(prefix)) {
      document.title = prefix + document.title;
    }
  };

  // ---------- 描画 ----------

  let config = loadConfig();
  let current = null; // 直近の resolve 結果
  let lastHref = "";

  const render = () => {
    const href = location.href;
    if (href !== lastHref) {
      lastHref = href;
      current = resolve(config, href);
    }
    if (!document.documentElement.contains(host)) {
      document.documentElement.appendChild(host);
    }

    if (!current || isHidden()) {
      badgeEl.style.display = "none";
      frameEl.style.display = "none";
      applyTitlePrefix("");
      return;
    }

    if (current.kind === "label") {
      badgeText.textContent = current.label;
      badgeEl.style.background = current.bg;
      badgeEl.style.color = current.fg;
      addBtn.style.display = "none";
      applyPosition(current.position);
      badgeEl.style.display = "block";
      if (current.frame) {
        frameEl.style.boxShadow = `inset 0 0 0 4px ${current.bg}`;
        frameEl.style.display = "block";
      } else {
        frameEl.style.display = "none";
      }
      applyTitlePrefix(
        current.titlePrefix === false ? "" : `[${current.label}] `,
      );
      return;
    }

    // 未登録
    const detail = Object.entries(current.groups)
      .map(([k, v]) => `${k}=${v}`)
      .join(", ");
    badgeText.textContent = `⚠ 未登録: ${current.service.name}${detail ? `（${detail}）` : ""}`;
    badgeEl.style.background = "#fbc02d";
    badgeEl.style.color = "#000000";
    addBtn.style.display = "inline-block";
    applyPosition(config.defaults.position);
    badgeEl.style.display = "block";
    frameEl.style.display = "none";
    applyTitlePrefix("");
  };

  const refresh = () => {
    lastHref = "";
    render();
  };

  // ---------- 追加フロー ----------

  const promptColor = (defaultHex) => {
    const list = PALETTE.map(([name], i) => `${i + 1}=${name}`).join(" ");
    const input = prompt(
      `背景色を番号（${list}）または #RRGGBB で入力してください。`,
      defaultHex,
    );
    if (input === null) return null;
    const v = input.trim();
    const n = Number(v);
    if (Number.isInteger(n) && n >= 1 && n <= PALETTE.length) {
      return PALETTE[n - 1][1];
    }
    if (/^#[0-9a-f]{6}$/i.test(v)) return v.toLowerCase();
    alert("色の指定が不正です。");
    return null;
  };

  // 環境 ID を入力させる。戻り値: 環境 ID / null（環境なし）/ undefined（キャンセル・不正）
  const promptEnv = () => {
    if (!config.environments.length) return null;
    const list = config.environments
      .map((e) => `${e.id}=${e.name}`)
      .join(" / ");
    const input = prompt(
      `環境 ID を入力してください（${list}）。\n環境を使わない場合は空のままにしてください。`,
      config.environments[0].id,
    );
    if (input === null) return undefined;
    const id = input.trim();
    if (!id) return null;
    if (!config.environments.some((e) => e.id === id)) {
      alert(`環境 ID "${id}" は environments に定義されていません。`);
      return undefined;
    }
    return id;
  };

  // 名前 → 環境 → （環境なしの場合のみ）色 を順に入力させる。キャンセルなら null
  const promptLabelFields = (intro) => {
    const name = prompt(
      `${intro}\n名前（インスタンス名など）を入力してください。`,
      "",
    );
    if (name === null) return null;
    const env = promptEnv();
    if (env === undefined) return null;
    const fields = {};
    if (name.trim()) fields.name = name.trim();
    if (env) fields.env = env;
    if (!env) {
      if (!fields.name) {
        alert("名前は必須です。");
        return null;
      }
      const bg = promptColor(PALETTE[0][1]);
      if (!bg) return null;
      fields.bg = bg;
      fields.fg = pickForeground(bg);
    }
    return fields;
  };

  const labelOf = (obj) =>
    formatLabel(
      obj,
      obj.env ? config.environments.find((e) => e.id === obj.env) : null,
      config.defaults.labelFormat,
    );

  // 未登録の instance を追加する
  const addInstanceForCurrent = () => {
    if (!current || current.kind !== "unregistered") return;
    const { service, groups } = current;
    const detail = Object.entries(groups)
      .map(([k, v]) => `${k} = ${v}`)
      .join("\n");
    const fields = promptLabelFields(
      `「${service.name}」の未登録の環境を追加します。\n${detail}`,
    );
    if (!fields) return;
    const target =
      config.services.find((s) => s === service) ||
      config.services.find(
        (s) => s.name === service.name && s.pattern === service.pattern,
      );
    if (!target) {
      alert("対象の service が見つかりません。設定を確認してください。");
      return;
    }
    const instance = { match: { ...groups }, ...fields };
    target.instances.push(instance);
    saveConfig(config);
    refresh();
    alert(`追加しました: ${labelOf(instance)}`);
  };
  addBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    addInstanceForCurrent();
  });
  badgeEl.addEventListener("click", () => {
    setHidden(true);
    render();
  });

  // 現在の URL を元にルールを追加する
  const addRuleForCurrent = () => {
    const defaultPattern = `${location.origin}/*`;
    const pattern = prompt(
      "ルールの pattern を入力してください（`*` は任意の文字列。`/.../` で正規表現）。",
      defaultPattern,
    );
    if (pattern === null) return;
    try {
      compilePattern(pattern.trim());
    } catch (err) {
      alert(`pattern が不正です: ${err.message}`);
      return;
    }
    const fields = promptLabelFields("ルールを追加します。");
    if (!fields) return;
    const rule = { pattern: pattern.trim(), ...fields };
    config.rules.push(rule);
    saveConfig(config);
    refresh();
    alert(
      `ルールを追加しました。\n${rule.pattern} → ${labelOf(rule)}\n（詳細な設定は「設定を開く」で編集できます）`,
    );
  };

  // ---------- 設定モーダル ----------

  let modal = null;
  const openSettings = () => {
    if (modal) return;
    modal = el("div", {
      position: "fixed",
      inset: "0",
      background: "rgba(0,0,0,.45)",
      pointerEvents: "auto",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontFamily: FONT,
      fontSize: "13px",
      color: "#222",
    });
    const panel = el("div", {
      width: "min(800px, 92vw)",
      maxHeight: "88vh",
      display: "flex",
      flexDirection: "column",
      background: "#fff",
      borderRadius: "10px",
      boxShadow: "0 8px 32px rgba(0,0,0,.4)",
      padding: "14px",
      boxSizing: "border-box",
    });
    const title = el(
      "div",
      { fontWeight: "bold", fontSize: "14px", marginBottom: "6px" },
      { textContent: "Show Environment Label - 設定（JSON）" },
    );
    const help = el(
      "div",
      { color: "#555", marginBottom: "8px", whiteSpace: "pre-wrap" },
      {
        textContent:
          "JSON を編集して「保存」を押してください。エクスポートは「コピー」、インポートは貼り付けて「保存」。\n" +
          "pattern: `*` は任意の文字列、`{name}` は `/` を含まない 1 区切り、`{name:正規表現}`、または `/正規表現/`。\n" +
          "environments に環境（id / name / 色）を定義し、instance や rule に name と env を書くと「{env} {name}」形式のラベルになります（label を書けばそれが優先）。",
      },
    );
    const textarea = el(
      "textarea",
      {
        flex: "1",
        minHeight: "45vh",
        width: "100%",
        boxSizing: "border-box",
        fontFamily: 'ui-monospace, Consolas, "Courier New", monospace',
        fontSize: "12px",
        padding: "8px",
        border: "1px solid #bbb",
        borderRadius: "6px",
        resize: "vertical",
        whiteSpace: "pre",
      },
      { value: JSON.stringify(config, null, 2), spellcheck: false },
    );
    const message = el("div", {
      marginTop: "6px",
      minHeight: "1.2em",
      color: "#c62828",
      whiteSpace: "pre-wrap",
    });
    const btn = (text, onClick, primary = false) =>
      el(
        "button",
        {
          padding: "6px 14px",
          marginRight: "8px",
          border: primary ? "none" : "1px solid #999",
          borderRadius: "6px",
          background: primary ? "#1976d2" : "#f5f5f5",
          color: primary ? "#fff" : "#222",
          fontFamily: FONT,
          fontSize: "13px",
          fontWeight: "bold",
          cursor: "pointer",
        },
        { textContent: text, onclick: onClick },
      );
    const close = () => {
      modal.remove();
      modal = null;
    };
    const buttons = el("div", { marginTop: "10px" });
    buttons.append(
      btn(
        "保存",
        () => {
          try {
            const parsed = normalizeConfig(JSON.parse(textarea.value));
            config = parsed;
            saveConfig(config);
            refresh();
            message.style.color = "#2e7d32";
            message.textContent = "保存しました。";
          } catch (err) {
            message.style.color = "#c62828";
            message.textContent = `保存できませんでした: ${err.message}`;
          }
        },
        true,
      ),
      btn("コピー", () => {
        GM_setClipboard(textarea.value, "text");
        message.style.color = "#2e7d32";
        message.textContent = "クリップボードにコピーしました。";
      }),
      btn("例を挿入", () => {
        textarea.value = JSON.stringify(exampleConfig(), null, 2);
        message.style.color = "#555";
        message.textContent =
          "例を挿入しました（まだ保存されていません）。必要に応じて編集して「保存」してください。";
      }),
      btn("閉じる", close),
    );
    panel.append(title, help, textarea, message, buttons);
    modal.append(panel);
    modal.addEventListener("click", (e) => {
      if (e.target === modal) close();
    });
    shadow.append(modal);
    textarea.focus();
  };

  const exampleConfig = () => ({
    defaults: {
      position: "top-right",
      titlePrefix: true,
      frame: false,
      labelFormat: "{env} {name}",
    },
    environments: [
      { id: "dev", name: "開発", bg: "#388e3c", fg: "#ffffff" },
      { id: "test", name: "検証", bg: "#fbc02d", fg: "#000000" },
      { id: "prod", name: "本番", bg: "#d32f2f", fg: "#ffffff", frame: true },
    ],
    services: [
      {
        name: "Example Service",
        pattern: "https://console.example.com/{service}/{instance}/*",
        instances: [
          {
            match: { service: "db", instance: "prod-0001" },
            name: "db_prod",
            env: "prod",
          },
          {
            match: { service: "db", instance: "test-0001" },
            name: "db_test1",
            env: "test",
          },
          {
            match: { service: "db", instance: "test-0002" },
            name: "db_test2",
            env: "test",
          },
          {
            match: { service: "db", instance: "dev-0001" },
            label: "開発 DB（label を直接指定した例）",
            env: "dev",
          },
        ],
      },
    ],
    rules: [
      {
        pattern: "https://*.dev.example.com/*",
        env: "dev",
        titlePrefix: false,
      },
      {
        pattern: "/^https:\\/\\/stg\\./",
        label: "ステージング",
        bg: "#1976d2",
        fg: "#ffffff",
        position: "top-bar",
      },
    ],
  });

  // ---------- メニュー・監視 ----------

  GM_registerMenuCommand("設定を開く", openSettings);
  GM_registerMenuCommand("この URL のルールを追加…", addRuleForCurrent);
  GM_registerMenuCommand("ラベルを表示する（このタブ）", () => {
    setHidden(false);
    render();
  });
  GM_registerMenuCommand("ラベルを隠す（このタブ）", () => {
    setHidden(true);
    render();
  });

  // 他のタブで設定が保存されたら反映する
  if (typeof GM_addValueChangeListener === "function") {
    GM_addValueChangeListener(
      STORAGE_KEY,
      (name, oldValue, newValue, remote) => {
        if (!remote) return;
        config = loadConfig();
        refresh();
      },
    );
  }

  render();
  setInterval(render, POLL_INTERVAL_MS);
})();
