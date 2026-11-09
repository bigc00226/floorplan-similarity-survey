/**
 * Survey "backend" logic as pure state transitions on DemoState.
 * Virtual backend: runs entirely in the browser (persisted to localStorage, serialized with the
 * Web Locks API). No database or external server is used.
 */
import { allocate, attentionPositions, conditionQuota } from "./allocator";
import { attentionTriplets, defectList, defectiveTripletIds, getTriplet, importInfo, mainTriplets, practiceTriplets } from "./dataset";
import { shuffle, uid } from "./rng";
import {
  CONDITIONS,
  type Condition,
  type DemoState,
  type DisplayChoice,
  type Dropout,
  type EventLog,
  type ImageErrorLog,
  type ImportReport,
  type Participant,
  type ResponseRow,
  type RoleChoice,
  type Settings,
  type Side,
  type Slot,
  type Stage,
  type Termination,
  type Triplet,
} from "./types";

export const DEFAULT_SETTINGS: Settings = {
  n: 40,
  completionUrl: "https://app.prolific.com/submissions/complete?cc=C1F7A2B9",
  paused: false,
  leaseMinutes: 5,
  practiceCount: 2,
  labelMode: "positional",
  demoRedirect: true,
  networkFailureRate: 0,
  autoRedirectSeconds: 5,
};

export const STAGE_ORDER: Stage[] = [
  "consent",
  "howto",
  "comprehension",
  "practice",
  "ready",
  "main",
  "post_aspects",
  "post_most",
  "post_difficulty",
  "post_comments",
  "demographics",
  "done",
];

export const nowIso = () => new Date().toISOString();

export class ServerError extends Error {
  constructor(
    public code: string,
    message?: string,
  ) {
    super(message ?? code);
  }
}

export function initialImportReport(): ImportReport {
  const main = mainTriplets();
  const byCondition = Object.fromEntries(CONDITIONS.map((c) => [c, 0])) as Record<Condition, number>;
  for (const t of main) byCondition[t.condition]++;
  const defects = defectList();
  return {
    at: nowIso(),
    rows: main.length,
    uniqueTriplets: new Set(main.map((t) => t.triplet_id)).size,
    imagesExpected: main.length * 3,
    imagesChecked: main.length * 3,
    missing: defects.filter((d) => d.kind === "missing").map(({ triplet_id, file }) => ({ triplet_id, file })),
    empty: defects.filter((d) => d.kind === "empty").map(({ triplet_id, file }) => ({ triplet_id, file })),
    corrupt: defects.filter((d) => d.kind === "invalid").map(({ triplet_id, file }) => ({ triplet_id, file })),
    defectiveTriplets: defectiveTripletIds().length,
    jsonRecords: importInfo.source.jsonRecords,
    jsonMismatch: importInfo.jsonMismatch,
    csvIssues: importInfo.csvIssues,
    byCondition,
    uniqueAnchors: new Set(main.map((t) => t.anchor_id)).size,
    mode: "initial",
  };
}

export function initialState(): DemoState {
  const report = initialImportReport();
  const bad = defectiveTripletIds();
  return {
    schema: 4,
    createdAt: nowIso(),
    settings: { ...DEFAULT_SETTINGS },
    participants: {},
    responses: [],
    completedCounts: {},
    excluded: bad,
    importReport: report,
    imageErrors: [],
    events: [
      {
        at: nowIso(),
        type: "admin",
        message: `ご提供データを取り込みました: 問題 ${report.rows.toLocaleString()} 組・画像 ${report.imagesExpected.toLocaleString()} 枚を検査し、0 バイトの画像 ${report.empty.length} 枚を含む ${bad.length} 組を出題対象から除外`,
      },
    ],
  };
}

export function log(s: DemoState, type: EventLog["type"], message: string, pid?: string) {
  s.events.unshift({ at: nowIso(), type, pid, message });
  if (s.events.length > 500) s.events.length = 500;
}

/* ───────────────────────────── helpers ───────────────────────────── */

export function eligiblePool(s: DemoState): Triplet[] {
  const ex = new Set(s.excluded);
  return mainTriplets().filter((t) => !ex.has(t.triplet_id));
}

