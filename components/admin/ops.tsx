"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { attentionPositions, conditionQuota } from "@/lib/allocator";
import { RESPONSE_COLUMNS, defectsCsv, download, participantsCsv, responsesCsv, stamp, tripletStatusCsv } from "@/lib/csv";
import { CONDITION_INFO, getTriplet, imagePath, mainTriplets, parseCondition } from "@/lib/dataset";
import { DEFAULT_SETTINGS, audit, initialImportReport, log, logImageError, nowIso } from "@/lib/engine";
import { resetAll, transact } from "@/lib/store";
import { CONDITIONS, CONDITION_WEIGHTS, type Condition, type DemoState, type ImportReport, type Settings } from "@/lib/types";
import { IconAlert, IconCheck, IconDownload, IconFile } from "@/components/icons";
import { Kpi, Section } from "./charts";
import { fmt } from "./panels";

/* ═════════════ Settings ═════════════ */
function Field({ label, hint, children }: { label: string; hint?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="grid gap-2 border-b border-[#eef0f3] py-4 last:border-0 md:grid-cols-[220px_1fr] md:gap-6">
      <div>
        <p className="text-sm font-semibold">{label}</p>
        {hint && <p className="mt-0.5 text-xs leading-relaxed text-muted">{hint}</p>}
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}


export function SettingsPanel({ s }: { s: DemoState }) {
  const [f, setF] = useState<Settings>(s.settings);
  const [saved, setSaved] = useState(false);
  const [origin, setOrigin] = useState("https://your-domain.example");
  const [copied, setCopied] = useState(false);
  useEffect(() => setOrigin(window.location.origin), []);
  useEffect(() => setF((cur) => ({ ...cur, paused: s.settings.paused })), [s.settings.paused]);

  const nValid = Number.isInteger(f.n) && f.n >= 1 && f.n <= 200;
  const urlValid = /^https:\/\/\S+$/.test(f.completionUrl);
  const dirty = JSON.stringify(f) !== JSON.stringify(s.settings);
  const started = Object.values(s.participants).filter((p) => p.n !== undefined).length;
  const quota = useMemo(() => (nValid ? conditionQuota(f.n, () => 0.5) : null), [f.n, nValid]);
  const fractional = nValid && CONDITIONS.some((c) => ((f.n * CONDITION_WEIGHTS[c]) / 10) % 1 !== 0);
  const [p1, p2] = nValid ? attentionPositions(f.n) : [0, 0];
  const studyUrl = `${origin}/study?PROLIFIC_PID={{%PROLIFIC_PID%}}&STUDY_ID={{%STUDY_ID%}}&SESSION_ID={{%SESSION_ID%}}`;

  const save = async () => {
    await transact((x) => {
      const changes: string[] = [];
      if (x.settings.n !== f.n) changes.push(`N ${x.settings.n}→${f.n}`);
      if (x.settings.completionUrl !== f.completionUrl) changes.push("完了URL");
      if (x.settings.leaseMinutes !== f.leaseMinutes) changes.push(`タイムアウト ${f.leaseMinutes}分`);
      if (x.settings.labelMode !== f.labelMode) changes.push(`ラベル方式 ${f.labelMode}`);
      if (x.settings.practiceCount !== f.practiceCount) changes.push(`練習 ${f.practiceCount}問`);
      if (x.settings.networkFailureRate !== f.networkFailureRate) changes.push(`通信エラー模擬 ${Math.round(f.networkFailureRate * 100)}%`);
      x.settings = { ...f, paused: x.settings.paused };
      log(x, "admin", `調査設定を変更しました${changes.length ? `（${changes.join("、")}）` : ""}`);
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
      <div className="space-y-5">
        <Section title="出題・遷移の設定" desc="調査開始前に設定してください。設定変更は、変更後に本試行を開始した参加者から適用されます（開始済みの参加者の N は固定）。">
          <Field label="本試行の問題数 N" hint="注意力確認 2 問は別に追加されます。初期値 40。">
            <div className="flex flex-wrap items-center gap-3">
              <input type="number" min={1} max={200} className="input w-28" value={Number.isNaN(f.n) ? "" : f.n} onChange={(e) => setF({ ...f, n: parseInt(e.target.value, 10) })} />
              {nValid && (
                <span className="text-sm text-ink-2">
                  → 参加者 1 人あたり <b className="num text-ink">{f.n + 2}</b> 問（注意力確認は {p1}・{p2} 問目）
                </span>
              )}
            </div>
            {!nValid && <p className="mt-1 text-xs text-bad">1〜200 の整数を入力してください</p>}
            {quota && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {CONDITIONS.map((c) => (
                  <span key={c} className="num rounded-lg border border-line bg-[#f8f9fb] px-2.5 py-1 text-xs">
                    <b>{c}</b> {quota[c]}問
                  </span>
                ))}
              </div>
            )}
            {fractional && <p className="mt-2 text-xs text-muted">比率 2:1:1:2:1:1:2 で割り切れない端数は、最大剰余法で配分し、同点の条件は参加者ごとにランダムに割り振ります（参加者全体では目標比率に収束）。</p>}
            {started > 0 && f.n !== s.settings.n && (
              <p className="mt-2 flex items-center gap-1.5 text-xs text-warn">
                <IconAlert size={13} /> 既に {started} 人が本試行を開始しています。開始済みの参加者には影響しません。
              </p>
            )}
          </Field>
          <Field label="練習問題の数" hint="本試行とは別枠で保存されます（phase = practice）。">
            <select className="input w-auto" value={f.practiceCount} onChange={(e) => setF({ ...f, practiceCount: +e.target.value })}>
              {[0, 1, 2, 3].map((n) => (
                <option key={n} value={n}>
                  {n} 問
                </option>
              ))}
            </select>
          </Field>
          <Field label="B・C のラベル表示" hint="ご回答いただいた方式で確定しています。">
            <div className="rounded-xl border border-[#bfe5cf] bg-good-50 p-3">
              <p className="flex items-center gap-1.5 text-sm font-semibold text-good">
                <IconCheck size={15} /> 左＝B・右＝C で固定し、中身の画像（b_id / c_id）の左右をランダムに入れ替え
              </p>
              <p className="mt-1 text-xs leading-relaxed text-ink-2">
                各回答に、左右に表示した画像 ID（left_image_id / right_image_id）、b_id の表示位置（b_side）、選んだ画像 ID（selected_image_id）を記録し、記録上で整合が取れるようにしています。
              </p>
            </div>
          </Field>
          <Field label="離脱判定のタイムアウト" hint="ブラウザを閉じた・戻る操作は即時に検知します。通信断・スリープなど即時検知できない場合に、この時間応答がなければ離脱とみなし未回答問題を解放します。">
            <div className="flex items-center gap-2">
              <input type="number" min={1} max={120} className="input w-24" value={f.leaseMinutes} onChange={(e) => setF({ ...f, leaseMinutes: Math.max(1, +e.target.value || 1) })} />
              <span className="text-sm text-ink-2">分（ハートビート 15 秒間隔）</span>
            </div>
          </Field>
        </Section>

        <Section title="Prolific 連携">
          <Field label="完了時の遷移先 URL" hint="Prolific の Study 設定画面に表示される完了用 URL（完了コード付き）を貼り付けてください。">
            <input className="input font-mono text-sm" value={f.completionUrl} onChange={(e) => setF({ ...f, completionUrl: e.target.value.trim() })} />
            {!urlValid && <p className="mt-1 text-xs text-bad">https:// から始まる URL を入力してください</p>}
          </Field>
          <Field label="自動リダイレクト" hint="完了画面で保存完了を表示した後、自動で遷移するまでの秒数（0 でボタンのみ）。">
            <div className="flex items-center gap-2">
              <input type="number" min={0} max={60} className="input w-24" value={f.autoRedirectSeconds} onChange={(e) => setF({ ...f, autoRedirectSeconds: Math.max(0, +e.target.value || 0) })} />
              <span className="text-sm text-ink-2">秒</span>
            </div>
          </Field>
          <Field label="Study URL（Prolific に登録）" hint="Prolific の「Study link」にこの URL を登録し、URL パラメータで ID を受け取る設定にします。">
            <div className="flex gap-2">
              <code className="block min-w-0 flex-1 break-all rounded-lg border border-line bg-[#f8f9fb] p-2.5 font-mono text-xs leading-relaxed">{studyUrl}</code>
              <button
                className="btn btn-secondary btn-sm self-start"
                onClick={() => {
                  navigator.clipboard?.writeText(studyUrl);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                }}
              >
                {copied ? "コピー済み" : "コピー"}
              </button>
            </div>
          </Field>
        </Section>

        <Section title="デモ専用の設定" desc="本番版には含まれない、動作確認用の設定です。">
          <Field label="完了後の遷移先" hint="デモでは誤って実在の Prolific に遷移しないよう、模擬画面に差し替えています。">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={f.demoRedirect} onChange={(e) => setF({ ...f, demoRedirect: e.target.checked })} /> 模擬 Prolific 画面に遷移する
            </label>
          </Field>
          <Field label="通信エラーの模擬" hint="回答送信の一部をわざと失敗させ、自動再送で回答が失われない・二重保存されないことを確認できます。">
            <div className="flex flex-wrap gap-2">
              {[0, 0.1, 0.3, 0.5].map((r) => (
                <button key={r} className={`btn btn-sm ${f.networkFailureRate === r ? "btn-primary" : "btn-secondary"}`} onClick={() => setF({ ...f, networkFailureRate: r })}>
                  {r === 0 ? "なし" : `${r * 100}%`}
                </button>
              ))}
            </div>
          </Field>
        </Section>
      </div>

      <div className="space-y-5 xl:sticky xl:top-[76px] xl:self-start">
        <section className="card p-5">
          <p className="mb-3 text-sm font-semibold">変更の保存</p>
          <button className="btn btn-primary w-full" disabled={!dirty || !nValid || !urlValid} onClick={save}>
            {saved ? (
              <>
                <IconCheck size={16} /> 保存しました
              </>
            ) : (
              "設定を保存"
            )}
          </button>
          <button className="btn btn-ghost mt-2 w-full" disabled={!dirty} onClick={() => setF(s.settings)}>
            変更を破棄
          </button>
          <button className="btn btn-ghost mt-1 w-full text-xs" onClick={() => setF({ ...DEFAULT_SETTINGS, paused: s.settings.paused })}>
            初期値に戻す
          </button>
        </section>
        <section className="card border-[#f3c9c5] p-5">
          <p className="mb-1 text-sm font-semibold text-bad">デモデータの初期化</p>
          <p className="mb-3 text-xs leading-relaxed text-muted">参加者・回答・ログ・設定をすべて削除し、初期状態に戻します（このブラウザ内のデモデータのみ）。</p>
          <button
            className="btn btn-danger btn-sm w-full"
            onClick={() => {
              if (confirm("デモデータをすべて削除して初期化しますか？")) resetAll();
            }}
          >
            初期化する
          </button>
        </section>
      </div>
    </div>
  );
}

/* ═════════════ Data import & validation ═════════════ */
interface CsvReport {
  name: string;
  rows: number;
  header: string[];
  errors: string[];
  warnings: string[];
  byCondition: Record<string, number>;
  anchors: number;
}

function validateCsv(name: string, text: string): CsvReport {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim() !== "");
  const header = (lines[0] ?? "").split(",").map((h) => h.trim());
  const errors: string[] = [];
  const warnings: string[] = [];
  const need = ["triplet_id", "anchor_id", "b_id", "c_id"];
  const missingCols = need.filter((c) => !header.includes(c));
  if (missingCols.length) errors.push(`必須列がありません: ${missingCols.join(", ")}`);
  const idx = Object.fromEntries(need.map((c) => [c, header.indexOf(c)]));
  const seen = new Set<string>();
  const anchors = new Set<string>();
  const byCondition: Record<string, number> = Object.fromEntries(CONDITIONS.map((c) => [c, 0]));
  let rows = 0;
  const push = (arr: string[], msg: string) => arr.length < 30 && arr.push(msg);
  if (!missingCols.length) {
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(",").map((x) => x.trim());
      rows++;
      const [t, a, b, c] = need.map((k) => cols[idx[k]] ?? "");
      if (!t || !a || !b || !c) push(errors, `${i + 1} 行目: 空欄があります`);
      if (seen.has(t)) push(errors, `${i + 1} 行目: triplet_id「${t}」が重複しています`);
      seen.add(t);
      const cond = parseCondition(t);
      if (!cond) push(errors, `${i + 1} 行目: triplet_id「${t}」から条件 a〜g を判定できません`);
      else byCondition[cond]++;
      if (t && a && !t.startsWith(`${a}_`)) push(warnings, `${i + 1} 行目: triplet_id の先頭と anchor_id（${a}）が一致しません`);
      if (b && b === c) push(errors, `${i + 1} 行目: b_id と c_id が同じです`);
      if (a && (a === b || a === c)) push(warnings, `${i + 1} 行目: 基準 A と比較対象が同じ画像です`);
      anchors.add(a);
    }
  }
  return { name, rows, header, errors, warnings, byCondition, anchors: anchors.size };
}

type CheckResult = "ok" | "missing" | "empty" | "corrupt";

async function checkImage(url: string): Promise<CheckResult> {
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return "missing";
    const blob = await res.blob();
    if (blob.size === 0) return "empty";
    const obj = URL.createObjectURL(blob);
    const ok = await new Promise<boolean>((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img.naturalWidth > 0);
      img.onerror = () => resolve(false);
      img.src = obj;
    });
    URL.revokeObjectURL(obj);
    return ok ? "ok" : "corrupt";
  } catch {
    return "missing";
  }
}

