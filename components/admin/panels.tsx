"use client";
import { Fragment, useMemo, useState } from "react";
import { SCREEN_LABELS } from "@/lib/content";
import { getTriplet, imagePath, mainTriplets } from "@/lib/dataset";
import { answeredMain, audit, dropOut, effectiveLoad, log } from "@/lib/engine";
import { transact } from "@/lib/store";
import { CONDITIONS, CONDITION_WEIGHTS, type DemoState, type Participant } from "@/lib/types";
import { ZoomModal } from "@/components/participant/ZoomModal";
import { IconAlert, IconCheck, IconChevronRight, IconX } from "@/components/icons";
import { ConditionBars, Histogram, Kpi, Section, StatusPill } from "./charts";

export const fmt = (iso?: string) => {
  if (!iso) return "—";
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
};
export const ago = (iso?: string) => {
  if (!iso) return "—";
  const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
  if (s < 60) return `${Math.floor(s)}秒前`;
  if (s < 3600) return `${Math.floor(s / 60)}分前`;
  if (s < 86400) return `${Math.floor(s / 3600)}時間前`;
  return `${Math.floor(s / 86400)}日前`;
};

const EVENT_STYLE: Record<string, string> = {
  start: "bg-brand-50 text-brand",
  resume: "bg-brand-50 text-brand",
  allocate: "bg-[#eef0f4] text-ink-2",
  release: "bg-warn-50 text-warn",
  dropout: "bg-warn-50 text-warn",
  complete: "bg-good-50 text-good",
  screen_out: "bg-bad-50 text-bad",
  decline: "bg-[#eef0f4] text-ink-2",
  reject: "bg-bad-50 text-bad",
  admin: "bg-[#111827] text-white",
};
const EVENT_LABEL: Record<string, string> = {
  start: "開始",
  resume: "再開",
  allocate: "割当",
  release: "解放",
  dropout: "離脱",
  complete: "完了",
  screen_out: "終了",
  decline: "不同意",
  reject: "再回答防止",
  admin: "管理",
};

export function EventList({ s, limit = 12 }: { s: DemoState; limit?: number }) {
  const ev = s.events.slice(0, limit);
  if (!ev.length) return <p className="py-6 text-center text-sm text-muted">まだアクティビティはありません</p>;
  return (
    <ul className="divide-y divide-[#eef0f3]">
      {ev.map((e, i) => (
        <li key={i} className="flex items-start gap-3 py-2.5">
          <span className={`pill mt-0.5 w-[74px] justify-center ${EVENT_STYLE[e.type]}`}>{EVENT_LABEL[e.type]}</span>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] leading-relaxed text-ink">{e.message}</p>
            <p className="text-[11px] text-muted">
              {fmt(e.at)}
              {e.pid && <span className="ml-2 font-mono">{e.pid.slice(0, 12)}…</span>}
            </p>
          </div>
        </li>
      ))}
    </ul>
  );
}

