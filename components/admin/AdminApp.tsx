"use client";
import { useCallback } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { log } from "@/lib/engine";
import { storageBytes, transact, useDemoState } from "@/lib/store";
import { SiteHeader } from "@/components/SiteHeader";
import { IconDownload, IconExternal, IconFlask, IconGauge, IconGrid, IconList, IconPause, IconPlay, IconSettings, IconShield, IconUsers } from "@/components/icons";
import { Overview, ParticipantsPanel, TripletsPanel, LogsPanel } from "./panels";
import { SettingsPanel, DataCheckPanel, ExportPanel } from "./ops";
import { SimulatePanel } from "./Simulate";

const TABS = [
  { key: "overview", label: "ダッシュボード", icon: IconGauge },
  { key: "participants", label: "参加者", icon: IconUsers },
  { key: "triplets", label: "問題別の収集状況", icon: IconGrid },
  { key: "settings", label: "調査設定", icon: IconSettings },
  { key: "data", label: "データ取込・検証", icon: IconShield },
  { key: "export", label: "CSV 出力", icon: IconDownload },
  { key: "simulate", label: "シミュレーション", icon: IconFlask },
  { key: "logs", label: "運用ログ", icon: IconList },
] as const;
type TabKey = (typeof TABS)[number]["key"];

export default function AdminApp() {
  const state = useDemoState();
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const tab = (TABS.find((t) => t.key === sp.get("tab"))?.key ?? "overview") as TabKey;
  const setTab = useCallback((k: TabKey) => router.replace(`${pathname}?tab=${k}`, { scroll: false }), [router, pathname]);

  const togglePause = () =>
    transact((s) => {
      s.settings.paused = !s.settings.paused;
      log(s, "admin", s.settings.paused ? "調査を一時停止しました（新規参加者の受付を停止）" : "調査を再開しました");
    });

  return (
    <div className="min-h-dvh">
      <SiteHeader active="admin" />
      <div className="mx-auto grid max-w-[1280px] gap-5 px-4 py-5 lg:grid-cols-[220px_1fr]">
        <aside className="lg:sticky lg:top-[76px] lg:self-start">
          <nav className="flex gap-1 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible lg:pb-0" aria-label="管理メニュー">
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                aria-current={tab === t.key ? "page" : undefined}
                className={`flex flex-none items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-semibold transition ${
                  tab === t.key ? "bg-white text-brand shadow-sm ring-1 ring-line" : "text-ink-2 hover:bg-white/70"
                }`}
              >
                <t.icon size={17} />
                {t.label}
              </button>
            ))}
          </nav>
          {state && (
            <div className="mt-4 hidden rounded-xl border border-line bg-white/70 p-3 text-xs leading-relaxed text-muted lg:block">
              <p className="font-semibold text-ink-2">デモのデータ保存先</p>
              <p>このブラウザ（localStorage）</p>
              <p className="num mt-1">使用量 約 {(storageBytes() / 1024 / 1024).toFixed(2)} MB</p>
              <p className="mt-2">データベースには接続せず、ブラウザ内の仮想バックエンドで動作しています。</p>
            </div>
          )}
        </aside>

        <main className="min-w-0">
          <div className="mb-5 flex flex-wrap items-center gap-3">
            <h1 className="text-xl font-bold tracking-tight">{TABS.find((t) => t.key === tab)?.label}</h1>
            {state && (
              <span className={`pill ${state.settings.paused ? "bg-warn-50 text-warn" : "bg-good-50 text-good"}`}>
                <span className={`size-1.5 rounded-full ${state.settings.paused ? "bg-warn" : "bg-good"}`} />
                {state.settings.paused ? "一時停止中" : "公開中"}
              </span>
            )}
            <div className="ml-auto flex flex-wrap gap-2">
              {state && (
                <button className="btn btn-secondary btn-sm" onClick={togglePause}>
                  {state.settings.paused ? <IconPlay size={14} /> : <IconPause size={14} />}
                  {state.settings.paused ? "調査を再開" : "一時停止"}
                </button>
              )}
              <Link href="/" className="btn btn-secondary btn-sm">
                参加者画面を開く <IconExternal size={14} />
              </Link>
            </div>
          </div>
          {!state ? (
            <div className="card h-96 skeleton" />
          ) : tab === "overview" ? (
            <Overview s={state} go={setTab} />
          ) : tab === "participants" ? (
            <ParticipantsPanel s={state} />
          ) : tab === "triplets" ? (
            <TripletsPanel s={state} />
          ) : tab === "settings" ? (
            <SettingsPanel s={state} />
          ) : tab === "data" ? (
            <DataCheckPanel s={state} />
          ) : tab === "export" ? (
            <ExportPanel s={state} />
          ) : tab === "simulate" ? (
            <SimulatePanel s={state} />
          ) : (
            <LogsPanel s={state} />
          )}
        </main>
      </div>
    </div>
  );
}