/** 実効負荷 = 回答確定数 + 予約中（進行中の参加者に割当済みで未回答） */
export function effectiveLoad(s: DemoState): Map<string, number> {
  const m = new Map<string, number>();
  for (const [id, c] of Object.entries(s.completedCounts)) m.set(id, c);
  for (const p of Object.values(s.participants)) {
    if (p.status !== "active") continue;
    for (const sl of p.slots) if (sl.kind === "main" && sl.state === "reserved" && sl.triplet_id) m.set(sl.triplet_id, (m.get(sl.triplet_id) ?? 0) + 1);
  }
  return m;
}

export function reservedCount(s: DemoState) {
  let n = 0;
  for (const p of Object.values(s.participants)) if (p.status === "active") n += p.slots.filter((x) => x.kind === "main" && x.state === "reserved").length;
  return n;
}

export const currentSlot = (p: Participant): Slot | undefined => p.slots.find((x) => x.state !== "answered");
export const answeredMain = (p: Participant) => p.slots.filter((x) => x.kind === "main" && x.state === "answered").length;
export const answeredTotal = (p: Participant) => p.slots.filter((x) => x.state === "answered").length;

const randSide = (): Side => (Math.random() < 0.5 ? "left" : "right");

function getP(s: DemoState, pid: string): Participant {
  const p = s.participants[pid];
  if (!p) throw new ServerError("not_found", "Participant not found");
  return p;
}

function requireActive(p: Participant, stage?: Stage) {
  if (p.status === "completed") throw new ServerError("already_completed");
  if (p.status === "screened_out") throw new ServerError("screened_out");
  if (p.status !== "active") throw new ServerError("inactive", `status=${p.status}`);
  if (stage && p.stage !== stage) throw new ServerError("stage_mismatch", `expected ${stage}, actual ${p.stage}`);
}

/** Label shown above an image placed on `side`. */
export function labelOf(side: Side, bSide: Side, mode: Settings["labelMode"]): "B" | "C" {
  if (mode === "positional") return side === "left" ? "B" : "C";
  return side === bSide ? "B" : "C";
}

export function mapChoice(t: Triplet, bSide: Side, choice: DisplayChoice, mode: Settings["labelMode"]) {
  const leftId = bSide === "left" ? t.b_id : t.c_id;
  const rightId = bSide === "left" ? t.c_id : t.b_id;
  const leftLabel = labelOf("left", bSide, mode);
  let role: RoleChoice = choice === "equal" ? "equal" : "cannot_judge";
  let image: string | undefined;
  if (choice === "B" || choice === "C") {
    const side: Side = leftLabel === choice ? "left" : "right";
    role = side === bSide ? "b" : "c";
    image = side === "left" ? leftId : rightId;
  }
  return { leftId, rightId, leftLabel, role, image };
}

/* ───────────────────────────── lifecycle ───────────────────────────── */

export function sweep(s: DemoState, now = Date.now()) {
  const leaseMs = s.settings.leaseMinutes * 60_000;
  for (const p of Object.values(s.participants)) {
    if (p.status === "active" && p.stage !== "done" && now - Date.parse(p.lastSeenAt) > leaseMs) dropOut(s, p, "timeout");
  }
}

/** 未回答の予約をすべて解放し、他の参加者へ再割当できる状態にする */
function releaseSlots(p: Participant) {
  let released = 0;
  for (const sl of p.slots) {
    if (sl.kind === "main" && sl.state === "reserved" && sl.triplet_id) {
      p.releasedIds.push(sl.triplet_id);
      sl.triplet_id = null;
      sl.state = "released";
      released++;
    }
  }
  return released;
}

export function dropOut(s: DemoState, p: Participant, reason: Dropout["reason"]) {
  if (p.status !== "active") return 0;
  const released = releaseSlots(p);
  p.status = "dropped";
  p.dropouts.push({ at: nowIso(), reason, stage: p.stage, answeredMain: answeredMain(p), released });
  const label = { back_button: "ブラウザの戻る操作", tab_closed: "タブ/ブラウザを閉じた", timeout: `${s.settings.leaseMinutes}分間応答なし`, manual: "管理者操作" }[reason];
  log(s, "dropout", `途中離脱（${label}）: 未回答 ${released} 問を解放し、他の参加者へ再割当可能にしました`, p.pid);
  return released;
}

export type EnterResult =
  | { ok: true; pid: string; resumed: boolean }
  | { ok: false; reason: "already_completed" | "screened_out" | "paused" | "withdrawn" | "declined"; completionUrl?: string };

