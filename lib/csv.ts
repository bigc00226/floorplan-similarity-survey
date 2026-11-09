import { DEMOGRAPHICS } from "./content";
import { getTriplet, mainTriplets } from "./dataset";
import { answeredMain, effectiveLoad, terminationOf, terminationReason } from "./engine";
import type { DemoState, ResponseRow } from "./types";

const esc = (v: unknown) => {
  if (v === undefined || v === null) return "";
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function toCsv(header: string[], rows: unknown[][]) {
  return "﻿" + [header.join(","), ...rows.map((r) => r.map(esc).join(","))].join("\r\n") + "\r\n";
}

export const RESPONSE_COLUMNS: { key: keyof ResponseRow | string; desc: string }[] = [
  { key: "response_id", desc: "回答行の一意ID（再送時の二重保存防止キー）" },
  { key: "prolific_pid", desc: "Prolific 参加者ID（URLの PROLIFIC_PID）" },
  { key: "study_id", desc: "Prolific Study ID（STUDY_ID）" },
  { key: "session_id", desc: "Prolific Session ID（SESSION_ID）" },
  { key: "phase", desc: "consent / comprehension / practice / main / attention / post / demographic" },
  { key: "screen_id", desc: "画面ID（例: trial_016, comprehension_2, post_aspects）" },
  { key: "item_id", desc: "設問ID。本試行は triplet_id、注意力確認は attention_B / attention_C" },
  { key: "seq", desc: "提示順（本試行は 1〜N+2、練習は 1〜）" },
  { key: "attempt", desc: "理解度確認の試行回数（1 or 2）" },
  { key: "triplet_id", desc: "問題ID" },
  { key: "condition", desc: "抽出条件 a〜g（triplet_id から自動判定）" },
  { key: "b_source", desc: "補助データ（triplets.json）: B の抽出元（near / mid / far / random）" },
  { key: "c_source", desc: "補助データ: C の抽出元" },
  { key: "b_distance", desc: "補助データ: A と B の距離" },
  { key: "c_distance", desc: "補助データ: A と C の距離" },
  { key: "b_rank", desc: "補助データ: B の順位" },
  { key: "c_rank", desc: "補助データ: C の順位" },
  { key: "distance_gap", desc: "補助データ: 距離の差" },
  { key: "anchor_id", desc: "基準間取り A の画像ID" },
  { key: "b_id", desc: "比較対象 B の画像ID（CSV上の b_id）" },
  { key: "c_id", desc: "比較対象 C の画像ID（CSV上の c_id）" },
  { key: "b_side", desc: "b_id を実際に表示した位置（left / right）" },
  { key: "left_image_id", desc: "左に表示した画像ID" },
  { key: "right_image_id", desc: "右に表示した画像ID" },
  { key: "left_label", desc: "左の画像に表示したラベル（B / C）" },
  { key: "response", desc: "参加者が選んだ選択肢（画面表示上の B / C / equal / cannot_judge、または設問の回答値）" },
  { key: "selected_role", desc: "データ上の選択（b = b_id を選択、c = c_id を選択、equal、cannot_judge）" },
  { key: "selected_image_id", desc: "選んだ画像ID（B・C を選んだ場合）" },
  { key: "correct", desc: "理解度確認・注意力確認の正誤（TRUE / FALSE）" },
  { key: "rt_ms", desc: "回答時間（ms）: 画像3枚の表示完了 → 回答確定（Continue）まで" },
  { key: "first_choice_ms", desc: "表示完了 → 最初に選択肢を選ぶまで（ms）" },
  { key: "choice_changes", desc: "確定前に選択を変更した回数" },
  { key: "displayed_at", desc: "画像3枚の表示完了日時（ISO8601, UTC）" },
  { key: "answered_at", desc: "回答確定日時（ISO8601, UTC）" },
  { key: "saved_at", desc: "サーバー保存日時（ISO8601, UTC）" },
  { key: "response_text", desc: "自由記述（Other の内容・コメント）" },
  { key: "image_error", desc: "画像読込エラーが発生した試行（TRUE）" },
];

function responseRow(r: ResponseRow) {
  const m = r.triplet_id ? getTriplet(r.triplet_id)?.meta : undefined;
  return [
    r.id,
    r.pid,
    r.study_id,
    r.session_id,
    r.phase,
    r.screen_id,
    r.item_id,
    r.seq,
    r.attempt,
    r.triplet_id,
    r.condition,
    m?.b_source,
    m?.c_source,
    m?.b_distance,
    m?.c_distance,
    m?.b_rank,
    m?.c_rank,
    m?.distance_gap,
    r.anchor_id,
    r.b_id,
    r.c_id,
    r.b_side,
    r.left_image_id,
    r.right_image_id,
    r.left_label,
    r.response,
    r.selected_role,
    r.selected_image_id,
    r.correct === undefined ? "" : r.correct ? "TRUE" : "FALSE",
    r.rt_ms,
    r.first_choice_ms,
    r.choice_changes,
    r.displayed_at,
    r.answered_at,
    r.saved_at,
    r.response_text,
    r.image_error ? "TRUE" : "",
  ];
}

export function responsesCsv(s: DemoState, filter?: (r: ResponseRow) => boolean) {
  const rows = (filter ? s.responses.filter(filter) : s.responses).map(responseRow);
  return toCsv(RESPONSE_COLUMNS.map((c) => c.key as string), rows);
}

export function participantsCsv(s: DemoState) {
  const byPid = new Map<string, ResponseRow[]>();
  for (const r of s.responses) {
    if (!byPid.has(r.pid)) byPid.set(r.pid, []);
    byPid.get(r.pid)!.push(r);
  }
  const header = [
    "prolific_pid",
    "study_id",
    "session_id",
    "all_session_ids",
    "status",
    "termination_type",
    "termination_reason",
    "withdrawn_at",
    "last_stage",
    "consent",
    "comprehension_attempts",
    "comprehension_passed",
    "practice_answered",
    "n_main",
    "main_answered",
    "attention_1_answer",
    "attention_1_pass",
    "attention_2_answer",
    "attention_2_pass",
    "attention_pass_count",
    "access_count",
    "dropout_count",
    "dropout_reasons",
    "started_at",
    "completed_at",
    "duration_min",
    "median_rt_ms",
    "post_aspects",
    "post_aspects_other",
    "post_most_important",
    "post_most_other",
    "post_difficulty",
    "post_comments",
    ...DEMOGRAPHICS.map((d) => d.id),
    "simulated",
  ];
  const rows = Object.values(s.participants).map((p) => {
    const rs = byPid.get(p.pid) ?? [];
    const get = (item: string) => rs.find((r) => r.item_id === item);
    const att = rs.filter((r) => r.phase === "attention").sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0));
    const rts = rs
      .filter((r) => r.phase === "main" && r.rt_ms != null)
      .map((r) => r.rt_ms!)
      .sort((a, b) => a - b);
    return [
      p.pid,
      p.studyId,
      p.sessionId,
      p.sessionIds.join(";"),
      p.status,
      terminationOf(p),
      terminationReason(p),
      p.withdrawnAt,
      p.stage,
      get("consent")?.response,
      p.comprehensionAttempts,
      p.comprehensionPassed === undefined ? "" : p.comprehensionPassed ? "TRUE" : "FALSE",
      rs.filter((r) => r.phase === "practice").length,
      p.n ?? "",
      answeredMain(p),
      att[0]?.response,
      att[0] ? (att[0].correct ? "TRUE" : "FALSE") : "",
      att[1]?.response,
      att[1] ? (att[1].correct ? "TRUE" : "FALSE") : "",
      att.filter((a) => a.correct).length,
      p.accessCount,
      p.dropouts.length,
      p.dropouts.map((d) => d.reason).join(";"),
      p.createdAt,
      p.completedAt,
      p.completedAt ? ((Date.parse(p.completedAt) - Date.parse(p.createdAt)) / 60000).toFixed(1) : "",
      rts.length ? rts[Math.floor(rts.length / 2)] : "",
      get("post_aspects")?.response,
      get("post_aspects")?.response_text,
      get("post_most_important")?.response,
      get("post_most_important")?.response_text,
      get("post_difficulty")?.response,
      get("post_comments")?.response,
      ...DEMOGRAPHICS.map((d) => get(d.id)?.response),
      p.simulated ? "TRUE" : "",
    ];
  });
  return toCsv(header, rows);
}