/* ═════════════ Overview ═════════════ */
export function Overview({ s, go }: { s: DemoState; go: (t: "participants" | "triplets" | "simulate" | "logs" | "data") => void }) {
  const a = useMemo(() => audit(s), [s]);
  const spread = a.max - a.min;
  const total = CONDITIONS.reduce((x, c) => x + CONDITION_WEIGHTS[c], 0);
  return (
    <div className="space-y-5">
      {a.participants === 0 && (
        <div className="rounded-xl border border-brand-100 bg-brand-50 px-4 py-3 text-sm text-[#1f3d85]">
          まだ参加者がいません。トップページから参加者として回答するか、
          <button className="font-semibold underline" onClick={() => go("simulate")}>
            シミュレーション
          </button>
          で仮想参加者を流すと、この画面がリアルタイムに更新されます。
        </div>
      )}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Kpi label="参加者" value={a.participants.toLocaleString()} sub={`回答中 ${a.active} 人`} />
        <Kpi label="完了" value={a.completed.toLocaleString()} sub={a.participants ? `完了率 ${((a.completed / a.participants) * 100).toFixed(0)}%` : "—"} tone="good" />
        <Kpi label="途中離脱・終了" value={a.dropped + a.screenedOut + a.declined} sub={`離脱 ${a.dropped} / 理解度 ${a.screenedOut} / 不同意 ${a.declined}`} />
        <Kpi label="本試行の回答数" value={a.mainResponses.toLocaleString()} sub={`予約中 ${a.reserved} 問`} />
        <Kpi
          label="問題あたり回答数"
          value={
            <>
              {a.min}〜{a.max}
            </>
          }
          sub={`平均 ${a.mean.toFixed(2)} / 差 ${spread}`}
          tone={spread <= 1 ? "good" : "warn"}
        />
        <Kpi label="注意力確認 正答率" value={a.attentionPassRate == null ? "—" : `${(a.attentionPassRate * 100).toFixed(0)}%`} sub={a.avgRtMs ? `平均回答時間 ${(a.avgRtMs / 1000).toFixed(1)} 秒` : undefined} />
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.3fr_1fr]">
        <Section
          title="問題ごとの回答数の分布"
          desc={`出題対象 ${a.poolSize.toLocaleString()} 問（除外 ${s.excluded.length} 問）。均等化により、回答数は全問題でほぼ同じ値に揃います。`}
          right={
            <span className={`pill ${a.loadMax - a.loadMin <= 1 ? "bg-good-50 text-good" : "bg-warn-50 text-warn"}`}>
              {a.loadMax - a.loadMin <= 1 ? <IconCheck size={12} /> : <IconAlert size={12} />}
              予約を含む負荷の差 {a.loadMax - a.loadMin}
            </span>
          }
        >
          <Histogram data={a.histogram} />
          <p className="mt-3 text-xs text-muted">
            1 回以上回答された問題: <b className="num text-ink">{a.coverage.toLocaleString()}</b> / {a.poolSize.toLocaleString()} 問
            <button className="ml-3 font-semibold text-brand hover:underline" onClick={() => go("triplets")}>
              問題別の一覧を見る →
            </button>
          </p>
        </Section>

        <Section title="抽出条件別の収集状況" desc="棒は問題 1 問あたりの平均回答数。右は本試行の回答に占める割合と目標比率（2:1:1:2:1:1:2）。">
          <ConditionBars
            rows={CONDITIONS.map((c) => ({
              key: c,
              value: a.conditionAvg[c],
              label: `${a.conditionAvg[c].toFixed(2)} 件/問 · ${(a.conditionShare[c] * 100).toFixed(1)}%`,
              target: `${((CONDITION_WEIGHTS[c] / total) * 100).toFixed(0)}%`,
            }))}
          />
        </Section>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1fr_1fr]">
        <Section
          title="最近のアクティビティ"
          right={
            <button className="text-xs font-semibold text-brand hover:underline" onClick={() => go("logs")}>
              すべて見る
            </button>
          }
        >
          <EventList s={s} limit={8} />
        </Section>
        <Section title="データ品質チェック" desc="保存データの整合性を常時検証しています。">
          <ul className="space-y-2.5 text-sm">
            <Check ok={a.duplicateAssignments === 0} label="同一参加者への同一問題の重複出題" value={`${a.duplicateAssignments} 件`} />
            <Check ok={a.countMismatches === 0} label="回答行（CSV）と問題別集計の不一致" value={`${a.countMismatches} 件`} />
            <Check ok={a.loadMax - a.loadMin <= 1} label="問題ごとの負荷（回答＋予約）の差" value={`${a.loadMax - a.loadMin}`} />
            <Check ok={s.excluded.length === 0 || !!s.importReport} label="画像の欠損・破損（出題対象から除外済み）" value={`${s.excluded.length} 問`} warn={s.excluded.length > 0} onClick={() => go("data")} />
            <Check ok={s.imageErrors.filter((e) => e.source === "participant").length === 0} label="参加者側での画像読込エラー" value={`${s.imageErrors.filter((e) => e.source === "participant").length} 件`} warn onClick={() => go("logs")} />
            <Check ok label="同じ基準間取り A の繰り返し（参加者内）" value={`${a.anchorRepeats} 件`} warn={a.anchorRepeats > 0} />
          </ul>
        </Section>
      </div>
    </div>
  );
}