export function enter(s: DemoState, ids: { pid: string; studyId: string; sessionId: string }, simulated = false): EnterResult {
  const existing = s.participants[ids.pid];
  const at = nowIso();
  if (existing) {
    if (existing.status === "completed") {
      log(s, "reject", "完了済み参加者の再アクセスを検知 — 再回答を防止しました", ids.pid);
      return { ok: false, reason: "already_completed", completionUrl: s.settings.completionUrl };
    }
    if (existing.status === "screened_out") return { ok: false, reason: "screened_out" };
    if (!existing.sessionIds.includes(ids.sessionId)) existing.sessionIds.push(ids.sessionId);
    existing.sessionId = ids.sessionId;
    existing.accessCount++;
    existing.lastSeenAt = at;
    // 明示的に取り消した参加者（不同意・参加取消）は、再アクセス時にまず取消済みであることを表示する
    if (existing.status === "withdrawn" || existing.status === "declined") return { ok: false, reason: existing.status };
    const wasDropped = existing.status !== "active";
    existing.status = "active";
    if (existing.stage === "main") reallocate(s, existing);
    if (wasDropped) log(s, "resume", `再アクセス（${existing.accessCount} 回目）: 回答済みデータを引き継いで再開`, ids.pid);
    return { ok: true, pid: ids.pid, resumed: true };
  }
  if (s.settings.paused) return { ok: false, reason: "paused" };
  const practice = practiceTriplets()
    .slice(0, s.settings.practiceCount)
    .map((t) => ({ triplet_id: t.triplet_id, b_side: randSide() }));
  s.participants[ids.pid] = {
    pid: ids.pid,
    studyId: ids.studyId,
    sessionId: ids.sessionId,
    sessionIds: [ids.sessionId],
    status: "active",
    stage: "consent",
    createdAt: at,
    lastSeenAt: at,
    accessCount: 1,
    comprehensionAttempts: 0,
    practiceIndex: 0,
    practice,
    slots: [],
    releasedIds: [],
    dropouts: [],
    simulated,
  };
  log(s, "start", "新規参加者がアクセス（同意画面）", ids.pid);
  return { ok: true, pid: ids.pid, resumed: false };
}

export function heartbeat(s: DemoState, pid: string) {
  const p = s.participants[pid];
  if (!p) return "missing" as const;
  if (p.status === "active") p.lastSeenAt = nowIso();
  return p.status;
}

export function leave(s: DemoState, pid: string, reason: Dropout["reason"]) {
  const p = s.participants[pid];
  if (!p || p.status !== "active" || p.stage === "done") return 0;
  return dropOut(s, p, reason);
}

/** 取消済みの参加者が「続ける」を選んだ場合（未完了者の再アクセスは拒否しない） */
export function rejoin(s: DemoState, pid: string) {
  const p = getP(s, pid);
  if (p.status !== "withdrawn" && p.status !== "declined") return p.stage;
  const was = p.status;
  if (was === "declined") p.stage = "consent";
  p.status = "active";
  p.lastSeenAt = nowIso();
  if (p.stage === "main") reallocate(s, p);
  log(s, "resume", was === "declined" ? "不同意の後、同意画面から再開" : "参加取消の後、回答済みデータを引き継いで再開", pid);
  return p.stage;
}

/** 参加者による明示的な参加取消（通信切断・離脱とは区別して記録） */
export function withdraw(s: DemoState, pid: string, reqId: string) {
  const p = getP(s, pid);
  if (hasRow(s, reqId)) return p.status;
  requireActive(p);
  const released = releaseSlots(p);
  pushRow(s, baseRow(p, { id: reqId, phase: "consent", screen_id: "withdraw", item_id: "withdraw", response: "withdrawn", answered_at: nowIso() }));
  p.status = "withdrawn";
  p.withdrawnAt = nowIso();
  const detail = p.stage === "main" ? `本試行 ${answeredMain(p)} 問回答済み・未回答 ${released} 問を解放` : "本試行の開始前";
  log(s, "withdraw", `参加者が参加を取り消しました（${detail}）`, pid);
  return p.status;
}

