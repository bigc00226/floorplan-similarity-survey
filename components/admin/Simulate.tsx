"use client";
import { useEffect, useMemo, useState } from "react";
import { audit, eligiblePool } from "@/lib/engine";
import { runLiveSimulation, simulateAllocation, type AlgoResult, type LiveProgress } from "@/lib/sim";
import { CONDITIONS, CONDITION_WEIGHTS, type DemoState } from "@/lib/types";
import { IconCheck, IconFlask, IconPlay, IconUsers } from "@/components/icons";
import { ConditionBars, Histogram, Kpi, Section, SpreadChart } from "./charts";

function NumField({ label, value, onChange, min, max, step = 1, suffix }: { label: string; value: number; onChange: (v: number) => void; min: number; max: number; step?: number; suffix?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold text-muted">{label}</span>
      <span className="flex items-center gap-2">
        <input
          type="number"
          className="input w-full"
          value={value}
          min={min}
          max={max}
          step={step}
          onChange={(e) => {
            const v = Number(e.target.value);
            if (!Number.isNaN(v)) onChange(Math.max(min, Math.min(max, v)));
          }}
        />
        {suffix && <span className="flex-none text-sm text-ink-2">{suffix}</span>}
      </span>
    </label>
  );
}

const TOTAL_W = CONDITIONS.reduce((a, c) => a + CONDITION_WEIGHTS[c], 0);

/** 隣り合う 2 つの回答数（差 1 以内）に収まった問題数が最大になる帯 */
function bandOf(res: AlgoResult) {
  let best = { lo: 0, n: 0 };
  for (const h of res.histogram) {
    const n = h.count + (res.histogram.find((x) => x.level === h.level + 1)?.count ?? 0);
    if (n > best.n) best = { lo: h.level, n };
  }
  return best;
}

/* live run survives tab switches inside the admin page */
const liveCtl: { stop: null | (() => void); last: LiveProgress | null; total: number; subs: Set<(p: LiveProgress) => void> } = { stop: null, last: null, total: 0, subs: new Set() };

