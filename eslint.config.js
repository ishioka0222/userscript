import js from "@eslint/js";
import prettier from "eslint-config-prettier";
import userscripts from "eslint-plugin-userscripts";
import globals from "globals";

export default [
  {
    ignores: ["node_modules/"],
  },

  js.configs.recommended,

  // リポジトリ内のツール類（Node.js / ESM）
  {
    files: ["**/*.{js,mjs}"],
    ignores: ["scripts/**/*.user.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        ...globals.node,
      },
    },
  },

  // ユーザースクリプト本体
  {
    files: ["scripts/**/*.user.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "script",
      globals: {
        ...globals.browser,
        ...globals.greasemonkey,
      },
    },
    plugins: {
      userscripts: {
        rules: userscripts.rules,
      },
    },
    rules: {
      ...userscripts.configs.recommended.rules,
      // GitHub (raw) から直接配布するため、更新用 URL を必須にする
      "userscripts/require-download-url": "error",
      // @homepage と @homepageURL の両方を書くことを求めるルール。
      // 主要なスクリプトマネージャーは @homepageURL を解釈するので片方で十分とみなして無効化する
      "userscripts/use-homepage-and-url": "off",
    },
    settings: {
      userscriptVersions: {
        tampermonkey: "*",
        violentmonkey: "*",
        greasemonkey: "*",
      },
    },
  },

  // Prettier と競合する整形系ルールを無効化（最後に置く）
  prettier,
];
