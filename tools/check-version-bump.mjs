#!/usr/bin/env node
/**
 * 変更された .user.js の @version が、ベースブランチより上がっているか検証する。
 *
 * 使い方: node tools/check-version-bump.mjs <base-ref>
 *   例:   node tools/check-version-bump.mjs origin/master
 *
 * @version を上げ忘れると、Tampermonkey 等が更新を検知できず利用者に変更が届かないため、
 * CI（pull_request）で機械的にチェックする。
 */

import { execFileSync } from "node:child_process";

const USER_SCRIPT_PATTERN = /^scripts\/.+\.user\.js$/;
const VERSION_PATTERN = /^\/\/\s*@version\s+(\S+)/m;

const git = (...args) =>
  execFileSync("git", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  });

const extractVersion = (source) => {
  const match = source.match(VERSION_PATTERN);
  return match ? match[1] : null;
};

/**
 * semver 風のバージョン文字列を比較する。
 * 数値部分は数値として、それ以外は文字列として比較する。
 * @returns {number} a < b なら負、a === b なら 0、a > b なら正
 */
const compareVersions = (a, b) => {
  const split = (v) => v.split(/[.\-+]/);
  const pa = split(a);
  const pb = split(b);
  const length = Math.max(pa.length, pb.length);
  for (let i = 0; i < length; i++) {
    const x = pa[i] ?? "0";
    const y = pb[i] ?? "0";
    const nx = Number(x);
    const ny = Number(y);
    const bothNumeric = !Number.isNaN(nx) && !Number.isNaN(ny);
    if (bothNumeric) {
      if (nx !== ny) return nx - ny;
    } else if (x !== y) {
      return x < y ? -1 : 1;
    }
  }
  return 0;
};

const main = () => {
  const baseRef = process.argv[2];
  if (!baseRef) {
    console.error("Usage: node tools/check-version-bump.mjs <base-ref>");
    process.exit(2);
  }

  // ベースとの差分を、リネーム検出付きで取得する。
  // 出力形式: "<status>\t<path>" または "R<similarity>\t<old>\t<new>"
  const diff = git("diff", "--name-status", "-M", `${baseRef}...HEAD`).trim();
  const entries = diff
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [status, ...paths] = line.split("\t");
      return { status, oldPath: paths[0], newPath: paths[paths.length - 1] };
    })
    .filter((e) => USER_SCRIPT_PATTERN.test(e.newPath));

  if (entries.length === 0) {
    console.log("No userscript changes detected. Skipping @version check.");
    return;
  }

  const errors = [];
  for (const { status, oldPath, newPath } of entries) {
    if (status.startsWith("A")) {
      console.log(`ADDED    ${newPath} (no check needed)`);
      continue;
    }
    if (status.startsWith("D")) {
      continue;
    }
    if (status === "R100") {
      console.log(
        `RENAMED  ${oldPath} -> ${newPath} (content unchanged, no check needed)`,
      );
      continue;
    }

    const baseSource = git("show", `${baseRef}:${oldPath}`);
    const headSource = git("show", `HEAD:${newPath}`);
    const baseVersion = extractVersion(baseSource);
    const headVersion = extractVersion(headSource);

    if (!headVersion) {
      errors.push(`${newPath}: @version not found`);
      continue;
    }
    if (!baseVersion) {
      // ベース側にバージョンが無い（過去の不備）場合は今回のものを受け入れる
      console.log(`OK       ${newPath}: (none) -> ${headVersion}`);
      continue;
    }
    if (compareVersions(headVersion, baseVersion) > 0) {
      console.log(`OK       ${newPath}: ${baseVersion} -> ${headVersion}`);
    } else {
      errors.push(
        `${newPath}: @version must be bumped (base: ${baseVersion}, head: ${headVersion})`,
      );
    }
  }

  if (errors.length > 0) {
    console.error("\n@version check failed:");
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }
};

main();
