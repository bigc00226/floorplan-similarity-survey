/**
 * 問題割当エンジン（純粋関数）。デモ・本番共通のロジック。
 *
 * 優先順位:
 *   1. 問題ごとの回答数の均等化（最優先）
 *      — 常に「実効負荷 = 回答確定数 + 予約中の数」が全体で最小の問題からしか選ばない。
 *        これにより参加者が何人増えても、全問題の負荷の差は原則 1 以内に保たれる。
 *   2. 条件 a〜g の比率 2:1:1:2:1:1:2
 *      — 最小負荷の問題を持つ条件のうち「割当目標までの不足数」が最も大きい条件から選ぶ。
 *        均等化と両立しない場合のみ比率が崩れる（＝均等化を優先）。
 *   3. 同じ基準間取り A の繰り返し回避
 *      — 同じ負荷・同じ条件の候補の中で、未使用の anchor_id を優先。
 *   4. 同一問題の重複出題は禁止（exclude で除外）
 */
import { CONDITIONS, CONDITION_WEIGHTS, type Condition, type Triplet } from "./types";
import type { Rng } from "./rng";

/** 最大剰余法で N を 2:1:1:2:1:1:2 に配分。端数の同点はランダムに割り振り、参加者全体で比率を保つ。 */
export function conditionQuota(n: number, rng: Rng = Math.random): Record<Condition, number> {
  const total = CONDITIONS.reduce((s, c) => s + CONDITION_WEIGHTS[c], 0);
  const raw = CONDITIONS.map((c) => ({ c, v: (n * CONDITION_WEIGHTS[c]) / total, tie: rng() }));
  const q = Object.fromEntries(raw.map((r) => [r.c, Math.floor(r.v)])) as Record<Condition, number>;
  let rest = n - Object.values(q).reduce((s, v) => s + v, 0);
  const order = raw.slice().sort((x, y) => y.v - Math.floor(y.v) - (x.v - Math.floor(x.v)) || x.tie - y.tie);
  for (let i = 0; rest > 0; i++, rest--) q[order[i % order.length].c]++;
  return q;
}

export interface AllocateInput {
  /** 出題可能な問題（除外済みを除く本試行プール） */
  pool: Triplet[];
  /** triplet_id → 実効負荷（回答確定 + 予約中） */
  load: Map<string, number>;
  n: number;
  quota: Record<Condition, number>;
  /** この参加者に既に割り当てた問題（重複防止） */
  exclude?: Set<string>;
  /** この参加者に既に出した基準間取り A */
  usedAnchors?: Set<string>;
  rng?: Rng;
}

export interface AllocateResult {
  ids: string[];
  picked: Triplet[];
  byCondition: Record<Condition, number>;
  anchorRepeats: number;
  /** 割当時点で選んだ問題の負荷レベル（均等化の確認用） */
  levels: number[];
}

export function allocate(input: AllocateInput): AllocateResult {
  const rng = input.rng ?? Math.random;
  const exclude = input.exclude ?? new Set<string>();
  const usedAnchors = new Set(input.usedAnchors ?? []);
  const load = (id: string) => input.load.get(id) ?? 0;

  // 条件別に (負荷 昇順, ランダム) で並べた候補リスト
  const lists = new Map<Condition, { t: Triplet; l: number; k: number }[]>();
  for (const c of CONDITIONS) lists.set(c, []);
  for (const t of input.pool) {
    if (exclude.has(t.triplet_id)) continue;
    lists.get(t.condition)!.push({ t, l: load(t.triplet_id), k: rng() });
  }
  for (const arr of lists.values()) arr.sort((a, b) => a.l - b.l || a.k - b.k);

  const ptr = new Map<Condition, number>(CONDITIONS.map((c) => [c, 0]));
  const taken = new Set<string>();
  const deficit = { ...input.quota };
  const byCondition = Object.fromEntries(CONDITIONS.map((c) => [c, 0])) as Record<Condition, number>;
  const picked: Triplet[] = [];
  const levels: number[] = [];
  let anchorRepeats = 0;

  const head = (c: Condition) => {
    const arr = lists.get(c)!;
    let i = ptr.get(c)!;
    while (i < arr.length && taken.has(arr[i].t.triplet_id)) i++;
    ptr.set(c, i);
    return i < arr.length ? arr[i] : null;
  };

  for (let step = 0; step < input.n; step++) {
    // 1) 全体で最小の負荷レベル
    let minLevel = Infinity;
    const heads = new Map<Condition, number>();
    for (const c of CONDITIONS) {
      const h = head(c);
      if (h) {
        heads.set(c, h.l);
        if (h.l < minLevel) minLevel = h.l;
      }
    }
    if (minLevel === Infinity) break; // プール枯渇

    // 2) 最小レベルの候補を持つ条件のうち、不足数が最大の条件
    const eligible = CONDITIONS.filter((c) => heads.get(c) === minLevel);
    let best = eligible[0];
    let bestScore = -Infinity;
    for (const c of eligible) {
      const score = deficit[c] + rng() * 0.01;
      if (score > bestScore) {
        bestScore = score;
        best = c;
      }
    }

    // 3) 同レベル内で未使用の anchor を優先
    const arr = lists.get(best)!;
    let chosen: (typeof arr)[number] | null = null;
    let fallback: (typeof arr)[number] | null = null;
    for (let i = ptr.get(best)!; i < arr.length && arr[i].l === minLevel; i++) {
      const cand = arr[i];
      if (taken.has(cand.t.triplet_id)) continue;
      if (!fallback) fallback = cand;
      if (!usedAnchors.has(cand.t.anchor_id)) {
        chosen = cand;
        break;
      }
    }
    if (!chosen) {
      chosen = fallback!;
      anchorRepeats++;
    }
    taken.add(chosen.t.triplet_id);
    usedAnchors.add(chosen.t.anchor_id);
    deficit[best]--;
    byCondition[best]++;
    picked.push(chosen.t);
    levels.push(minLevel);
  }

  return { ids: picked.map((t) => t.triplet_id), picked, byCondition, anchorRepeats, levels };
}

/** 注意力確認の位置（N+2 問中）。N=40 → 16 問目・31 問目（画面遷移イメージと同じ） */
export function attentionPositions(n: number): [number, number] {
  const total = n + 2;
  const p1 = Math.max(1, Math.round(total * 0.38));
  let p2 = Math.max(p1 + 1, Math.round(total * 0.74));
  if (p2 > total) p2 = total;
  return [p1, p2];
}