export function tripletStatusCsv(s: DemoState) {
  const load = effectiveLoad(s);
  const ex = new Set(s.excluded);
  const rows = mainTriplets().map((t) => {
    const done = s.completedCounts[t.triplet_id] ?? 0;
    const m = t.meta;
    const img = (t.files ?? []).map((st, i) => (st === "ok" ? "" : `${"abc"[i]}.png:${st}`)).filter(Boolean).join(";");
    return [
      t.triplet_id,
      t.condition,
      t.anchor_id,
      t.b_id,
      t.c_id,
      m?.b_source,
      m?.c_source,
      m?.b_distance,
      m?.c_distance,
      m?.distance_gap,
      done,
      (load.get(t.triplet_id) ?? 0) - done,
      ex.has(t.triplet_id) ? "TRUE" : "",
      img,
    ];
  });
  return toCsv(
    ["triplet_id", "condition", "anchor_id", "b_id", "c_id", "b_source", "c_source", "b_distance", "c_distance", "distance_gap", "responses", "reserved", "excluded", "image_issue"],
    rows,
  );
}

/** 取り込み時に検出した画像不良の一覧（依頼者様への差し替え依頼用） */
export function defectsCsv(list: { triplet_id: string; file: string; kind: string }[]) {
  return toCsv(
    ["triplet_id", "anchor_id", "condition", "file", "image_id", "issue"],
    list.map((d) => {
      const t = getTriplet(d.triplet_id)!;
      const id = d.file === "a.png" ? t.anchor_id : d.file === "b.png" ? t.b_id : t.c_id;
      return [d.triplet_id, t.anchor_id, t.condition, d.file, id, d.kind];
    }),
  );
}

export function download(filename: string, content: string, type = "text/csv;charset=utf-8") {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const stamp = () => new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "");