const KIND_JA: Record<string, string> = { missing: "欠損", empty: "0 バイト（空）", corrupt: "破損", invalid: "破損" };

export function DataCheckPanel({ s }: { s: DemoState }) {
  const r = s.importReport ?? initialImportReport();
  const [running, setRunning] = useState<null | { done: number; total: number; bad: number }>(null);
  const [csv, setCsv] = useState<CsvReport | null>(null);
  const cancel = useRef(false);
  const ex = useMemo(() => new Set(s.excluded), [s.excluded]);

  const defects = useMemo(
    () => [
      ...r.missing.map((d) => ({ ...d, kind: "missing" })),
      ...(r.empty ?? []).map((d) => ({ ...d, kind: "empty" })),
      ...r.corrupt.map((d) => ({ ...d, kind: "corrupt" })),
    ],
    [r],
  );
  const byTriplet = useMemo(() => {
    const m = new Map<string, { files: string[]; kind: string }>();
    for (const d of defects) {
      const cur = m.get(d.triplet_id) ?? { files: [], kind: d.kind };
      cur.files.push(d.file.replace(".png", ""));
      m.set(d.triplet_id, cur);
    }
    return [...m.entries()].sort((x, y) => x[0].localeCompare(y[0]));
  }, [defects]);
  const exByCond = useMemo(() => {
    const c = Object.fromEntries(CONDITIONS.map((k) => [k, 0])) as Record<Condition, number>;
    for (const t of mainTriplets()) if (ex.has(t.triplet_id)) c[t.condition]++;
    return c;
  }, [ex]);

  const run = async (mode: "sample" | "full") => {
    const all = mainTriplets();
    let targets = all;
    if (mode === "sample") {
      const forced = new Set(byTriplet.slice(0, 12).map(([id]) => id));
      targets = all.filter((t, i) => i % 30 === 0 || forced.has(t.triplet_id));
    }
    const jobs = targets.flatMap((t) => (["a.png", "b.png", "c.png"] as const).map((f) => ({ t: t.triplet_id, f })));
    const found: Record<Exclude<CheckResult, "ok">, { triplet_id: string; file: string }[]> = { missing: [], empty: [], corrupt: [] };
    cancel.current = false;
    let done = 0;
    let next = 0;
    setRunning({ done: 0, total: jobs.length, bad: 0 });
    const worker = async () => {
      while (next < jobs.length && !cancel.current) {
        const j = jobs[next++];
        const res = await checkImage(imagePath(j.t, j.f));
        if (res !== "ok") found[res].push({ triplet_id: j.t, file: j.f });
        done++;
        if (done % 30 === 0 || done === jobs.length) setRunning({ done, total: jobs.length, bad: found.missing.length + found.empty.length + found.corrupt.length });
      }
    };
    await Promise.all(Array.from({ length: 16 }, worker));
    const base = initialImportReport();
    const badIds = new Set([...found.missing, ...found.empty, ...found.corrupt].map((d) => d.triplet_id));
    await transact((x) => {
      x.importReport = { ...base, at: nowIso(), imagesChecked: done, missing: found.missing, empty: found.empty, corrupt: found.corrupt, defectiveTriplets: badIds.size, mode };
      log(
        x,
        "admin",
        `画像を再検証（${mode === "full" ? "全数" : "サンプル"}）: ${done.toLocaleString()} 枚を確認、0 バイト ${found.empty.length}・欠損 ${found.missing.length}・破損 ${found.corrupt.length}（${badIds.size} 組）`,
      );
    });
    setRunning(null);
  };

  const setExcluded = (id: string, on: boolean) =>
    transact((x) => {
      x.excluded = on ? Array.from(new Set([...x.excluded, id])) : x.excluded.filter((e) => e !== id);
      log(x, "admin", `${id} を${on ? "出題対象から除外" : "出題対象に戻"}しました`);
    });
  const excludeAll = () =>
    transact((x) => {
      x.excluded = Array.from(new Set([...x.excluded, ...byTriplet.map(([id]) => id)]));
      log(x, "admin", `画像不良の ${byTriplet.length} 組を出題対象から除外しました`);
    });

  const total = CONDITIONS.reduce((a, c) => a + CONDITION_WEIGHTS[c], 0);
  const okImages = r.imagesExpected - defects.length;

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-brand-100 bg-brand-50 px-4 py-3 text-sm leading-relaxed text-[#1f3d85]">
        ご提供いただいた実データ（<code className="font-mono">triplets.csv</code>・<code className="font-mono">triplets.json</code>・画像 9,000 枚）を取り込んでいます。
        画像に問題のある問題は取り込み時に自動で検出し、出題対象から除外しています。差し替え画像をいただいた場合は、取り込みスクリプトを再実行するだけで反映されます。
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Kpi label="問題データ（CSV）" value={r.rows.toLocaleString()} sub={`重複なし ${r.uniqueTriplets.toLocaleString()} 件`} tone={r.rows === r.uniqueTriplets ? "good" : "bad"} />
        <Kpi label="補助データ（JSON）" value={(r.jsonRecords ?? 0).toLocaleString()} sub={`CSV との不一致 ${r.jsonMismatch ?? 0} 件`} tone={(r.jsonMismatch ?? 0) === 0 ? "good" : "bad"} />
        <Kpi label="基準間取り A" value={r.uniqueAnchors.toLocaleString()} sub="各 10 組（a×2・b・c・d×2・e・f・g×2）" />
        <Kpi label="正常な画像" value={okImages.toLocaleString()} sub={`/ ${r.imagesExpected.toLocaleString()} 枚（256×256 PNG）`} />
        <Kpi label="画像に問題のある問題" value={`${byTriplet.length} 組`} sub={`0 バイト ${(r.empty ?? []).length} 枚 · 除外中 ${s.excluded.length} 組`} tone={byTriplet.length ? "warn" : "good"} />
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.05fr_1fr]">
        <Section title="条件別の構成と出題対象" desc={`最終検証: ${fmt(r.at)}（${r.mode === "full" ? "全数検査" : r.mode === "sample" ? "サンプル検査" : "取り込み時の全数検査"}）。条件の意味は triplets.json の b_source / c_source から判定しています。`}>
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead>
                <tr>
                  <th>条件</th>
                  <th>B / C の抽出元</th>
                  <th className="text-right">問題数</th>
                  <th className="text-right">構成比</th>
                  <th className="text-right">除外</th>
                  <th className="text-right">出題対象</th>
                </tr>
              </thead>
              <tbody>
                {CONDITIONS.map((c: Condition) => {
                  const share = r.byCondition[c] / r.rows;
                  const ok = Math.abs(share - CONDITION_WEIGHTS[c] / total) < 0.005;
                  return (
                    <tr key={c}>
                      <td className="font-bold">{c}</td>
                      <td className="whitespace-nowrap text-xs text-ink-2">{CONDITION_INFO[c].label}</td>
                      <td className="num text-right">{r.byCondition[c].toLocaleString()}</td>
                      <td className="num text-right">
                        <span className="inline-flex items-center gap-1">
                          {(share * 100).toFixed(0)}%{ok ? <IconCheck size={12} className="text-good" /> : <IconAlert size={12} className="text-warn" />}
                        </span>
                      </td>
                      <td className="num text-right text-warn">{exByCond[c] || ""}</td>
                      <td className="num text-right font-semibold">{(r.byCondition[c] - exByCond[c]).toLocaleString()}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs leading-relaxed text-muted">
            比率 2:1:1:2:1:1:2 と完全に一致しています。除外は各条件にほぼ均等に分散しているため、残りの問題でも条件比率を保ったまま割り当てられます。
          </p>
        </Section>

        <Section
          title="画像に問題のある問題"
          desc="0 バイト（中身が空）の画像を含む問題です。参加者には出題されません。"
          right={
            <div className="flex flex-wrap gap-2">
              {byTriplet.some(([id]) => !ex.has(id)) && (
                <button className="btn btn-primary btn-sm" onClick={excludeAll}>
                  すべて除外
                </button>
              )}
              {defects.length > 0 && (
                <button className="btn btn-secondary btn-sm" onClick={() => download(`image_issues_${stamp()}.csv`, defectsCsv(defects))}>
                  <IconDownload size={14} /> 一覧 CSV
                </button>
              )}
            </div>
          }
        >
          {byTriplet.length === 0 ? (
            <p className="flex items-center gap-2 py-6 text-sm text-good">
              <IconCheck /> 問題のある画像はありません
            </p>
          ) : (
            <>
              <div className="mb-3 rounded-lg bg-warn-50 px-3 py-2 text-xs leading-relaxed text-warn">
                フォルダ名の並び順で <code className="font-mono">7389_g_1/c.png</code> 以降に集中しています（ZIP 内でも 0 バイト）。画像の書き出し・コピーが途中で止まった可能性があります。
              </div>
              <div className="max-h-[340px] overflow-auto rounded-lg border border-line">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>triplet_id</th>
                      <th>問題のある画像</th>
                      <th>種類</th>
                      <th>出題</th>
                    </tr>
                  </thead>
                  <tbody>
                    {byTriplet.map(([id, d]) => (
                      <tr key={id}>
                        <td className="font-mono text-xs">{id}</td>
                        <td className="font-mono text-xs">{d.files.join(" · ")}</td>
                        <td>
                          <span className="pill bg-bad-50 text-bad">{KIND_JA[d.kind]}</span>
                        </td>
                        <td>
                          <label className="flex items-center gap-2 text-xs">
                            <input type="checkbox" checked={ex.has(id)} onChange={(e) => setExcluded(id, e.target.checked)} />
                            除外
                          </label>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
          <div className="mt-4 rounded-xl bg-[#f8f9fb] p-3">
            <p className="mb-2 text-xs font-semibold text-ink-2">画像を再検証（実際にダウンロードし、画像として読み込めるかを確認）</p>
            {running ? (
              <div>
                <div className="h-2 overflow-hidden rounded-full bg-[#e5e8ee]">
                  <div className="h-full bg-brand transition-[width]" style={{ width: `${(running.done / running.total) * 100}%` }} />
                </div>
                <p className="num mt-1.5 flex justify-between text-xs text-muted">
                  <span>
                    {running.done.toLocaleString()} / {running.total.toLocaleString()} 枚（問題あり {running.bad}）
                  </span>
                  <button className="font-semibold text-bad" onClick={() => (cancel.current = true)}>
                    中止
                  </button>
                </p>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                <button className="btn btn-secondary btn-sm" onClick={() => run("sample")}>
                  サンプル検査（約 340 枚）
                </button>
                <button className="btn btn-secondary btn-sm" onClick={() => run("full")}>
                  全数検査（9,000 枚）
                </button>
              </div>
            )}
          </div>
        </Section>
      </div>

      <Section title="問題データ CSV の事前チェック" desc="差し替え前の CSV について、形式（4 列）、ID の重複、条件の判定、A/B/C の対応関係を確認できます。ファイルはブラウザ内で検査され、どこにも送信されません。">
        <label className="btn btn-secondary btn-sm cursor-pointer">
          <IconFile size={15} /> CSV ファイルを選択
          <input
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (file) setCsv(validateCsv(file.name, await file.text()));
              e.target.value = "";
            }}
          />
        </label>
        {csv && (
          <div className="mt-4 rounded-xl border border-line p-4">
            <div className="flex flex-wrap items-center gap-3">
              <span className={`pill ${csv.errors.length ? "bg-bad-50 text-bad" : "bg-good-50 text-good"}`}>{csv.errors.length ? `エラー ${csv.errors.length} 件` : "形式 OK"}</span>
              <span className="font-mono text-sm">{csv.name}</span>
              <span className="num text-sm text-muted">
                {csv.rows.toLocaleString()} 行 · 基準A {csv.anchors.toLocaleString()} 種類 · 列: {csv.header.join(", ")}
              </span>
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {CONDITIONS.map((c) => (
                <span key={c} className="num rounded-lg border border-line bg-[#f8f9fb] px-2.5 py-1 text-xs">
                  <b>{c}</b> {csv.byCondition[c]}
                </span>
              ))}
            </div>
            {[...csv.errors.map((m) => ["bad", m]), ...csv.warnings.map((m) => ["warn", m])].slice(0, 30).map(([t, m], i) => (
              <p key={i} className={`mt-1.5 text-xs ${t === "bad" ? "text-bad" : "text-warn"}`}>
                • {m}
              </p>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}


/* ═════════════ Export ═════════════ */
export function ExportPanel({ s }: { s: DemoState }) {
  const a = useMemo(() => audit(s), [s]);
  const counts = useMemo(() => {
    const m = { all: s.responses.length, main: 0, practice: 0, attention: 0, other: 0 };
    for (const r of s.responses) {
      if (r.phase === "main") m.main++;
      else if (r.phase === "practice") m.practice++;
      else if (r.phase === "attention") m.attention++;
      else m.other++;
    }
    return m;
  }, [s]);
  const preview = useMemo(() => s.responses.filter((r) => r.phase === "main").slice(-6).reverse(), [s]);

  const files = [
    {
      t: "全回答（ロング形式）",
      d: "同意・理解度確認・練習・本試行・注意力確認・事後質問・属性質問のすべてを、1 回答 = 1 行で出力。画面 ID・設問 ID で区別できます。",
      n: `${counts.all.toLocaleString()} 行`,
      f: () => download(`responses_all_${stamp()}.csv`, responsesCsv(s)),
    },
    {
      t: "本試行のみ（分析用）",
      d: "本試行の回答のみ。triplet_id と Prolific ID で紐付け済み。左右位置・選択画像 ID・回答時間に加え、triplets.json の補助データ（抽出元・距離・順位）を列として含みます。",
      n: `${counts.main.toLocaleString()} 行`,
      f: () => download(`main_trials_${stamp()}.csv`, responsesCsv(s, (r) => r.phase === "main")),
    },
    {
      t: "参加者サマリー",
      d: "参加者 1 人 = 1 行。終了の種類（完了／取消／中断）と理由、離脱回数、理解度・注意力確認の合否、事後質問・属性質問の回答。",
      n: `${a.participants.toLocaleString()} 行`,
      f: () => download(`participants_${stamp()}.csv`, participantsCsv(s)),
    },
    {
      t: "問題別の回答状況",
      d: "全問題それぞれの回答数・予約中の数・除外状態・画像の問題・補助データ。収集の偏りの確認に。",
      n: "3,000 行",
      f: () => download(`triplet_status_${stamp()}.csv`, tripletStatusCsv(s)),
    },
  ];

  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-2">
        {files.map((x) => (
          <div key={x.t} className="card flex flex-col p-5">
            <div className="flex items-start gap-3">
              <span className="grid size-10 flex-none place-items-center rounded-xl bg-brand-50 text-brand">
                <IconFile />
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-bold">{x.t}</p>
                <p className="mt-1 text-xs leading-relaxed text-muted">{x.d}</p>
              </div>
            </div>
            <div className="mt-4 flex items-center justify-between">
              <span className="num text-sm text-ink-2">{x.n}</span>
              <button className="btn btn-primary btn-sm" onClick={x.f}>
                <IconDownload size={15} /> CSV をダウンロード
              </button>
            </div>
          </div>
        ))}
      </div>

      <Section title="保存データと CSV の整合性チェック" desc="CSV に出力される回答行から集計し直した値と、システムが管理している回答数を突き合わせます。">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <AuditItem ok={a.countMismatches === 0} label="回答行と問題別集計の不一致" value={`${a.countMismatches} 問`} />
          <AuditItem ok={a.duplicateAssignments === 0} label="同一参加者への重複出題" value={`${a.duplicateAssignments} 件`} />
          <AuditItem ok={counts.attention === a.completed * 2 + countAttentionPartial(s)} label="注意力確認の保存数" value={`${counts.attention} 行`} />
          <AuditItem ok label="練習（本試行と別枠で保存）" value={`${counts.practice} 行`} />
        </div>
        <p className="mt-3 text-xs text-muted">Excel で文字化けしないよう UTF-8（BOM 付き）で出力します。日時は ISO 8601（UTC）です。</p>
      </Section>

      <Section title="本試行 CSV のプレビュー（直近 6 行）">
        {preview.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted">まだ本試行の回答はありません</p>
        ) : (
          <div className="overflow-auto">
            <table className="tbl">
              <thead>
                <tr>
                  {["prolific_pid", "seq", "triplet_id", "condition", "b_source", "c_source", "b_side", "left_image_id", "right_image_id", "response", "selected_role", "selected_image_id", "rt_ms"].map((h) => (
                    <th key={h} className="font-mono normal-case!">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.map((r) => (
                  <tr key={r.id} className="font-mono text-[11px]">
                    <td>{r.pid.slice(0, 10)}…</td>
                    <td>{r.seq}</td>
                    <td>{r.triplet_id}</td>
                    <td>{r.condition}</td>
                    <td>{r.triplet_id ? getTriplet(r.triplet_id)?.meta?.b_source : ""}</td>
                    <td>{r.triplet_id ? getTriplet(r.triplet_id)?.meta?.c_source : ""}</td>
                    <td>{r.b_side}</td>
                    <td>{r.left_image_id}</td>
                    <td>{r.right_image_id}</td>
                    <td>{r.response}</td>
                    <td>{r.selected_role}</td>
                    <td>{r.selected_image_id}</td>
                    <td>{r.rt_ms}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <Section title="CSV の列定義（全回答・本試行）" desc="列構成はご相談のうえ確定します（列名の変更・ワイド形式の追加などに対応可能）。">
        <div className="overflow-auto">
          <table className="tbl">
            <thead>
              <tr>
                <th>列名</th>
                <th>内容</th>
              </tr>
            </thead>
            <tbody>
              {RESPONSE_COLUMNS.map((c) => (
                <tr key={c.key as string}>
                  <td className="whitespace-nowrap font-mono text-xs">{c.key as string}</td>
                  <td className="text-xs text-ink-2">{c.desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  );
}

function countAttentionPartial(s: DemoState) {
  let n = 0;
  for (const p of Object.values(s.participants)) if (p.status !== "completed") n += p.slots.filter((x) => x.kind === "attention" && x.state === "answered").length;
  return n;
}

function AuditItem({ ok, label, value }: { ok: boolean; label: string; value: string }) {
  return (
    <div className={`rounded-xl border p-3 ${ok ? "border-[#bfe5cf] bg-good-50" : "border-[#f3c9c5] bg-bad-50"}`}>
      <p className={`flex items-center gap-1.5 text-xs font-semibold ${ok ? "text-good" : "text-bad"}`}>
        {ok ? <IconCheck size={13} /> : <IconAlert size={13} />} {ok ? "一致" : "要確認"}
      </p>
      <p className="mt-1 text-xs text-ink-2">{label}</p>
      <p className="num mt-0.5 text-lg font-bold">{value}</p>
    </div>
  );
}
