import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Prolific（模擬）" };

export default async function MockProlific({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  return (
    <div className="grid min-h-dvh place-items-center bg-[#f1f3f6] px-4 py-10">
      <div className="card w-full max-w-[560px] overflow-hidden">
        <div className="flex items-center gap-2 border-b border-line bg-[#0b1324] px-5 py-3 text-white">
          <span className="grid size-7 place-items-center rounded-md bg-white/15 text-sm font-black">P</span>
          <span className="text-sm font-semibold">Prolific（デモ用の模擬画面）</span>
        </div>
        <div className="space-y-5 p-6">
          <div className="flex items-center gap-3">
            <span className="grid size-11 place-items-center rounded-full bg-good-50 text-xl text-good">✓</span>
            <div>
              <p className="text-lg font-bold">完了コードを受け付けました</p>
              <p className="text-sm text-muted">本番では、この時点で Prolific の提出完了画面に自動で戻ります。</p>
            </div>
          </div>
          <dl className="grid grid-cols-[120px_1fr] gap-y-2 rounded-xl bg-[#f7f8fa] p-4 text-sm">
            <dt className="text-muted">完了コード</dt>
            <dd className="font-mono font-semibold">{sp.cc || "—"}</dd>
            <dt className="text-muted">参加者ID</dt>
            <dd className="break-all font-mono">{sp.pid || "—"}</dd>
            <dt className="text-muted">本番の遷移先</dt>
            <dd className="break-all font-mono text-xs">{sp.to || "—"}</dd>
          </dl>
          <p className="text-sm leading-relaxed text-ink-2">
            遷移先 URL（完了コード）は管理画面の「調査設定」でいつでも変更できます。デモでは誤って実在の Prolific に遷移しないよう、この模擬画面に差し替えています（設定で切替可能）。
          </p>
          <div className="flex flex-wrap gap-2">
            <Link href="/admin" className="btn btn-primary">管理画面で回答を確認</Link>
            <Link href="/" className="btn btn-secondary">デモのトップへ</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
