import Link from "next/link";
import { Logo } from "./participant/ui";

export function SiteHeader({ active }: { active?: "home" | "admin" | "docs" }) {
  const item = (href: string, label: string, key: string) => (
    <Link
      href={href}
      className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition ${active === key ? "bg-brand-50 text-brand" : "text-ink-2 hover:bg-[#eef0f4]"}`}
    >
      {label}
    </Link>
  );
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-white/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-[1280px] items-center gap-3 px-4">
        <Link href="/" className="flex min-w-0 items-center gap-2.5">
          <Logo />
          <span className="truncate font-bold tracking-tight">
            <span className="hidden sm:inline">間取り図 </span>類似性評価アンケート
          </span>
          <span className="pill hidden bg-[#111827] text-white sm:inline-flex">DEMO</span>
        </Link>
        <nav className="ml-auto flex items-center gap-0.5 sm:gap-1">
          {item("/", "トップ", "home")}
          {item("/admin", "管理画面", "admin")}
          {item("/docs", "資料", "docs")}
        </nav>
      </div>
    </header>
  );
}
