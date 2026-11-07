export const CONDITIONS = ["a", "b", "c", "d", "e", "f", "g"] as const;
export type Condition = (typeof CONDITIONS)[number];

/** 条件比率 2:1:1:2:1:1:2 */
export const CONDITION_WEIGHTS: Record<Condition, number> = { a: 2, b: 1, c: 1, d: 2, e: 1, f: 1, g: 2 };

export type Pool = "main" | "practice" | "attention" | "example";

export interface Triplet {
  triplet_id: string;
  anchor_id: string;
  b_id: string;
  c_id: string;
  condition: Condition;
  pool: Pool;
}

export type Side = "left" | "right";
/** Displayed answer as seen by the participant. */
export type DisplayChoice = "B" | "C" | "equal" | "cannot_judge";
/** Answer mapped to the data roles (b_id / c_id). */
export type RoleChoice = "b" | "c" | "equal" | "cannot_judge";

export type LabelMode = "positional" | "follow";

export interface Settings {
  /** 本試行の問題数 N（注意力確認 2 問は別に加算） */
  n: number;
  completionUrl: string;
  paused: boolean;
  /** 無操作タイムアウト（分）。ハートビートが途絶えたら離脱扱いにして未回答問題を解放 */
  leaseMinutes: number;
  practiceCount: number;
  /** positional: 左=B / 右=C で固定し中身(b_id/c_id)を入れ替え。follow: ラベルが画像に追従 */
  labelMode: LabelMode;
  /** デモ用: 完了URLの代わりに模擬Prolificページへ遷移 */
  demoRedirect: boolean;
  /** デモ用: 通信エラーを擬似的に発生させる確率 (0〜1) */
  networkFailureRate: number;
  autoRedirectSeconds: number;
}

export type ParticipantStatus = "active" | "completed" | "dropped" | "declined" | "screened_out";

export type Stage =
  | "consent"
  | "howto"
  | "comprehension"
  | "practice"
  | "ready"
  | "main"
  | "post_aspects"
  | "post_most"
  | "post_difficulty"
  | "post_comments"
  | "demographics"
  | "done";

export type SlotState = "reserved" | "answered" | "released";

export interface Slot {
  /** 1-based position in the main sequence (1..N+2) */
  pos: number;
  kind: "main" | "attention";
  triplet_id: string | null;
  b_side: Side;
  /** attention only: the label the participant is instructed to choose */
  target?: "B" | "C";
  state: SlotState;
  reservedAt?: string;
}

export interface Dropout {
  at: string;
  reason: "back_button" | "tab_closed" | "timeout" | "manual";
  stage: Stage;
  answeredMain: number;
  released: number;
}

export interface Participant {
  pid: string;
  studyId: string;
  sessionId: string;
  sessionIds: string[];
  status: ParticipantStatus;
  stage: Stage;
  createdAt: string;
  lastSeenAt: string;
  completedAt?: string;
  accessCount: number;
  comprehensionAttempts: number;
  comprehensionPassed?: boolean;
  practiceIndex: number;
  practice: { triplet_id: string; b_side: Side }[];
  /** frozen N at allocation time */
  n?: number;
  quota?: Record<Condition, number>;
  slots: Slot[];
  /** 一度割り当てた後に解放した問題（再アクセス時も再出題しない） */
  releasedIds: string[];
  dropouts: Dropout[];
  simulated?: boolean;
}

export type Phase = "consent" | "comprehension" | "practice" | "main" | "attention" | "post" | "demographic";

export interface ResponseRow {
  id: string;
  pid: string;
  study_id: string;
  session_id: string;
  phase: Phase;
  screen_id: string;
  item_id: string;
  seq?: number;
  attempt?: number;
  triplet_id?: string;
  condition?: Condition;
  anchor_id?: string;
  b_id?: string;
  c_id?: string;
  left_image_id?: string;
  right_image_id?: string;
  b_side?: Side;
  left_label?: "B" | "C";
  /** displayed choice / questionnaire value */
  response: string;
  response_text?: string;
  selected_role?: RoleChoice;
  selected_image_id?: string;
  correct?: boolean;
  rt_ms?: number;
  first_choice_ms?: number;
  choice_changes?: number;
  displayed_at?: string;
  answered_at: string;
  saved_at: string;
  image_error?: boolean;
}

export interface ImageErrorLog {
  at: string;
  pid?: string;
  triplet_id: string;
  file: string;
  source: "participant" | "validation";
  detail: string;
}

export interface EventLog {
  at: string;
  type: "start" | "resume" | "allocate" | "release" | "complete" | "dropout" | "screen_out" | "decline" | "admin" | "reject";
  pid?: string;
  message: string;
}

export interface ImportReport {
  at: string;
  rows: number;
  uniqueTriplets: number;
  imagesExpected: number;
  imagesChecked: number;
  missing: { triplet_id: string; file: string }[];
  corrupt: { triplet_id: string; file: string }[];
  csvIssues: string[];
  byCondition: Record<Condition, number>;
  uniqueAnchors: number;
  mode: "initial" | "sample" | "full";
}

export interface DemoState {
  schema: 3;
  createdAt: string;
  settings: Settings;
  participants: Record<string, Participant>;
  responses: ResponseRow[];
  /** 本試行の回答確定数（問題ごと） */
  completedCounts: Record<string, number>;
  excluded: string[];
  importReport: ImportReport | null;
  imageErrors: ImageErrorLog[];
  events: EventLog[];
}