/** 終了の種類: 取消（明示的な終了）／中断（通信切断・離脱・タイムアウト）／完了／回答中 */
export function terminationOf(p: Participant): Termination {
  if (p.status === "completed") return "completed";
  if (p.status === "declined" || p.status === "screened_out" || p.status === "withdrawn") return "cancelled";
  if (p.status === "dropped") return "interrupted";
  return "in_progress";
}

export function terminationReason(p: Participant): string {
  if (p.status === "declined") return "consent_declined";
  if (p.status === "screened_out") return "comprehension_failed";
  if (p.status === "withdrawn") return "withdrawn_by_participant";
  if (p.status === "dropped") return p.dropouts.at(-1)?.reason ?? "";
  return "";
}

function baseRow(p: Participant, extra: Omit<ResponseRow, "pid" | "study_id" | "session_id" | "saved_at">): ResponseRow {
  return { pid: p.pid, study_id: p.studyId, session_id: p.sessionId, saved_at: nowIso(), ...extra };
}

function pushRow(s: DemoState, row: ResponseRow) {
  s.responses.push(row);
}

const hasRow = (s: DemoState, id: string) => {
  for (let i = s.responses.length - 1; i >= 0 && i >= s.responses.length - 400; i--) if (s.responses[i].id === id) return true;
  return false;
};

export function advance(p: Participant, to?: Stage) {
  p.stage = to ?? STAGE_ORDER[STAGE_ORDER.indexOf(p.stage) + 1];
}

export function consent(s: DemoState, pid: string, agree: boolean, reqId: string) {
  const p = getP(s, pid);
  if (hasRow(s, reqId)) return p.stage;
  requireActive(p, "consent");
  pushRow(s, baseRow(p, { id: reqId, phase: "consent", screen_id: "consent", item_id: "consent", response: agree ? "agree" : "disagree", answered_at: nowIso() }));
  if (agree) advance(p);
  else {
    p.status = "declined";
    log(s, "decline", "同意しなかったため終了", pid);
  }
  return p.stage;
}

export function howtoDone(s: DemoState, pid: string) {
  const p = getP(s, pid);
  requireActive(p);
  if (p.stage === "howto") advance(p);
  return p.stage;
}

export const COMPREHENSION_CORRECT = "similar";

export function comprehension(s: DemoState, pid: string, answer: string, reqId: string, rtMs?: number) {
  const p = getP(s, pid);
  if (hasRow(s, reqId)) return { stage: p.stage, status: p.status, correct: p.comprehensionPassed ?? false };
  requireActive(p, "comprehension");
  p.comprehensionAttempts++;
  const correct = answer === COMPREHENSION_CORRECT;
  pushRow(
    s,
    baseRow(p, {
      id: reqId,
      phase: "comprehension",
      screen_id: `comprehension_${p.comprehensionAttempts}`,
      item_id: "comprehension_task",
      attempt: p.comprehensionAttempts,
      response: answer,
      correct,
      rt_ms: rtMs,
      answered_at: nowIso(),
    }),
  );
  if (correct) {
    p.comprehensionPassed = true;
    advance(p, p.practice.length ? "practice" : "ready");
  } else if (p.comprehensionAttempts >= 2) {
    p.comprehensionPassed = false;
    p.status = "screened_out";
    log(s, "screen_out", "理解度確認に 2 回失敗したため終了", pid);
  }
  return { stage: p.stage, status: p.status, correct };
}

export interface TrialAnswer {
  id: string;
  choice: DisplayChoice;
  rt_ms: number;
  first_choice_ms?: number;
  choice_changes?: number;
  displayed_at?: string;
  answered_at: string;
  image_error?: boolean;
}

function trialRow(s: DemoState, p: Participant, t: Triplet, bSide: Side, a: TrialAnswer, extra: Partial<ResponseRow> & Pick<ResponseRow, "phase" | "screen_id">) {
  const m = mapChoice(t, bSide, a.choice, s.settings.labelMode);
  return baseRow(p, {
    id: a.id,
    item_id: t.triplet_id,
    triplet_id: t.triplet_id,
    condition: t.pool === "main" ? t.condition : undefined,
    anchor_id: t.anchor_id,
    b_id: t.b_id,
    c_id: t.c_id,
    left_image_id: m.leftId,
    right_image_id: m.rightId,
    b_side: bSide,
    left_label: m.leftLabel,
    response: a.choice,
    selected_role: m.role,
    selected_image_id: m.image,
    rt_ms: Math.round(a.rt_ms),
    first_choice_ms: a.first_choice_ms != null ? Math.round(a.first_choice_ms) : undefined,
    choice_changes: a.choice_changes,
    displayed_at: a.displayed_at,
    answered_at: a.answered_at,
    image_error: a.image_error || undefined,
    ...extra,
  });
}

