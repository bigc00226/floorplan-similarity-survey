"use client";
import type { ReactNode } from "react";
import { STUDY_TITLE } from "@/lib/content";
import { IconAlert, IconCheck } from "@/components/icons";

export const SECTIONS = ["Introduction", "Practice", "Main questions", "Final questions"] as const;

export function Shell({
  section,
  progress,
  counter,
  children,
  wide,
}: {
  section?: number;
  progress?: number;
  counter?: string;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <div lang="en" className="min-h-dvh flex flex-col">
      <header className="sticky top-0 z-30 border-b border-line bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-[1280px] items-center gap-4 px-4">
          <div className="flex min-w-0 items-center gap-2.5">
            <Logo />
            <span className="truncate text-[15px] font-semibold tracking-tight">{STUDY_TITLE}</span>
          </div>
          {section !== undefined && (
            <ol className="ml-auto hidden items-center gap-1 text-xs md:flex" aria-label="Study sections">
              {SECTIONS.map((s, i) => (
                <li key={s} className="flex items-center gap-1">
                  <span
                    className={`pill ${i === section ? "bg-brand-50 text-brand" : i < section ? "text-good" : "text-muted"}`}
                    aria-current={i === section ? "step" : undefined}
                  >
                    {i < section ? <IconCheck size={12} /> : <span className="num">{i + 1}</span>}
                    {s}
                  </span>
                  {i < SECTIONS.length - 1 && <span className="text-line-2">—</span>}
                </li>
              ))}
            </ol>
          )}
          {counter && <span className="num ml-auto text-sm font-semibold text-ink-2 md:ml-4">{counter}</span>}
        </div>
        {progress !== undefined && (
          <div className="h-1 w-full bg-[#eceef2]" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)}>
            <div className="h-full bg-brand transition-[width] duration-500" style={{ width: `${Math.max(2, progress * 100)}%` }} />
          </div>
        )}
      </header>
      <main className={`mx-auto w-full flex-1 px-4 py-5 sm:py-8 ${wide ? "max-w-[1280px]" : "max-w-[860px]"}`}>{children}</main>
    </div>
  );
}

export function Logo() {
  return (
    <svg width="26" height="26" viewBox="0 0 26 26" aria-hidden>
      <rect width="26" height="26" rx="7" fill="#2456c9" />
      <path d="M6 7h14v12H6z M6 12h6 M12 7v5 M15 12v7 M15 15h5" stroke="#fff" strokeWidth="1.8" fill="none" />
    </svg>
  );
}

export function Panel({ title, children, className = "" }: { title?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`card fade-up p-5 sm:p-8 ${className}`}>
      {title && <h1 className="mb-5 text-xl font-bold tracking-tight sm:text-2xl">{title}</h1>}
      {children}
    </section>
  );
}

export function RadioOption({ checked, onClick, children, square }: { checked: boolean; onClick: () => void; children: ReactNode; square?: boolean }) {
  return (
    <button type="button" role={square ? "checkbox" : "radio"} aria-checked={checked} className="opt" onClick={onClick}>
      <span className={`dot ${square ? "square" : ""}`} />
      <span>{children}</span>
    </button>
  );
}

export function Notice({ tone = "info", children }: { tone?: "info" | "warn" | "attn" | "good" | "bad"; children: ReactNode }) {
  const cls = {
    info: "bg-brand-50 text-[#1f3d85] border-brand-100",
    warn: "bg-warn-50 text-warn border-[#f3dcb4]",
    attn: "bg-attn text-[#7a2e0e] border-[#f5cfba]",
    good: "bg-good-50 text-good border-[#bfe5cf]",
    bad: "bg-bad-50 text-bad border-[#f3c9c5]",
  }[tone];
  return <div className={`rounded-xl border px-4 py-3 text-[15px] leading-relaxed ${cls}`}>{children}</div>;
}

export function SaveBar({ saving, retry, error }: { saving: boolean; retry: number; error?: string | null }) {
  if (error)
    return (
      <div className="mt-4">
        <Notice tone="bad">
          <span className="font-semibold">Something went wrong.</span> {error}
        </Notice>
      </div>
    );
  if (!retry) return null;
  return (
    <div className="mt-4" role="status" aria-live="polite">
      <Notice tone="warn">
        <span className="inline-flex items-center gap-2 font-semibold">
          <IconAlert size={16} /> Connection problem — retrying{saving ? "…" : ""} (attempt {retry + 1})
        </span>
        <span className="block text-sm">Please keep this page open. Your answers so far are safely stored and will not be lost.</span>
      </Notice>
    </div>
  );
}

export function PrimaryButton({
  children,
  disabled,
  saving,
  onClick,
  type = "button",
}: {
  children: ReactNode;
  disabled?: boolean;
  saving?: boolean;
  onClick?: () => void;
  type?: "button" | "submit";
}) {
  return (
    <button type={type} className="btn btn-primary min-w-[180px]" disabled={disabled || saving} onClick={onClick}>
      {saving ? (
        <>
          <span className="spinner" /> Saving…
        </>
      ) : (
        children
      )}
    </button>
  );
}

export function CenterMessage({ title, children, tone }: { title: string; children: ReactNode; tone?: "good" | "bad" | "neutral" }) {
  return (
    <Shell>
      <Panel className="mx-auto max-w-[720px] text-center">
        <div
          className={`mx-auto mb-5 grid size-14 place-items-center rounded-full ${
            tone === "good" ? "bg-good-50 text-good" : tone === "bad" ? "bg-bad-50 text-bad" : "bg-brand-50 text-brand"
          }`}
        >
          {tone === "good" ? <IconCheck size={28} /> : <IconAlert size={26} />}
        </div>
        <h1 className="mb-4 text-2xl font-bold tracking-tight">{title}</h1>
        <div className="space-y-4 text-left text-[16px] leading-relaxed text-ink-2">{children}</div>
      </Panel>
    </Shell>
  );
}
