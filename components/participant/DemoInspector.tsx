"use client";
import { useState } from "react";
import { CONDITION_INFO, getTriplet } from "@/lib/dataset";
import { answeredMain, currentSlot, mainAnswer, newId, nowIso } from "@/lib/engine";
import { SCREEN_LABELS } from "@/lib/content";
import { transact } from "@/lib/store";
import type { DemoState, DisplayChoice, Participant } from "@/lib/types";
import { IconExternal, IconX } from "@/components/icons";

/** デモ専用: 画面の裏側で記録されている内容を確認するためのパネル（本番では表示しません） */
export function DemoInspector({ p, state }: { p: Participant; state: DemoState }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const slot = p.stage === "main" ? currentSlot(p) : undefined;
  const t = slot?.triplet_id ? getTriplet(slot.triplet_id) : undefined;
  const rows = state.responses.filter((r) => r.pid === p.pid);
  const last = rows.at(-1);

  const fastForward = async (leaveLast: boolean) => {
    setBusy(true);
    await transact((s) => {
      const q = s.participants[p.pid];
      for (;;) {
        const sl = currentSlot(q);
        if (!sl || q.stage !== "main") break;
        const remaining = q.slots.filter((x) => x.state !== "answered").length;
        if (leaveLast && remaining <= 1) break;
        const r = Math.random();
        const choice: DisplayChoice = sl.kind === "attention" ? sl.target! : r < 0.42 ? "B" : r < 0.84 ? "C" : r < 0.95 ? "equal" : "cannot_judge";
        const rt = 2500 + Math.random() * 6000;
        mainAnswer(s, p.pid, sl.pos, { id: newId(), choice, rt_ms: rt, first_choice_ms: rt * 0.7, choice_changes: 0, displayed_at: nowIso(), answered_at: nowIso() });
      }
    });
    setBusy(false);
  };

  if (!open)
    return (
      <button
        lang="ja"
        onClick={() => setOpen(true)}
        className="fixed bottom-4 left-4 z-40 flex items-center gap-2 rounded-full bg-[#111827] px-3.5 py-2 text-xs font-semibold text-white shadow-lg ring-1 ring-white/10 hover:bg-black"
        title="デモ用: 記録内容を表示"
      >
        <span className="size-2 rounded-full bg-[#34d399]" /> DEMO 内部状態
      </button>
    );

  const Row = ({ k, v }: { k: string; v: React.ReactNode }) => (
    <div className="flex gap-3 py-1">
      <dt className="w-28 flex-none text-white/50">{k}</dt>
      <dd className="min-w-0 flex-1 break-all font-mono text-[11.5px] text-white/90">{v ?? "—"}</dd>
    </div>
  );

  return (
    <aside lang="ja" className="fixed bottom-4 left-4 z-40 w-[min(380px,calc(100vw-2rem))] rounded-2xl bg-[#111827]/97 p-4 text-xs text-white shadow-2xl ring-1 ring-white/10 backdrop-blur">
      <div className="mb-2 flex items-center gap-2">
        <span className="size-2 rounded-full bg-[#34d399]" />
        <b className="text-[13px]">デモ: 記録内容（参加者には非表示）</b>
        <button onClick={() => setOpen(false)} className="ml-auto grid size-7 place-items-center rounded-md hover:bg-white/10" aria-label="閉じる">
          <IconX size={14} />
        </button>
      </div>
      <dl className="divide-y divide-white/5">
        <Row k="PROLIFIC_PID" v={p.pid} />
        <Row k="STUDY / SESSION" v={`${p.studyId} / ${p.sessionId}`} />
        <Row k="画面" v={`${SCREEN_LABELS[p.stage]}（${p.stage}）`} />
        <Row k="アクセス回数" v={`${p.accessCount} 回 / 中断 ${p.dropouts.length} 回`} />
        {p.stage === "practice" && <Row k="練習の画像" v="仮画像（ご用意いただく画像に差し替え予定）" />}
        {p.stage === "main" && (
          <>
            <Row k="進捗" v={`本試行 ${answeredMain(p)} / ${p.n} 問回答済み`} />
            <Row k="triplet_id" v={slot?.triplet_id} />
            <Row k="種別・条件" v={slot?.kind === "attention" ? `注意力確認（正解: ${slot.target}）・仮画像` : `本試行・条件 ${t?.condition}（${t ? CONDITION_INFO[t.condition].label : ""}）`} />
            <Row k="A / B / C" v={t ? `${t.anchor_id} / ${t.b_id} / ${t.c_id}` : "—"} />
            <Row k="b_id の位置" v={slot?.b_side === "left" ? "左（B/C 入替なし）" : "右（B/C 入替）"} />
            {t?.meta?.b_distance != null && <Row k="距離 B / C" v={`${t.meta.b_distance.toFixed(3)} / ${t.meta.c_distance?.toFixed(3)}（差 ${t.meta.distance_gap?.toFixed(3)}）`} />}
          </>
        )}
        <Row k="保存済み行数" v={`${rows.length} 行`} />
        <Row k="直近の保存" v={last ? `${last.screen_id} → ${last.response}${last.rt_ms != null ? `（${(last.rt_ms / 1000).toFixed(2)} 秒）` : ""}` : "—"} />
      </dl>
      <div className="mt-3 flex flex-wrap gap-2">
        {p.stage === "main" && (
          <>
            <button disabled={busy} onClick={() => fastForward(true)} className="rounded-lg bg-white/10 px-2.5 py-1.5 font-semibold hover:bg-white/20 disabled:opacity-50">
              最終問題まで自動回答
            </button>
            <button disabled={busy} onClick={() => fastForward(false)} className="rounded-lg bg-white/10 px-2.5 py-1.5 font-semibold hover:bg-white/20 disabled:opacity-50">
              本試行を全て自動回答
            </button>
          </>
        )}
        <a href="/admin" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-lg bg-white/10 px-2.5 py-1.5 font-semibold hover:bg-white/20">
          管理画面 <IconExternal size={12} />
        </a>
      </div>
    </aside>
  );
}
