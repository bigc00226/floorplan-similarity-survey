"use client";
import { allocate, conditionQuota } from "./allocator";
import { ASPECTS, DEMOGRAPHICS, DIFFICULTY } from "./content";
import { getTriplet, mainTriplets } from "./dataset";
import {
  COMPREHENSION_CORRECT,
  comprehension,
  consent,
  currentSlot,
  enter,
  howtoDone,
  leave,
  mainAnswer,
  newId,
  nowIso,
  practiceAnswer,
  startMain,
  submitPost,
} from "./engine";
import { mulberry32, type Rng } from "./rng";
import { transact } from "./store";
import { CONDITIONS, type Condition, type DisplayChoice } from "./types";

/* ═════════════════ 1. Large-scale allocation verification (pure, in memory) ═════════════════ */

export interface AlgoParams {
  participants: number;
  n: number;
  concurrency: number;
  dropoutRate: number;
  seed: number;
}

export interface AlgoResult {
  params: AlgoParams;
  started: number;
  completed: number;
  dropped: number;
  released: number;
  totalAnswers: number;
  min: number;
  max: number;
  mean: number;
  sd: number;
  histogram: { level: number; count: number }[];
  series: { completed: number; min: number; max: number; mean: number; loadMin: number; loadMax: number }[];
  quotaExact: number;
  quotaTotal: number;
  conditionShare: Record<Condition, number>;
  anchorRepeatParticipants: number;
  duplicates: number;
  maxSpreadAfterWarmup: number;
  ms: number;
}

export async function simulateAllocation(params: AlgoParams, onProgress?: (p: number) => void): Promise<AlgoResult> {
  const t0 = performance.now();
  const rng = mulberry32(params.seed);
  const pool = mainTriplets();
  const completedCounts = new Map<string, number>();
  const load = new Map<string, number>();
  const inc = (m: Map<string, number>, k: string, d: number) => m.set(k, (m.get(k) ?? 0) + d);

  interface VP {
    queue: string[];
    seen: Set<string>;
    dropAt: number; // answer index at which participant leaves (Infinity = completes)
    answered: number;
  }
  const inflight: VP[] = [];
  let started = 0,
    completed = 0,
    dropped = 0,
    released = 0,
    totalAnswers = 0,
    quotaExact = 0,
    anchorRep = 0,
    duplicates = 0,
    maxSpreadAfterWarmup = 0;
  const shareCount = Object.fromEntries(CONDITIONS.map((c) => [c, 0])) as Record<Condition, number>;
  const series: AlgoResult["series"] = [];
  const warmup = params.concurrency; // ignore the first few participants

  const spawn = () => {
    const quota = conditionQuota(params.n, rng);
    const res = allocate({ pool, load, n: params.n, quota, rng });
    for (const id of res.ids) inc(load, id, 1);
    if (CONDITIONS.every((c) => res.byCondition[c] === quota[c])) quotaExact++;
    if (res.anchorRepeats > 0) anchorRep++;
    duplicates += res.ids.length - new Set(res.ids).size;
    for (const t of res.picked) shareCount[t.condition]++;
    const willDrop = rng() < params.dropoutRate;
    inflight.push({ queue: res.ids.slice(), seen: new Set(res.ids), dropAt: willDrop ? Math.floor(rng() * params.n) : Infinity, answered: 0 });
    started++;
  };

  const record = () => {
    let mn = Infinity,
      mx = 0,
      sum = 0,
      lmn = Infinity,
      lmx = 0;
    for (const t of pool) {
      const c = completedCounts.get(t.triplet_id) ?? 0;
      if (c < mn) mn = c;
      if (c > mx) mx = c;
      sum += c;
      const l = load.get(t.triplet_id) ?? 0;
      if (l < lmn) lmn = l;
      if (l > lmx) lmx = l;
    }
    series.push({ completed, min: mn, max: mx, mean: sum / pool.length, loadMin: lmn, loadMax: lmx });
    if (completed > warmup && started < params.participants) maxSpreadAfterWarmup = Math.max(maxSpreadAfterWarmup, lmx - lmn);
  };

  let steps = 0;
  while (completed + dropped < params.participants) {
    while (inflight.length < params.concurrency && started < params.participants) spawn();
    if (!inflight.length) break;
    const i = Math.floor(rng() * inflight.length);
    const vp = inflight[i];
    if (vp.answered >= vp.dropAt) {
      // drop-out: release the unanswered reservations immediately
      for (const id of vp.queue) inc(load, id, -1);
      released += vp.queue.length;
      dropped++;
      inflight.splice(i, 1);
      continue;
    }
    const id = vp.queue.shift()!;
    inc(completedCounts, id, 1);
    totalAnswers++;
    vp.answered++;
    if (!vp.queue.length) {
      completed++;
      inflight.splice(i, 1);
      if (completed % Math.max(1, Math.round(params.participants / 120)) === 0) record();
    }
    if (++steps % 4000 === 0) {
      onProgress?.((completed + dropped) / params.participants);
      await new Promise((r) => setTimeout(r, 0));
    }
  }
  record();

  const counts = pool.map((t) => completedCounts.get(t.triplet_id) ?? 0);
  const mean = counts.reduce((a, b) => a + b, 0) / counts.length;
  const sd = Math.sqrt(counts.reduce((a, b) => a + (b - mean) ** 2, 0) / counts.length);
  const hist = new Map<number, number>();
  for (const c of counts) hist.set(c, (hist.get(c) ?? 0) + 1);
  const shareTotal = Object.values(shareCount).reduce((a, b) => a + b, 0) || 1;

  return {
    params,
    started,
    completed,
    dropped,
    released,
    totalAnswers,
    min: Math.min(...counts),
    max: Math.max(...counts),
    mean,
    sd,
    histogram: [...hist.entries()].sort((a, b) => a[0] - b[0]).map(([level, count]) => ({ level, count })),
    series,
    quotaExact,
    quotaTotal: started,
    conditionShare: Object.fromEntries(CONDITIONS.map((c) => [c, shareCount[c] / shareTotal])) as Record<Condition, number>,
    anchorRepeatParticipants: anchorRep,
    duplicates,
    maxSpreadAfterWarmup,
    ms: performance.now() - t0,
  };
}

