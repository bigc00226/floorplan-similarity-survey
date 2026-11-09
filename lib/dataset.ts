/**
 * 問題データ: ご提供いただいた実データ（triplets.csv・triplets.json・RPLAN_triplets/ の画像）を
 * scripts/import-data.mjs で取り込んだ lib/data/triplets.json から読み込みます。
 *
 * 練習・注意力確認・説明画面の例示図は、依頼者様がご用意される画像に差し替える前提の仮画像です
 * （/placeholder/... で自動生成）。
 */
import raw from "./data/triplets.json";
import { CONDITIONS, type Condition, type FileStatus, type Triplet } from "./types";

type Row = [string, string, string, string, string, string, number[], string | null, string | null, number | null, number | null, number | null, number | null, number | null];

interface ImportFile {
  importedAt: string;
  source: { csvRows: number; jsonRecords: number; folders: number };
  images: { ok: number; empty: number; invalid: number; missing: number };
  csvIssues: string[];
  jsonMismatch: number;
  conditionSources: Record<string, [string, string]>;
  rows: Row[];
}

const data = raw as unknown as ImportFile;
const ST: Record<string, FileStatus> = { o: "ok", e: "empty", i: "invalid", m: "missing" };

export const importInfo = {
  importedAt: data.importedAt,
  source: data.source,
  images: data.images,
  csvIssues: data.csvIssues,
  jsonMismatch: data.jsonMismatch,
};

const SOURCE_JA: Record<string, string> = { near: "近い", mid: "中程度", far: "遠い", random: "ランダム" };

/** 条件 a〜g の意味（triplets.json の b_source / c_source から自動判定） */
export const CONDITION_INFO: Record<Condition, { b: string; c: string; label: string }> = Object.fromEntries(
  CONDITIONS.map((c) => {
    const [b, cc] = data.conditionSources[c] ?? ["?", "?"];
    return [c, { b, c: cc, label: `B ${SOURCE_JA[b] ?? b} / C ${SOURCE_JA[cc] ?? cc}` }];
  }),
) as Record<Condition, { b: string; c: string; label: string }>;

export function parseCondition(tripletId: string): Condition | null {
  const m = /^\d+_([a-g])_\d+$/.exec(tripletId);
  return m ? (m[1] as Condition) : null;
}

function makeMain(): Triplet[] {
  return data.rows.map((r) => ({
    triplet_id: r[0],
    anchor_id: r[1],
    b_id: r[2],
    c_id: r[3],
    condition: r[4] as Condition,
    pool: "main",
    files: r[5].split("").map((k) => ST[k]) as [FileStatus, FileStatus, FileStatus],
    sizes: r[6] as [number, number, number],
    meta: { b_source: r[7], c_source: r[8], b_distance: r[9], c_distance: r[10], b_rank: r[11], c_rank: r[12], distance_gap: r[13] },
  }));
}

/** 練習・注意力確認・例示図（仮画像。依頼者様ご用意の画像に差し替え予定） */
function makeExtra(): Triplet[] {
  const mk = (id: string, pool: Triplet["pool"], a: number, b: number, c: number): Triplet => ({
    triplet_id: id,
    anchor_id: String(a),
    b_id: String(b),
    c_id: String(c),
    condition: "a",
    pool,
  });
  return [
    mk("practice_1", "practice", 90101, 90104, 91207),
    mk("practice_2", "practice", 90302, 92408, 90306),
    mk("practice_3", "practice", 90505, 90509, 93101),
    mk("attention_1", "attention", 90701, 90703, 94204),
    mk("attention_2", "attention", 90902, 95301, 90905),
  ];
}

let cache: { main: Triplet[]; extra: Triplet[]; byId: Map<string, Triplet> } | null = null;

function build() {
  if (cache) return cache;
  const main = makeMain();
  const extra = makeExtra();
  const byId = new Map<string, Triplet>();
  for (const t of [...main, ...extra]) byId.set(t.triplet_id, t);
  cache = { main, extra, byId };
  return cache;
}

export const mainTriplets = () => build().main;
export const getTriplet = (id: string) => build().byId.get(id);
export const practiceTriplets = () => build().extra.filter((t) => t.pool === "practice");
export const attentionTriplets = () => build().extra.filter((t) => t.pool === "attention");

const FILES = ["a.png", "b.png", "c.png"] as const;

/** 取り込み時に画像の不良（欠損・0 バイト・不正）が見つかったファイル */
export function defectList() {
  const out: { triplet_id: string; file: string; kind: Exclude<FileStatus, "ok"> }[] = [];
  for (const t of build().main) t.files?.forEach((st, i) => st !== "ok" && out.push({ triplet_id: t.triplet_id, file: FILES[i], kind: st }));
  return out;
}

export function defectiveTripletIds() {
  return build()
    .main.filter((t) => t.files?.some((s) => s !== "ok"))
    .map((t) => t.triplet_id);
}

/** 本試行の画像は実データ（静的ファイル）、それ以外は仮画像 */
export function imagePath(tripletId: string, file: "a.png" | "b.png" | "c.png") {
  const t = getTriplet(tripletId);
  if (t?.pool === "main") return `/RPLAN_triplets/${encodeURIComponent(tripletId)}/${file}`;
  return `/placeholder/${encodeURIComponent(tripletId)}/${file.replace(".png", "")}`;
}

/** 説明画面の例示図（実データの基準間取りを 1 枚使用） */
export const EXAMPLE_IMAGE = "/RPLAN_triplets/10015_a_1/a.png";

export const roleFile = { a: "a.png", b: "b.png", c: "c.png" } as const;