function Check({ ok, warn, label, value, onClick }: { ok: boolean; warn?: boolean; label: string; value: string; onClick?: () => void }) {
  const tone = ok && !warn ? "text-good bg-good-50" : ok ? "text-warn bg-warn-50" : "text-bad bg-bad-50";
  return (
    <li className="flex items-center gap-3">
      <span className={`grid size-6 flex-none place-items-center rounded-full ${tone}`}>{ok && !warn ? <IconCheck size={13} /> : <IconAlert size={13} />}</span>
      <span className="flex-1 text-ink-2">
        {label}
        {onClick && (
          <button onClick={onClick} className="ml-2 text-xs font-semibold text-brand hover:underline">
            確認
          </button>
        )}
      </span>
      <span className="num font-semibold">{value}</span>
    </li>
  );
}

/* ═════════════ Participants ═════════════ */
export function ParticipantsPanel({ s }: { s: DemoState }) {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [hideSim, setHideSim] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const list = useMemo(
    () =>
      Object.values(s.participants)
        .filter((p) => (status === "all" || p.status === status) && (!hideSim || !p.simulated) && (!q || p.pid.includes(q.trim())))
        .sort((a, b) => Date.parse(b.lastSeenAt) - Date.parse(a.lastSeenAt)),
    [s, q, status, hideSim],
  );
  const rowsBy = useMemo(() => {
    const m = new Map<string, DemoState["responses"]>();
    for (const r of s.responses) {
      if (!m.has(r.pid)) m.set(r.pid, []);
      m.get(r.pid)!.push(r);
    }
    return m;
  }, [s]);

  return (
    <div className="card overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 border-b border-line p-3">
        <input className="input max-w-[260px]" placeholder="Prolific ID で検索" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="input w-auto" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="all">すべての状態</option>
          <option value="active">回答中</option>
          <option value="completed">完了</option>
          <option value="dropped">途中離脱</option>
          <option value="screened_out">理解度で終了</option>
          <option value="declined">不同意</option>
        </select>
        <label className="flex items-center gap-2 text-sm text-ink-2">
          <input type="checkbox" checked={hideSim} onChange={(e) => setHideSim(e.target.checked)} /> 仮想参加者を除く
        </label>
        <span className="num ml-auto text-sm text-muted">{list.length.toLocaleString()} 人</span>
      </div>
      <div className="max-h-[70vh] overflow-auto">
        <table className="tbl">
          <thead>
            <tr>
              <th />
              <th>Prolific ID</th>
              <th>状態</th>
              <th>現在の画面</th>
              <th>本試行</th>
              <th>注意力確認</th>
              <th>理解度</th>
              <th>アクセス</th>
              <th>開始</th>
              <th>最終応答</th>
            </tr>
          </thead>
          <tbody>
            {list.slice(0, 300).map((p) => {
              const rows = rowsBy.get(p.pid) ?? [];
              const att = rows.filter((r) => r.phase === "attention").sort((x, y) => (x.seq ?? 0) - (y.seq ?? 0));
              const done = answeredMain(p);
              const isOpen = open === p.pid;
              return (
                <Fragment key={p.pid}>
                  <tr className="cursor-pointer" onClick={() => setOpen(isOpen ? null : p.pid)}>
                    <td className="w-8 text-muted">
                      <IconChevronRight size={14} className={`transition ${isOpen ? "rotate-90" : ""}`} />
                    </td>
                    <td className="font-mono text-xs">
                      {p.pid.slice(0, 14)}…{p.simulated && <span className="pill ml-1.5 bg-[#eef0f4] text-muted">仮想</span>}
                    </td>
                    <td>
                      <StatusPill status={p.status} />
                    </td>
                    <td className="whitespace-nowrap text-xs text-ink-2">{SCREEN_LABELS[p.stage]}</td>
                    <td>
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-20 overflow-hidden rounded-full bg-[#eef0f4]">
                          <div className="h-full rounded-full bg-series" style={{ width: `${p.n ? (done / p.n) * 100 : 0}%` }} />
                        </div>
                        <span className="num text-xs">
                          {done}/{p.n ?? "—"}
                        </span>
                      </div>
                    </td>
                    <td>
                      <span className="flex gap-1">
                        {[0, 1].map((i) =>
                          att[i] ? (
                            <span key={i} className={`grid size-5 place-items-center rounded ${att[i].correct ? "bg-good-50 text-good" : "bg-bad-50 text-bad"}`} title={`${i + 1}問目: ${att[i].response}`}>
                              {att[i].correct ? <IconCheck size={12} /> : <IconX size={12} />}
                            </span>
                          ) : (
                            <span key={i} className="grid size-5 place-items-center rounded bg-[#f3f4f6] text-[10px] text-muted">
                              –
                            </span>
                          ),
                        )}
                      </span>
                    </td>
                    <td className="num text-xs">{p.comprehensionAttempts ? `${p.comprehensionPassed ? "合格" : p.status === "screened_out" ? "不合格" : "—"}（${p.comprehensionAttempts}回）` : "—"}</td>
                    <td className="num text-xs">
                      {p.accessCount}回{p.dropouts.length > 0 && <span className="text-warn"> / 離脱{p.dropouts.length}</span>}
                    </td>
                    <td className="num whitespace-nowrap text-xs">{fmt(p.createdAt)}</td>
                    <td className="whitespace-nowrap text-xs text-muted">{ago(p.lastSeenAt)}</td>
                  </tr>
                  {isOpen && (
                    <tr>
                      <td colSpan={10} className="bg-[#fafbfc]! p-0!">
                        <ParticipantDetail p={p} rows={rows} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
        {list.length === 0 && <p className="py-12 text-center text-sm text-muted">該当する参加者はいません</p>}
        {list.length > 300 && <p className="py-3 text-center text-xs text-muted">先頭 300 人を表示しています（全件は CSV で出力できます）</p>}
      </div>
    </div>
  );
}

function ParticipantDetail({ p, rows }: { p: Participant; rows: DemoState["responses"] }) {
  const forceDrop = () =>
    transact((s) => {
      const q = s.participants[p.pid];
      if (q) dropOut(s, q, "manual");
    });
  return (
    <div className="grid gap-4 p-4 lg:grid-cols-[280px_1fr]">
      <div className="space-y-3 text-xs">
        <dl className="grid grid-cols-[90px_1fr] gap-y-1.5">
          <dt className="text-muted">PROLIFIC_PID</dt>
          <dd className="break-all font-mono">{p.pid}</dd>
          <dt className="text-muted">STUDY_ID</dt>
          <dd className="break-all font-mono">{p.studyId}</dd>
          <dt className="text-muted">SESSION_ID</dt>
          <dd className="break-all font-mono">{p.sessionIds.join(", ")}</dd>
          <dt className="text-muted">完了日時</dt>
          <dd>{fmt(p.completedAt)}</dd>
          <dt className="text-muted">割当（条件別）</dt>
          <dd className="font-mono">{p.quota ? CONDITIONS.map((c) => `${c}${p.quota![c]}`).join(" ") : "—"}</dd>
        </dl>
        {p.dropouts.length > 0 && (
          <div>
            <p className="mb-1 font-semibold text-ink-2">離脱履歴</p>
            <ul className="space-y-1">
              {p.dropouts.map((d, i) => (
                <li key={i} className="rounded-md bg-warn-50 px-2 py-1 text-warn">
                  {fmt(d.at)} {{ back_button: "戻る操作", tab_closed: "タブを閉じた", timeout: "タイムアウト", manual: "管理者操作" }[d.reason]}（{SCREEN_LABELS[d.stage]}・回答済み{" "}
                  {d.answeredMain}・解放 {d.released}）
                </li>
              ))}
            </ul>
          </div>
        )}
        {p.status === "active" && (
          <button className="btn btn-danger btn-sm" onClick={forceDrop}>
            離脱扱いにして未回答を解放
          </button>
        )}
      </div>
      <div className="max-h-80 overflow-auto rounded-lg border border-line bg-white">
        <table className="tbl">
          <thead>
            <tr>
              <th>画面</th>
              <th>設問 / 問題</th>
              <th>回答</th>
              <th>選択画像</th>
              <th>B位置</th>
              <th>正誤</th>
              <th>回答時間</th>
              <th>保存</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="whitespace-nowrap font-mono text-[11px]">{r.screen_id}</td>
                <td className="font-mono text-[11px]">{r.item_id}</td>
                <td className="max-w-[220px] truncate text-xs" title={r.response_text ?? r.response}>
                  {r.response || "（空欄）"}
                  {r.response_text ? ` / ${r.response_text}` : ""}
                </td>
                <td className="font-mono text-[11px]">{r.selected_image_id ?? ""}</td>
                <td className="text-xs">{r.b_side === "left" ? "左" : r.b_side === "right" ? "右" : ""}</td>
                <td className="text-xs">{r.correct === undefined ? "" : r.correct ? "○" : "×"}</td>
                <td className="num text-xs">{r.rt_ms != null ? `${(r.rt_ms / 1000).toFixed(2)}s` : ""}</td>
                <td className="num whitespace-nowrap text-[11px] text-muted">{fmt(r.saved_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && <p className="py-6 text-center text-xs text-muted">まだ回答はありません</p>}
      </div>
    </div>
  );
}

/* ═════════════ Triplets ═════════════ */
export function TripletsPanel({ s }: { s: DemoState }) {
  const [cond, setCond] = useState("all");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<"asc" | "desc" | "id">("asc");
  const [page, setPage] = useState(0);
  const [preview, setPreview] = useState<string | null>(null);
  const [zi, setZi] = useState(0);
  const load = useMemo(() => effectiveLoad(s), [s]);
  const ex = useMemo(() => new Set(s.excluded), [s]);
  const list = useMemo(() => {
    const l = mainTriplets().filter((t) => (cond === "all" ? true : cond === "excluded" ? ex.has(t.triplet_id) : t.condition === cond) && (!q || t.triplet_id.includes(q.trim()) || t.anchor_id.includes(q.trim())));
    const c = (id: string) => s.completedCounts[id] ?? 0;
    if (sort === "asc") l.sort((a, b) => c(a.triplet_id) - c(b.triplet_id));
    if (sort === "desc") l.sort((a, b) => c(b.triplet_id) - c(a.triplet_id));
    return l;
  }, [s, cond, q, sort, ex]);
  const per = 100;
  const pages = Math.max(1, Math.ceil(list.length / per));
  const pg = Math.min(page, pages - 1);
  const pt = preview ? getTriplet(preview) : null;

  return (
    <div className="card overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 border-b border-line p-3">
        <input className="input max-w-[220px]" placeholder="triplet_id / anchor_id" value={q} onChange={(e) => (setQ(e.target.value), setPage(0))} />
        <select className="input w-auto" value={cond} onChange={(e) => (setCond(e.target.value), setPage(0))}>
          <option value="all">全条件</option>
          {CONDITIONS.map((c) => (
            <option key={c} value={c}>
              条件 {c}
            </option>
          ))}
          <option value="excluded">除外中のみ</option>
        </select>
        <select className="input w-auto" value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}>
          <option value="asc">回答数が少ない順</option>
          <option value="desc">回答数が多い順</option>
          <option value="id">CSV の順</option>
        </select>
        <span className="num ml-auto text-sm text-muted">{list.length.toLocaleString()} 問</span>
      </div>
      <div className="max-h-[66vh] overflow-auto">
        <table className="tbl">
          <thead>
            <tr>
              <th>triplet_id</th>
              <th>条件</th>
              <th>anchor_id (A)</th>
              <th>b_id</th>
              <th>c_id</th>
              <th className="text-right">回答数</th>
              <th className="text-right">予約中</th>
              <th>状態</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {list.slice(pg * per, pg * per + per).map((t) => {
              const done = s.completedCounts[t.triplet_id] ?? 0;
              const res = (load.get(t.triplet_id) ?? 0) - done;
              return (
                <tr key={t.triplet_id}>
                  <td className="font-mono text-xs">{t.triplet_id}</td>
                  <td>
                    <span className="grid size-6 place-items-center rounded bg-[#eef0f4] text-xs font-bold">{t.condition}</span>
                  </td>
                  <td className="font-mono text-xs">{t.anchor_id}</td>
                  <td className="font-mono text-xs">{t.b_id}</td>
                  <td className="font-mono text-xs">{t.c_id}</td>
                  <td className="num text-right font-semibold">{done}</td>
                  <td className="num text-right text-muted">{res || ""}</td>
                  <td>{ex.has(t.triplet_id) ? <span className="pill bg-bad-50 text-bad">除外（画像不良）</span> : <span className="pill bg-good-50 text-good">出題対象</span>}</td>
                  <td>
                    <button className="text-xs font-semibold text-brand hover:underline" onClick={() => (setPreview(t.triplet_id), setZi(0))}>
                      画像を表示
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between border-t border-line p-3 text-sm">
        <button className="btn btn-secondary btn-sm" disabled={pg === 0} onClick={() => setPage(pg - 1)}>
          前へ
        </button>
        <span className="num text-muted">
          {pg + 1} / {pages} ページ
        </span>
        <button className="btn btn-secondary btn-sm" disabled={pg >= pages - 1} onClick={() => setPage(pg + 1)}>
          次へ
        </button>
      </div>
      {pt && (
        <ZoomModal
          items={[
            { key: "a", url: imagePath(pt.triplet_id, "a.png"), caption: `A (${pt.anchor_id})` },
            { key: "b", url: imagePath(pt.triplet_id, "b.png"), caption: `B (${pt.b_id})` },
            { key: "c", url: imagePath(pt.triplet_id, "c.png"), caption: `C (${pt.c_id})` },
          ]}
          index={zi}
          onIndex={setZi}
          onClose={() => setPreview(null)}
        />
      )}
    </div>
  );
}

/* ═════════════ Logs ═════════════ */
export function LogsPanel({ s }: { s: DemoState }) {
  return (
    <div className="grid gap-5 xl:grid-cols-[1.2fr_1fr]">
      <Section title="運用ログ" desc="参加・割当・離脱・再割当・完了・管理操作を時系列で記録します（直近 500 件）。">
        <div className="max-h-[70vh] overflow-auto pr-1">
          <EventList s={s} limit={500} />
        </div>
      </Section>
      <Section
        title="画像の読み込みエラー"
        desc="参加者のブラウザで読み込めなかった画像、および取込検証で検出した画像を記録します。"
        right={
          s.imageErrors.length > 0 && (
            <button className="btn btn-secondary btn-sm" onClick={() => transact((x) => ((x.imageErrors = []), log(x, "admin", "画像エラーログをクリアしました")))}>
              クリア
            </button>
          )
        }
      >
        {s.imageErrors.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted">エラーはありません</p>
        ) : (
          <div className="max-h-[66vh] overflow-auto">
            <table className="tbl">
              <thead>
                <tr>
                  <th>日時</th>
                  <th>triplet_id</th>
                  <th>画像</th>
                  <th>検出元</th>
                  <th>内容</th>
                </tr>
              </thead>
              <tbody>
                {s.imageErrors.map((e, i) => (
                  <tr key={i}>
                    <td className="num whitespace-nowrap text-xs">{fmt(e.at)}</td>
                    <td className="font-mono text-xs">{e.triplet_id}</td>
                    <td className="font-mono text-xs">{e.file}</td>
                    <td className="text-xs">{e.source === "participant" ? `参加者 ${e.pid?.slice(0, 8)}…` : "取込検証"}</td>
                    <td className="text-xs text-bad">{e.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </div>
  );
}