/* ═════════════════ 2. Live virtual participants (through the real demo backend) ═════════════════ */

export interface LiveParams {
  count: number;
  concurrency: number;
  dropoutRate: number;
  tickMs: number;
}

export interface LiveProgress {
  spawned: number;
  finished: number;
  inflight: number;
  completed: number;
  dropped: number;
  screenedOut: number;
  running: boolean;
}

const hex = (rng: Rng, n: number) => Array.from({ length: n }, () => Math.floor(rng() * 16).toString(16)).join("");

function pickChoice(rng: Rng): DisplayChoice {
  const r = rng();
  return r < 0.41 ? "B" : r < 0.82 ? "C" : r < 0.94 ? "equal" : "cannot_judge";
}

export function runLiveSimulation(params: LiveParams, onProgress: (p: LiveProgress) => void) {
  const rng = mulberry32((Date.now() ^ 0x5eed) >>> 0);
  interface V {
    pid: string;
    fate: "complete" | "drop" | "timeout" | "screen";
    dropAt: number;
    answered: number;
    comp: number;
  }
  const inflight: V[] = [];
  const prog: LiveProgress = { spawned: 0, finished: 0, inflight: 0, completed: 0, dropped: 0, screenedOut: 0, running: true };
  let stopped = false;
  const studyId = "SIM_STUDY_" + hex(rng, 6);

  const tick = async () => {
    if (stopped) return;
    await transact((s) => {
      while (inflight.length < params.concurrency && prog.spawned < params.count) {
        const pid = "5f" + hex(rng, 22);
        enter(s, { pid, studyId, sessionId: hex(rng, 24) }, true);
        const r = rng();
        const fate: V["fate"] = r < 0.03 ? "screen" : r < 0.03 + params.dropoutRate * 0.6 ? "drop" : r < 0.03 + params.dropoutRate ? "timeout" : "complete";
        inflight.push({ pid, fate, dropAt: Math.floor(rng() * s.settings.n), answered: 0, comp: 0 });
        prog.spawned++;
      }
      for (let i = inflight.length - 1; i >= 0; i--) {
        const v = inflight[i];
        const p = s.participants[v.pid];
        const finish = (kind: "completed" | "dropped" | "screenedOut") => {
          prog[kind]++;
          prog.finished++;
          inflight.splice(i, 1);
        };
        if (!p) {
          inflight.splice(i, 1);
          continue;
        }
        if (p.status === "dropped") {
          finish("dropped");
          continue;
        }
        p.lastSeenAt = nowIso();
        try {
        switch (p.stage) {
          case "consent":
            consent(s, v.pid, true, newId());
            break;
          case "howto":
            howtoDone(s, v.pid);
            break;
          case "comprehension": {
            const ok = v.fate === "screen" ? false : v.comp > 0 || rng() < 0.9;
            v.comp++;
            const r = comprehension(s, v.pid, ok ? COMPREHENSION_CORRECT : "prefer", newId(), 3000 + rng() * 6000);
            if (r.status === "screened_out") finish("screenedOut");
            break;
          }
          case "practice":
            practiceAnswer(s, v.pid, p.practiceIndex, { id: newId(), choice: pickChoice(rng), rt_ms: 3000 + rng() * 9000, answered_at: nowIso(), displayed_at: nowIso() });
            break;
          case "ready":
            startMain(s, v.pid);
            break;
          case "main": {
            if (v.fate !== "complete" && v.answered >= v.dropAt) {
              if (v.fate === "drop") {
                leave(s, v.pid, "tab_closed");
                finish("dropped");
              } else {
                // silent loss: no more heartbeats → the lease sweeper releases items after the timeout
                p.lastSeenAt = new Date(Date.now() - (s.settings.leaseMinutes * 60_000 + 1000)).toISOString();
                inflight.splice(i, 1);
                prog.dropped++;
                prog.finished++;
              }
              break;
            }
            const sl = currentSlot(p)!;
            const choice: DisplayChoice = sl.kind === "attention" ? (rng() < 0.93 ? sl.target! : pickChoice(rng)) : pickChoice(rng);
            const rt = Math.exp(Math.log(4200) + 0.55 * (rng() * 2 - 1) * 1.7);
            mainAnswer(s, v.pid, sl.pos, { id: newId(), choice, rt_ms: rt, first_choice_ms: rt * (0.55 + rng() * 0.4), choice_changes: rng() < 0.15 ? 1 : 0, displayed_at: nowIso(), answered_at: nowIso() });
            if (sl.kind === "main") v.answered++;
            break;
          }
          case "post_aspects": {
            const picks = ASPECTS.filter((a) => a.value !== "other" && rng() < 0.45);
            if (!picks.length) picks.push(ASPECTS[0]);
            submitPost(s, v.pid, "post_aspects", [{ item_id: "post_aspects", response: picks.map((x) => x.value).join(";") }], newId());
            break;
          }
          case "post_most":
            submitPost(s, v.pid, "post_most", [{ item_id: "post_most_important", response: ASPECTS[Math.floor(rng() * 7)].value }], newId());
            break;
          case "post_difficulty":
            submitPost(s, v.pid, "post_difficulty", [{ item_id: "post_difficulty", response: DIFFICULTY[Math.floor(rng() * 5)].value }], newId());
            break;
          case "post_comments":
            submitPost(s, v.pid, "post_comments", [{ item_id: "post_comments", response: rng() < 0.3 ? "Some plans were hard to compare when sizes differed." : "" }], newId());
            break;
          case "demographics":
            submitPost(
              s,
              v.pid,
              "demographics",
              DEMOGRAPHICS.map((d) => ({ item_id: d.id, response: d.options[Math.floor(rng() * d.options.length)] })),
              newId(),
            );
            finish("completed");
            break;
          default:
            inflight.splice(i, 1);
        }
        } catch {
          inflight.splice(i, 1);
        }
      }
    });
    prog.inflight = inflight.length;
    if (prog.finished >= params.count || (prog.spawned >= params.count && !inflight.length)) {
      prog.running = false;
      onProgress({ ...prog });
      return;
    }
    onProgress({ ...prog });
    setTimeout(tick, params.tickMs);
  };
  setTimeout(tick, 0);
  return () => {
    stopped = true;
    prog.running = false;
    onProgress({ ...prog });
  };
}

export const tripletOf = (id: string) => getTriplet(id);