export function practiceAnswer(s: DemoState, pid: string, index: number, a: TrialAnswer) {
  const p = getP(s, pid);
  if (hasRow(s, a.id)) return p.stage;
  requireActive(p, "practice");
  if (index !== p.practiceIndex) throw new ServerError("out_of_order", "practice index mismatch");
  const item = p.practice[index];
  const t = getTriplet(item.triplet_id)!;
  pushRow(s, trialRow(s, p, t, item.b_side, a, { phase: "practice", screen_id: `practice_${index + 1}`, seq: index + 1 }));
  p.practiceIndex++;
  if (p.practiceIndex >= p.practice.length) advance(p, "ready");
  return p.stage;
}

/** 本試行開始: N 問を割当（予約）し、注意力確認 2 問を固定位置に挿入、提示順をランダム化 */
export function startMain(s: DemoState, pid: string) {
  const p = getP(s, pid);
  requireActive(p);
  if (p.stage === "main" && p.slots.length) return p.stage;
  if (p.stage !== "ready") throw new ServerError("stage_mismatch");
  const n = s.settings.n;
  const quota = conditionQuota(n);
  const res = allocate({ pool: eligiblePool(s), load: effectiveLoad(s), n, quota });
  const ids = shuffle(res.ids);
  const [p1, p2] = attentionPositions(n);
  const att = attentionTriplets();
  const total = ids.length + 2;
  const at = nowIso();
  const slots: Slot[] = [];
  let k = 0;
  for (let pos = 1; pos <= total; pos++) {
    if (pos === p1 || pos === p2) {
      const first = pos === p1;
      slots.push({ pos, kind: "attention", triplet_id: att[first ? 0 : 1].triplet_id, b_side: randSide(), target: first ? "B" : "C", state: "reserved", reservedAt: at });
    } else {
      slots.push({ pos, kind: "main", triplet_id: ids[k++], b_side: randSide(), state: "reserved", reservedAt: at });
    }
  }
  p.n = ids.length;
  p.quota = quota;
  p.slots = slots;
  advance(p, "main");
  const q = CONDITIONS.map((c) => `${c}${res.byCondition[c]}`).join(" ");
  log(s, "allocate", `本試行 ${ids.length} 問を割当（${q}／負荷レベル ${Math.min(...res.levels)}〜${Math.max(...res.levels)}／A重複 ${res.anchorRepeats}）`, pid);
  return p.stage;
}

/** 再アクセス時: 解放済みの空き枠に、その時点で最も回答数の少ない問題を割り当て直す */
export function reallocate(s: DemoState, p: Participant) {
  const open = p.slots.filter((x) => x.kind === "main" && x.state === "released");
  if (!open.length) return;
  const answered = p.slots.filter((x) => x.kind === "main" && x.state === "answered");
  const done = Object.fromEntries(CONDITIONS.map((c) => [c, 0])) as Record<Condition, number>;
  const usedAnchors = new Set<string>();
  for (const x of p.slots) {
    if (!x.triplet_id || x.kind !== "main") continue;
    const t = getTriplet(x.triplet_id)!;
    usedAnchors.add(t.anchor_id);
    if (x.state === "answered") done[t.condition]++;
  }
  const quota = p.quota ?? conditionQuota(p.n ?? s.settings.n);
  const rem = Object.fromEntries(CONDITIONS.map((c) => [c, Math.max(0, quota[c] - done[c])])) as Record<Condition, number>;
  const exclude = new Set<string>([...p.releasedIds, ...p.slots.filter((x) => x.triplet_id).map((x) => x.triplet_id!)]);
  const res = allocate({ pool: eligiblePool(s), load: effectiveLoad(s), n: open.length, quota: rem, exclude, usedAnchors });
  const ids = shuffle(res.ids);
  const at = nowIso();
  open.forEach((sl, i) => {
    if (ids[i]) {
      sl.triplet_id = ids[i];
      sl.state = "reserved";
      sl.reservedAt = at;
      sl.b_side = randSide();
    }
  });
  // pool exhausted (practically impossible with 3,000 items): drop unfillable slots
  p.slots = p.slots.filter((x) => x.state !== "released");
  p.slots.forEach((x, i) => (x.pos = i + 1));
  log(s, "allocate", `再開に伴い残り ${ids.length} 問を再割当（回答済み ${answered.length} 問は保持）`, p.pid);
}

