#!/usr/bin/env node
/**
 * 問題データの取り込みスクリプト
 *
 *   node scripts/import-data.mjs <RPLAN_triplets フォルダのパス>
 *
 * - triplets.csv（triplet_id, anchor_id, b_id, c_id）と triplets.json（補助データ）を読み込み
 * - 各フォルダの a.png / b.png / c.png を検査（欠損・0 バイト・PNG として不正）
 * - 画像を public/RPLAN_triplets/ にコピー（URL は /RPLAN_triplets/{triplet_id}/a.png）
 * - アプリが読み込むデータファイル lib/data/triplets.json を生成
 *
 * 差し替え画像を受け取ったら、このスクリプトを再実行するだけで反映されます。
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = process.argv[2];
if (!SRC || !fs.existsSync(path.join(SRC, "triplets.csv"))) {
  console.error("使い方: node scripts/import-data.mjs <RPLAN_triplets フォルダ（triplets.csv を含む）>");
  process.exit(1);
}

const PUB = path.join(ROOT, "public", "RPLAN_triplets");
const OUT = path.join(ROOT, "lib", "data", "triplets.json");
const COND_RE = /^(\d+)_([a-g])_(\d+)$/;
const PNG_SIG = "89504e470d0a1a0a";

// ── CSV ──
const csvText = fs.readFileSync(path.join(SRC, "triplets.csv"), "utf8").replace(/^﻿/, "");
const lines = csvText.split(/\r?\n/).filter((l) => l.trim() !== "");
const header = lines[0].split(",").map((h) => h.trim());
const need = ["triplet_id", "anchor_id", "b_id", "c_id"];
const missingCols = need.filter((c) => !header.includes(c));
if (missingCols.length) {
  console.error("CSV に必須列がありません:", missingCols.join(", "));
  process.exit(1);
}
const col = Object.fromEntries(need.map((c) => [c, header.indexOf(c)]));
const csvIssues = [];
const seen = new Set();
const csvRows = [];
lines.slice(1).forEach((line, i) => {
  const cells = line.split(",").map((s) => s.trim());
  const [t, a, b, c] = need.map((k) => cells[col[k]] ?? "");
  const m = COND_RE.exec(t);
  if (!t || !a || !b || !c) csvIssues.push(`${i + 2} 行目: 空欄があります`);
  if (seen.has(t)) csvIssues.push(`${i + 2} 行目: triplet_id「${t}」が重複しています`);
  if (!m) csvIssues.push(`${i + 2} 行目: triplet_id「${t}」から条件を判定できません`);
  if (m && m[1] !== a) csvIssues.push(`${i + 2} 行目: triplet_id と anchor_id が一致しません`);
  if (b === c) csvIssues.push(`${i + 2} 行目: b_id と c_id が同じです`);
  seen.add(t);
  if (m) csvRows.push({ t, a, b, c, cond: m[2] });
});

// ── JSON（補助データ） ──
let jsonMap = new Map();
let jsonRecords = 0;
const jsonPath = path.join(SRC, "triplets.json");
if (fs.existsSync(jsonPath)) {
  const js = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
  const arr = Array.isArray(js) ? js : js.triplets ?? [];
  jsonRecords = arr.length;
  jsonMap = new Map(arr.map((o) => [String(o.triplet_id), o]));
}
let jsonMismatch = 0;
const condSources = {};

// ── 画像の検査とコピー ──
fs.rmSync(PUB, { recursive: true, force: true });
fs.mkdirSync(PUB, { recursive: true });
const stat = { ok: 0, empty: 0, invalid: 0, missing: 0 };
const rows = [];
for (const r of csvRows) {
  const dir = path.join(SRC, r.t);
  const st = [];
  const sizes = [];
  fs.mkdirSync(path.join(PUB, r.t), { recursive: true });
  for (const f of ["a.png", "b.png", "c.png"]) {
    const p = path.join(dir, f);
    if (!fs.existsSync(p)) {
      st.push("m");
      sizes.push(-1);
      stat.missing++;
      continue;
    }
    const buf = fs.readFileSync(p);
    sizes.push(buf.length);
    if (buf.length === 0) {
      st.push("e");
      stat.empty++;
    } else if (buf.subarray(0, 8).toString("hex") !== PNG_SIG || !buf.subarray(buf.length - 8).toString("latin1").includes("IEND")) {
      st.push("i");
      stat.invalid++;
    } else {
      st.push("o");
      stat.ok++;
    }
    fs.copyFileSync(p, path.join(PUB, r.t, f)); // 不良ファイルもそのままコピー（検証画面で検出を確認できるように）
  }
  const j = jsonMap.get(r.t);
  if (j && (String(j.anchor_id) !== r.a || String(j.b_id) !== r.b || String(j.c_id) !== r.c || (j.condition && j.condition !== r.cond))) jsonMismatch++;
  if (j?.b_source) condSources[r.cond] = [j.b_source, j.c_source];
  const num = (v) => (typeof v === "number" ? Math.round(v * 1e6) / 1e6 : null);
  rows.push([r.t, r.a, r.b, r.c, r.cond, st.join(""), sizes, j?.b_source ?? null, j?.c_source ?? null, num(j?.b_distance), num(j?.c_distance), j?.b_rank ?? null, j?.c_rank ?? null, num(j?.distance_gap)]);
}

const out = {
  importedAt: new Date().toISOString(),
  source: { csvRows: lines.length - 1, jsonRecords, folders: fs.readdirSync(SRC, { withFileTypes: true }).filter((d) => d.isDirectory()).length },
  images: stat,
  csvIssues: csvIssues.slice(0, 50),
  jsonMismatch,
  conditionSources: condSources,
  columns: ["triplet_id", "anchor_id", "b_id", "c_id", "condition", "status(a,b,c: o=ok e=empty i=invalid m=missing)", "sizes", "b_source", "c_source", "b_distance", "c_distance", "b_rank", "c_rank", "distance_gap"],
  rows,
};
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(out));

const bad = rows.filter((r) => r[5] !== "ooo").length;
console.log(`CSV ${out.source.csvRows} 行 / JSON ${jsonRecords} 件（不一致 ${jsonMismatch}）/ フォルダ ${out.source.folders}`);
console.log(`画像: 正常 ${stat.ok} / 0バイト ${stat.empty} / 不正 ${stat.invalid} / 欠損 ${stat.missing}`);
console.log(`画像に問題のある問題: ${bad} 組（取り込み時に出題対象から除外されます）`);
if (csvIssues.length) console.log("CSV の指摘:", csvIssues.slice(0, 10));
console.log(`→ ${path.relative(ROOT, OUT)} と public/RPLAN_triplets/ を更新しました`);
