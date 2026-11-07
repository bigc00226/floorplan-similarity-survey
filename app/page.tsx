import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";
import { StartPanel } from "@/components/StartPanel";
import { IconArrowRight, IconBook, IconFlask, IconGauge, IconShield, IconUsers } from "@/components/icons";

const FLOW = [
  ["同意・説明", "同意しない → 終了"],
  ["間取り図の見方", "凡例・例示図（拡大可）"],
  ["理解度確認", "2 回失敗 → 終了"],
  ["練習", "本試行と区別して保存"],
  ["本試行 N 問 + 注意力確認 2 問", "N=40 → 42 問 / 16・31 問目に注意力確認"],
  ["事後質問 4 画面", "観点（複数）・最重要・難易度・自由記述"],
  ["属性質問 6 問", "全問必須"],
  ["完了", "保存確認後 → Prolific へ自動遷移"],
];

const CHECKS: [string, string][] = [
  ["全画面・分岐", "参加者として開始し、「I do not agree」や理解度確認の 2 回失敗で終了画面になることを確認"],
  ["42 問の出題", "初期設定 N=40。本試行 40 問＋注意力確認 2 問＝「Question x / 42」と表示（左下の DEMO パネルで自動回答も可）"],
  ["四択・拡大表示", "未選択では Continue が押せない／画像クリックで拡大（A・B・C 切替、2倍・3倍）"],
  ["問題割当・均等化", "管理画面 › シミュレーション で参加者 1,000 人規模を即時検証。回答数の差は常に 1 以内"],
  ["同時アクセス", "複数タブで同時に開始、または仮想参加者を同時 30 人で実行。排他ロックで割当の競合なし"],
  ["離脱・再アクセス", "回答途中でブラウザの「戻る」やタブを閉じる → 未回答問題を即時解放 →「再アクセス」で続きから再開"],
  ["保存データと CSV の一致", "管理画面 › CSV 出力 の整合性チェックで、回答行と集計値の一致を自動検証"],
  ["保存後の Prolific 遷移", "サーバー側で全回答の保存を検証してから完了画面 → 自動リダイレクト（デモは模擬画面）"],
  ["管理操作", "N の設定、完了 URL の変更、一時停止・再開、画像エラー確認、CSV 一括ダウンロード"],
];

const LINKS = [
  {
    href: "/admin",
    icon: <IconGauge />,
    title: "管理画面",
    desc: "参加者・回答数・問題ごとの収集状況、N と完了 URL の設定、一時停止・再開、画像エラー確認、CSV ダウンロード。",
  },
  {
    href: "/admin?tab=simulate",
    icon: <IconFlask />,
    title: "割当アルゴリズムの検証",
    desc: "参加者 1,000 人・離脱率 20% などの条件で、回答数の均等化と条件比率 2:1:1:2:1:1:2 の両立をその場で検証できます。",
  },
  {
    href: "/docs",
    icon: <IconBook />,
    title: "設計・運用資料",
    desc: "技術構成と月額費用、割当方式、離脱時の再割当、保存データ・CSV 項目、Prolific の設定手順、ご相談事項。",
  },
];