export function mainAnswer(s: DemoState, pid: string, pos: number, a: TrialAnswer) {
  const p = getP(s, pid);
  if (hasRow(s, a.id)) return { stage: p.stage };
  requireActive(p, "main");
  const slot = currentSlot(p);
  if (!slot || slot.pos !== pos || !slot.triplet_id) throw new ServerError("out_of_order", "前の問題への回答・回答変更はできません");
  const t = getTriplet(slot.triplet_id)!;
  const isAtt = slot.kind === "attention";
  const row = trialRow(s, p, t, slot.b_side, a, {
    phase: isAtt ? "attention" : "main",
    screen_id: `trial_${String(pos).padStart(3, "0")}`,
    seq: pos,
    item_id: isAtt ? `attention_${slot.target}` : t.triplet_id,
    correct: isAtt ? a.choice === slot.target : undefined,
  });
  pushRow(s, row);
  slot.state = "answered";
  if (!isAtt) s.completedCounts[t.triplet_id] = (s.completedCounts[t.triplet_id] ?? 0) + 1;
  if (!currentSlot(p)) advance(p, "post_aspects");
  return { stage: p.stage };
}

export interface PostItem {
  item_id: string;
  response: string;
  response_text?: string;
}

export function submitPost(s: DemoState, pid: string, stage: Stage, items: PostItem[], reqId: string) {
  const p = getP(s, pid);
  if (hasRow(s, `${reqId}:0`)) return { stage: p.stage, completionUrl: p.status === "completed" ? s.settings.completionUrl : undefined };
  requireActive(p, stage);
  const phase = stage === "demographics" ? "demographic" : "post";
  const at = nowIso();
  items.forEach((it, i) => pushRow(s, baseRow(p, { id: `${reqId}:${i}`, phase, screen_id: stage, item_id: it.item_id, response: it.response, response_text: it.response_text, answered_at: at })));
  if (stage === "demographics") return complete(s, p);
  advance(p);
  return { stage: p.stage };
}

/** 全データの保存をサーバー側で検証してから完了扱いにする */
function complete(s: DemoState, p: Participant) {
  const rows = s.responses.filter((r) => r.pid === p.pid);
  const main = rows.filter((r) => r.phase === "main").length;
  const att = rows.filter((r) => r.phase === "attention").length;
  const demo = rows.filter((r) => r.phase === "demographic").length;
  if (main !== p.n || att !== 2 || demo < 6) throw new ServerError("incomplete", `検証失敗: main=${main}/${p.n} attention=${att}/2 demographic=${demo}`);
  p.status = "completed";
  p.stage = "done";
  p.completedAt = nowIso();
  const attPass = rows.filter((r) => r.phase === "attention" && r.correct).length;
  log(s, "complete", `全 ${main + att} 問と事後質問の保存を確認 → 完了（注意力確認 ${attPass}/2 正解）`, p.pid);
  return { stage: p.stage, completionUrl: s.settings.completionUrl };
}

export function logImageError(s: DemoState, e: Omit<ImageErrorLog, "at">) {
  s.imageErrors.unshift({ at: nowIso(), ...e });
  if (s.imageErrors.length > 300) s.imageErrors.length = 300;
}

/* ───────────────────────────── audit ───────────────────────────── */

export interface Audit {
  participants: number;
  completed: number;
  active: number;
  dropped: number;
  screenedOut: number;
  declined: number;
  withdrawn: number;
  mainResponses: number;
  reserved: number;
  poolSize: number;
  min: number;
  max: number;
  mean: number;
  coverage: number;
  histogram: { level: number; count: number }[];
  loadMin: number;
  loadMax: number;
  conditionShare: Record<Condition, number>;
  conditionAvg: Record<Condition, number>;
  duplicateAssignments: number;
  countMismatches: number;
  anchorRepeats: number;
  attentionPassRate: number | null;
  avgRtMs: number | null;
  medianMinutes: number | null;
}