export function SimulatePanel({ s }: { s: DemoState }) {
  /* ── algorithm verification ── */
  const [ap, setAp] = useState({ participants: 750, n: s.settings.n, concurrency: 40, dropout: 20 });
  const [progress, setProgress] = useState<number | null>(null);
  const [res, setRes] = useState<AlgoResult | null>(null);

  const runAlgo = async () => {
    setProgress(0);
    setRes(null);
    const r = await simulateAllocation(
      { participants: ap.participants, n: ap.n, concurrency: ap.concurrency, dropoutRate: ap.dropout / 100, seed: (Date.now() & 0xffff) + 1, pool: eligiblePool(s) },
      (p) => setProgress(p),
    );
    setRes(r);
    setProgress(null);
  };

  /* ── live virtual participants ── */
  const [lp, setLp] = useState({ count: 30, concurrency: 15, dropout: 20 });
  const [live, setLive] = useState<LiveProgress | null>(liveCtl.last);
  useEffect(() => {
    liveCtl.subs.add(setLive);
    return () => void liveCtl.subs.delete(setLive);
  }, []);
  const startLive = () => {
    liveCtl.total = lp.count;
    liveCtl.stop = runLiveSimulation({ count: lp.count, concurrency: lp.concurrency, dropoutRate: lp.dropout / 100, tickMs: 110 }, (p) => {
      liveCtl.last = p;
      liveCtl.subs.forEach((f) => f(p));
    });
  };
  const a = useMemo(() => audit(s), [s]);
  const simCount = Object.values(s.participants).filter((p) => p.simulated).length;

  const perRound = Math.ceil(a.poolSize / ap.n);

  return (
    <div className="space-y-5">
      <Section
        title={
          <span className="flex items-center gap-2">
            <IconFlask size={17} className="text-brand" /> 割当アルゴリズムの大規模検証
          </span>
        }
        desc="本番と同じ割当ロジックで、多数の参加者が同時並行で回答・途中離脱する状況をメモリ上で再現します（保存データには影響しません）。"
      >
        <div className="grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <NumField label="参加者数" value={ap.participants} min={50} max={3000} step={50} suffix="人" onChange={(v) => setAp({ ...ap, participants: v })} />
          <NumField label="本試行の問題数 N" value={ap.n} min={5} max={120} suffix="問" onChange={(v) => setAp({ ...ap, n: v })} />
          <NumField label="同時回答中の人数" value={ap.concurrency} min={1} max={300} suffix="人" onChange={(v) => setAp({ ...ap, concurrency: v })} />
          <NumField label="途中離脱率" value={ap.dropout} min={0} max={80} suffix="%" onChange={(v) => setAp({ ...ap, dropout: v })} />
          <button className="btn btn-primary" disabled={progress !== null} onClick={runAlgo}>
            {progress !== null ? (
              <>
                <span className="spinner" /> {Math.round(progress * 100)}%
              </>
            ) : (
              <>
                <IconPlay size={15} /> 検証を実行
              </>
            )}
          </button>
        </div>
        <p className="mt-2 text-xs text-muted">
          参考: 出題対象 {a.poolSize.toLocaleString()} 問（画像不良の {s.excluded.length} 問を除外済み）すべてに 1 回ずつ回答が集まるのは、完了者 約 <b className="num">{perRound}</b> 人ごと（N={ap.n}）。参加者 {ap.participants} 人では 1 問あたり 約{" "}
          <b className="num">{((ap.participants * (1 - ap.dropout / 100) * ap.n) / a.poolSize).toFixed(1)}</b> 回答（離脱者の回答済み分を除く概算）。
        </p>

        {res && (
          <div className="fade-up mt-5 space-y-5 border-t border-line pt-5">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
              <Kpi label="完了 / 離脱" value={`${res.completed} / ${res.dropped}`} sub={`解放→再割当 ${res.released.toLocaleString()} 問`} />
              <Kpi label="問題あたり回答数" value={`${res.min}〜${res.max}`} sub={`平均 ${res.mean.toFixed(2)} / 標準偏差 ${res.sd.toFixed(2)}`} tone="good" />
              <Kpi label="実行中の負荷の差（最大）" value={res.maxSpreadAfterWarmup} sub="回答済み＋予約中で比較" tone={res.maxSpreadAfterWarmup <= 1 ? "good" : "warn"} />
              <Kpi label="条件比率どおりの参加者" value={`${((res.quotaExact / res.quotaTotal) * 100).toFixed(1)}%`} sub={`${res.quotaExact} / ${res.quotaTotal} 人`} />
              <Kpi label="同一問題の重複出題" value={res.duplicates} sub="参加者内" tone={res.duplicates === 0 ? "good" : "bad"} />
              <Kpi label="基準 A の重複があった人" value={res.anchorRepeatParticipants} sub={`${((res.anchorRepeatParticipants / res.quotaTotal) * 100).toFixed(1)}%（計算 ${Math.round(res.ms)} ms）`} />
            </div>
            <div className="grid gap-5 xl:grid-cols-2">
              <div>
                <p className="mb-2 text-sm font-semibold">最終的な回答数の分布（出題対象 {res.poolSize.toLocaleString()} 問）</p>
                <Histogram data={res.histogram} />
                <p className="mt-2 text-xs leading-relaxed text-muted">
                  回答数が <b className="num text-ink">{bandOf(res).lo}〜{bandOf(res).lo + 1} 件</b>（差 1 以内）に収まった問題:{" "}
                  <b className="num text-ink">{bandOf(res).n.toLocaleString()}</b> 問（{((bandOf(res).n / res.poolSize) * 100).toFixed(1)}%）。平均が {res.mean.toFixed(2)}{" "}
                  件のため、2 つの値に分かれるのは均等化が働いている状態です。範囲外のごく少数は、調査終盤に離脱した参加者の未回答分が解放されたもので、追加募集で埋まります。
                </p>
              </div>
              <div>
                <p className="mb-2 text-sm font-semibold">参加者が増えるにつれての回答数の推移</p>
                <SpreadChart series={res.series} />
              </div>
            </div>
            <div>
              <p className="mb-2 text-sm font-semibold">条件別の出題割合（目標 2:1:1:2:1:1:2 = 20% / 10%）</p>
              <ConditionBars
                rows={CONDITIONS.map((c) => ({
                  key: c,
                  value: res.conditionShare[c],
                  label: `${(res.conditionShare[c] * 100).toFixed(2)}%`,
                  target: `${((CONDITION_WEIGHTS[c] / TOTAL_W) * 100).toFixed(0)}%`,
                }))}
              />
            </div>
            <div className="rounded-xl bg-good-50 p-4 text-sm leading-relaxed text-[#0b5a36]">
              <p className="flex items-center gap-2 font-semibold">
                <IconCheck size={16} /> 検証結果のまとめ
              </p>
              <p className="mt-1">
                参加者 {res.started} 人（離脱 {res.dropped} 人）を同時 {res.params.concurrency} 人で処理し、回答中も含めた各問題の負荷の差は最大 {res.maxSpreadAfterWarmup}
                に保たれ、最終的に出題対象 {res.poolSize.toLocaleString()} 問の {((bandOf(res).n / res.poolSize) * 100).toFixed(1)}% が回答数の差 1 以内に収まりました。条件別の出題割合は目標比率と ±{(Math.max(...CONDITIONS.map((c) => Math.abs(res.conditionShare[c] - CONDITION_WEIGHTS[c] / TOTAL_W))) * 100).toFixed(2)}
                ポイント以内、同一参加者への重複出題は {res.duplicates} 件です。
              </p>
            </div>
          </div>
        )}
      </Section>

      <Section
        title={
          <span className="flex items-center gap-2">
            <IconUsers size={17} className="text-brand" /> 仮想参加者による同時アクセス・テスト
          </span>
        }
        desc="仮想の参加者が実際のデモ環境（保存データ）に対して、同意 → 理解度確認 → 練習 → 本試行 → 事後質問 → 完了 までを同時並行で実行します。一部はタブを閉じる／応答が途絶える形で離脱します。他のタブ（ダッシュボード・参加者一覧）にもリアルタイムで反映されます。"
      >
        <div className="grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <NumField label="仮想参加者の人数" value={lp.count} min={1} max={60} suffix="人" onChange={(v) => setLp({ ...lp, count: v })} />
          <NumField label="同時アクセス数" value={lp.concurrency} min={1} max={30} suffix="人" onChange={(v) => setLp({ ...lp, concurrency: v })} />
          <NumField label="途中離脱率" value={lp.dropout} min={0} max={80} suffix="%" onChange={(v) => setLp({ ...lp, dropout: v })} />
          {live?.running ? (
            <button className="btn btn-danger" onClick={() => liveCtl.stop?.()}>
              停止
            </button>
          ) : (
            <button className="btn btn-primary" onClick={startLive}>
              <IconPlay size={15} /> 実行
            </button>
          )}
        </div>
        {live && (
          <div className="mt-4">
            <div className="h-2 overflow-hidden rounded-full bg-[#eef0f4]">
              <div className="h-full bg-brand transition-[width] duration-300" style={{ width: `${(live.finished / Math.max(1, liveCtl.total || lp.count)) * 100}%` }} />
            </div>
            <div className="num mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm text-ink-2">
              <span>
                開始 <b className="text-ink">{live.spawned}</b>
              </span>
              <span>
                回答中 <b className="text-ink">{live.inflight}</b>
              </span>
              <span>
                完了 <b className="text-good">{live.completed}</b>
              </span>
              <span>
                離脱 <b className="text-warn">{live.dropped}</b>
              </span>
              <span>
                理解度で終了 <b className="text-bad">{live.screenedOut}</b>
              </span>
              {!live.running && <span className="font-semibold text-good">✓ 終了</span>}
            </div>
          </div>
        )}
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Kpi label="保存データ上の参加者" value={a.participants} sub={`うち仮想 ${simCount} 人`} />
          <Kpi label="本試行の回答（保存済み）" value={a.mainResponses.toLocaleString()} sub={`予約中 ${a.reserved} 問`} />
          <Kpi label="負荷（回答＋予約）の差" value={a.loadMax - a.loadMin} tone={a.loadMax - a.loadMin <= 1 ? "good" : "warn"} sub="均等化の状態" />
          <Kpi label="重複出題 / 集計不一致" value={`${a.duplicateAssignments} / ${a.countMismatches}`} tone={a.duplicateAssignments + a.countMismatches === 0 ? "good" : "bad"} sub="整合性チェック" />
        </div>
        <p className="mt-3 text-xs leading-relaxed text-muted">
          「応答が途絶える」離脱は、設定したタイムアウト（現在 {s.settings.leaseMinutes} 分）経過後に自動で検知され、未回答問題が解放されます（デモでは時刻を進めて即時に再現しています）。
          割当はすべて排他ロック内で行うため、同時アクセスでも同じ割当枠が二重に使われることはありません。
        </p>
      </Section>
    </div>
  );
}