export default function Home() {
  return (
    <div className="min-h-dvh">
      <SiteHeader active="home" />
      <main className="mx-auto max-w-[1280px] px-4 pb-20">
        <section className="pb-8 pt-10 sm:pt-14">
          <p className="mb-3 inline-flex items-center gap-2 rounded-full border border-line bg-white px-3 py-1 text-xs font-semibold text-ink-2">
            <span className="size-1.5 rounded-full bg-good" /> 学術研究用 Web 実験システム — デモ版
          </p>
          <h1 className="max-w-[900px] text-3xl font-bold leading-tight tracking-tight sm:text-[42px]">
            間取り図の類似性評価アンケート
            <span className="block text-brand">Prolific 連携・回答数の自動均等化</span>
          </h1>
          <p className="mt-4 max-w-[760px] text-[16px] leading-relaxed text-ink-2">
            画面遷移イメージ（v2）の全画面を実装し、3,000 組の問題からの自動割当、回答の逐次保存、離脱時の再割当、管理画面、CSV 出力までをそのまま操作できるデモです。
            ご提供いただく実データ（CSV・画像）に差し替えるだけで本番運用に移行できる構成です。
          </p>
        </section>

        <div className="grid gap-5 lg:grid-cols-[1.25fr_1fr]">
          <section className="card p-6">
            <div className="mb-4 flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-xl bg-brand-50 text-brand">
                <IconUsers />
              </span>
              <div>
                <h2 className="text-lg font-bold">参加者として体験する</h2>
                <p className="text-sm text-muted">Prolific から遷移してきた参加者と同じ画面が開きます（英語）</p>
              </div>
            </div>
            <StartPanel />
          </section>

          <section className="grid gap-5">
            {LINKS.map((l) => (
              <Link key={l.href} href={l.href} className="card group flex items-start gap-4 p-6 transition hover:border-brand-100 hover:shadow-md">
                <span className="grid size-10 flex-none place-items-center rounded-xl bg-brand-50 text-brand">{l.icon}</span>
                <div className="min-w-0">
                  <h2 className="flex items-center gap-1.5 text-lg font-bold">
                    {l.title} <IconArrowRight size={16} className="transition group-hover:translate-x-0.5" />
                  </h2>
                  <p className="mt-1 text-sm leading-relaxed text-ink-2">{l.desc}</p>
                </div>
              </Link>
            ))}
          </section>
        </div>

        <section className="mt-10 grid gap-5 lg:grid-cols-[1fr_1.35fr]">
          <div className="card p-6">
            <h2 className="mb-4 text-lg font-bold">画面遷移（実装済み）</h2>
            <ol>
              {FLOW.map(([t, d], i) => (
                <li key={t} className="relative flex gap-3 pb-4 last:pb-0">
                  {i < FLOW.length - 1 && <span className="absolute left-[13px] top-7 h-[calc(100%-20px)] w-px bg-line-2" />}
                  <span className="num z-10 grid size-7 flex-none place-items-center rounded-full bg-brand text-xs font-bold text-white">{i + 1}</span>
                  <div className="pt-0.5">
                    <p className="text-[15px] font-semibold">{t}</p>
                    <p className="text-sm text-muted">{d}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
          <div className="card overflow-hidden">
            <div className="flex items-center gap-2 border-b border-line px-6 py-4">
              <IconShield className="text-brand" />
              <h2 className="text-lg font-bold">検収項目とデモでの確認方法</h2>
            </div>
            <div className="divide-y divide-[#eef0f3]">
              {CHECKS.map(([k, v]) => (
                <div key={k} className="grid gap-1 px-6 py-3 sm:grid-cols-[150px_1fr] sm:gap-4">
                  <p className="text-sm font-semibold text-ink">{k}</p>
                  <p className="text-sm leading-relaxed text-ink-2">{v}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mt-10 rounded-2xl border border-dashed border-line-2 bg-white/60 p-6 text-sm leading-relaxed text-ink-2">
          <h2 className="mb-2 text-base font-bold text-ink">デモ版について</h2>
          <ul className="list-disc space-y-1 pl-5">
            <li>

              データベースには接続せず、<b>フロントエンドだけで動作</b>します。割当・保存などの処理はブラウザ内の仮想バックエンドで実行し、回答は<b>このブラウザ内</b>に保存します（別の端末・ブラウザとは共有されません）。
            </li>
            <li>
              間取り図はデモ用に自動生成した画像です（18 m × 18 m・黒=壁・白=室内・灰=屋外・玄関は下向き）。URL 構成は実データと同じ <code className="rounded bg-[#eef0f4] px-1 font-mono text-xs">{"RPLAN_triplets/{triplet_id}/a.png"}</code> です。
            </li>
            <li>デモでは完了後、実在の Prolific ではなく模擬画面に遷移します（管理画面の設定で切替可能）。</li>
          </ul>
        </section>
      </main>
    </div>
  );
}