export function audit(s: DemoState): Audit {
  const pool = eligiblePool(s);
  const counts = pool.map((t) => s.completedCounts[t.triplet_id] ?? 0);
  const load = effectiveLoad(s);
  const loads = pool.map((t) => load.get(t.triplet_id) ?? 0);
  const hist = new Map<number, number>();
  for (const c of counts) hist.set(c, (hist.get(c) ?? 0) + 1);
  const ps = Object.values(s.participants);

  // CSV(=回答行) と集計値の一致
  const fromRows = new Map<string, number>();
  const shareCount = Object.fromEntries(CONDITIONS.map((c) => [c, 0])) as Record<Condition, number>;
  let attTotal = 0;
  let attOk = 0;
  let rtSum = 0;
  let rtN = 0;
  for (const r of s.responses) {
    if (r.phase === "main" && r.triplet_id) {
      fromRows.set(r.triplet_id, (fromRows.get(r.triplet_id) ?? 0) + 1);
      if (r.condition) shareCount[r.condition]++;
      if (r.rt_ms != null) {
        rtSum += r.rt_ms;
        rtN++;
      }
    }
    if (r.phase === "attention") {
      attTotal++;
      if (r.correct) attOk++;
    }
  }
  let mismatch = 0;
  const keys = new Set([...fromRows.keys(), ...Object.keys(s.completedCounts)]);
  for (const k of keys) if ((fromRows.get(k) ?? 0) !== (s.completedCounts[k] ?? 0)) mismatch++;

  let dup = 0;
  let anchorRep = 0;
  for (const p of ps) {
    const ids = p.slots.filter((x) => x.kind === "main" && x.triplet_id).map((x) => x.triplet_id!);
    const all = [...ids, ...p.releasedIds];
    dup += all.length - new Set(all).size;
    const anchors = ids.map((id) => getTriplet(id)!.anchor_id);
    anchorRep += anchors.length - new Set(anchors).size;
  }
  const mainTotal = Object.values(shareCount).reduce((a, b) => a + b, 0);
  const share = Object.fromEntries(CONDITIONS.map((c) => [c, mainTotal ? shareCount[c] / mainTotal : 0])) as Record<Condition, number>;
  const condAvg = Object.fromEntries(
    CONDITIONS.map((c) => {
      const list = pool.filter((t) => t.condition === c);
      return [c, list.length ? list.reduce((a, t) => a + (s.completedCounts[t.triplet_id] ?? 0), 0) / list.length : 0];
    }),
  ) as Record<Condition, number>;
  const durations = ps
    .filter((p) => p.completedAt)
    .map((p) => (Date.parse(p.completedAt!) - Date.parse(p.createdAt)) / 60000)
    .sort((a, b) => a - b);

  return {
    participants: ps.length,
    completed: ps.filter((p) => p.status === "completed").length,
    active: ps.filter((p) => p.status === "active").length,
    dropped: ps.filter((p) => p.status === "dropped").length,
    screenedOut: ps.filter((p) => p.status === "screened_out").length,
    declined: ps.filter((p) => p.status === "declined").length,
    withdrawn: ps.filter((p) => p.status === "withdrawn").length,
    mainResponses: mainTotal,
    reserved: reservedCount(s),
    poolSize: pool.length,
    min: counts.length ? Math.min(...counts) : 0,
    max: counts.length ? Math.max(...counts) : 0,
    mean: counts.length ? counts.reduce((a, b) => a + b, 0) / counts.length : 0,
    coverage: counts.filter((c) => c > 0).length,
    histogram: [...hist.entries()].sort((a, b) => a[0] - b[0]).map(([level, count]) => ({ level, count })),
    loadMin: loads.length ? Math.min(...loads) : 0,
    loadMax: loads.length ? Math.max(...loads) : 0,
    conditionShare: share,
    conditionAvg: condAvg,
    duplicateAssignments: dup,
    countMismatches: mismatch,
    anchorRepeats: anchorRep,
    attentionPassRate: attTotal ? attOk / attTotal : null,
    avgRtMs: rtN ? rtSum / rtN : null,
    medianMinutes: durations.length ? durations[Math.floor(durations.length / 2)] : null,
  };
}

export const newId = () => uid();
