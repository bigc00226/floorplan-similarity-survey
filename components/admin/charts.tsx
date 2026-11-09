"use client";
import { useState, type ReactNode } from "react";

export function Kpi({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: "good" | "warn" | "bad" }) {
  const toneCls = tone === "good" ? "text-good" : tone === "warn" ? "text-warn" : tone === "bad" ? "text-bad" : "text-ink";
  return (
    <div className="card px-4 py-3.5">
      <p className="text-xs font-semibold text-muted">{label}</p>
      <p className={`num mt-1 text-[26px] font-bold leading-tight tracking-tight ${toneCls}`}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-muted">{sub}</p>}
    </div>
  );
}

/** Distribution of per-triplet response counts (single series). */
export function Histogram({ data, unit = "問", xLabel = "回答数" }: { data: { level: number; count: number }[]; unit?: string; xLabel?: string }) {
  const [hover, setHover] = useState<number | null>(null);
  if (!data.length) return <p className="py-10 text-center text-sm text-muted">データがありません</p>;
  const levels: { level: number; count: number }[] = [];
  const lo = data[0].level;
  const hi = data[data.length - 1].level;
  const map = new Map(data.map((d) => [d.level, d.count]));
  for (let l = Math.max(0, lo - 1); l <= hi + 1; l++) levels.push({ level: l, count: map.get(l) ?? 0 });
  const max = Math.max(...levels.map((d) => d.count), 1);
  const total = levels.reduce((a, b) => a + b.count, 0);
  return (
    <div>
      <div className="relative flex h-44 items-end gap-1.5 border-b border-line-2 px-1" role="img" aria-label="問題ごとの回答数の分布">
        {[0.5, 1].map((g) => (
          <div key={g} className="pointer-events-none absolute inset-x-0 border-t border-dashed border-line" style={{ bottom: `${g * 100}%` }} />
        ))}
        {levels.map((d) => {
          const h = (d.count / max) * 100;
          return (
            <div
              key={d.level}
              className="relative flex h-full flex-1 cursor-default items-end justify-center"
              onMouseEnter={() => setHover(d.level)}
              onMouseLeave={() => setHover(null)}
            >
              {hover === d.level && (
                <div className="pointer-events-none absolute bottom-full z-10 mb-1 whitespace-nowrap rounded-lg bg-ink px-2.5 py-1.5 text-xs text-white shadow-lg" style={{ bottom: `${h}%` }}>
                  回答 {d.level} 件: <b className="num">{d.count.toLocaleString()}</b> {unit}（{total ? ((d.count / total) * 100).toFixed(1) : 0}%）
                </div>
              )}
              <div
                className="w-full max-w-14 rounded-t-[4px] transition-[height] duration-500"
                style={{ height: `${Math.max(d.count ? 1.5 : 0, h)}%`, background: hover === d.level ? "#1c5cab" : "var(--color-series)" }}
              />
              {d.count > 0 && h > 14 && <span className="num pointer-events-none absolute text-[11px] font-semibold text-white" style={{ bottom: `${h - 9}%` }}>{d.count.toLocaleString()}</span>}
            </div>
          );
        })}
      </div>
      <div className="flex gap-1.5 px-1 pt-1.5">
        {levels.map((d) => (
          <span key={d.level} className="num flex-1 text-center text-[11px] text-muted">
            {d.level}
          </span>
        ))}
      </div>
      <p className="mt-1 text-center text-[11px] text-muted">{xLabel}（問題あたり）</p>
    </div>
  );
}

/** Horizontal bars for conditions a–g. */
export function ConditionBars({ rows }: { rows: { key: string; value: number; label: string; target?: string; sub?: string }[] }) {
  const max = Math.max(...rows.map((r) => r.value), 0.0001);
  return (
    <div className="space-y-2">
      {rows.map((r) => (
        <div key={r.key} className="group grid grid-cols-[28px_1fr_auto] items-center gap-3" title={`${r.label}${r.sub ? ` / ${r.sub}` : ""}`}>
          <span className="grid size-7 place-items-center rounded-md bg-[#eef0f4] text-xs font-bold text-ink-2">{r.key}</span>
          <div className="h-3 overflow-hidden rounded-full bg-[#eef0f4]">
            <div className="h-full rounded-full transition-[width] duration-500 group-hover:brightness-90" style={{ width: `${(r.value / max) * 100}%`, background: "var(--color-series)" }} />
          </div>
          <span className="num min-w-[120px] text-right text-xs text-ink-2">
            <b className="text-ink">{r.label}</b>
            {r.target && <span className="text-muted"> / 目標 {r.target}</span>}
          </span>
        </div>
      ))}
    </div>
  );
}

/** Min–max band + mean line over participants (simulation). */
export function SpreadChart({ series }: { series: { completed: number; min: number; max: number; mean: number }[] }) {
  const [hi, setHi] = useState<number | null>(null);
  if (series.length < 2) return null;
  const W = 520;
  const H = 230;
  const pad = { l: 30, r: 10, t: 10, b: 26 };
  const xMax = series[series.length - 1].completed || 1;
  const yMax = Math.max(...series.map((s) => s.max), 1);
  const x = (v: number) => pad.l + (v / xMax) * (W - pad.l - pad.r);
  const y = (v: number) => H - pad.b - (v / yMax) * (H - pad.t - pad.b);
  const band =
    series.map((s, i) => `${i ? "L" : "M"}${x(s.completed).toFixed(1)},${y(s.max).toFixed(1)}`).join("") +
    series
      .slice()
      .reverse()
      .map((s) => `L${x(s.completed).toFixed(1)},${y(s.min).toFixed(1)}`)
      .join("") +
    "Z";
  const mean = series.map((s, i) => `${i ? "L" : "M"}${x(s.completed).toFixed(1)},${y(s.mean).toFixed(1)}`).join("");
  const ticks = Array.from(new Set([0, Math.round(yMax / 2), yMax]));
  const h = hi !== null ? series[hi] : null;
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-4 text-xs text-ink-2">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-0.5 w-4 rounded" style={{ background: "var(--color-series)" }} /> 平均回答数
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-4 rounded-sm bg-[#cde2fb]" /> 最小〜最大の幅
        </span>
      </div>
      <div className="relative">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full"
          role="img"
          aria-label="参加者数に対する問題ごとの回答数の推移"
          onMouseLeave={() => setHi(null)}
          onMouseMove={(e) => {
            const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
            const px = ((e.clientX - r.left) / r.width) * W;
            const v = ((px - pad.l) / (W - pad.l - pad.r)) * xMax;
            let best = 0;
            series.forEach((s, i) => {
              if (Math.abs(s.completed - v) < Math.abs(series[best].completed - v)) best = i;
            });
            setHi(best);
          }}
        >
          {ticks.map((t) => (
            <g key={t}>
              <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke="#e2e5eb" strokeDasharray={t ? "3 3" : undefined} />
              <text x={pad.l - 6} y={y(t) + 4} fontSize="11.5" textAnchor="end" fill="#6a7182">
                {t}
              </text>
            </g>
          ))}
          <text x={W - pad.r} y={H - 6} fontSize="11.5" textAnchor="end" fill="#6a7182">
            完了者数 {xMax.toLocaleString()} 人
          </text>
          <text x={pad.l} y={H - 6} fontSize="11.5" fill="#6a7182">
            0
          </text>
          <path d={band} fill="#cde2fb" opacity={0.9} />
          <path d={mean} fill="none" stroke="var(--color-series)" strokeWidth={2} />
          {h && (
            <g>
              <line x1={x(h.completed)} x2={x(h.completed)} y1={pad.t} y2={H - pad.b} stroke="#14171f" strokeOpacity={0.25} />
              <circle cx={x(h.completed)} cy={y(h.mean)} r={4.5} fill="var(--color-series)" stroke="#fff" strokeWidth={2} />
            </g>
          )}
        </svg>
        {h && (
          <div
            className="pointer-events-none absolute top-1 rounded-lg bg-ink px-2.5 py-1.5 text-xs leading-relaxed text-white shadow-lg"
            style={{ left: `${Math.min(70, (x(h.completed) / W) * 100)}%` }}
          >
            完了 <b className="num">{h.completed}</b> 人時点
            <br />
            平均 <b className="num">{h.mean.toFixed(2)}</b> ／ 最小 <b className="num">{h.min}</b> ／ 最大 <b className="num">{h.max}</b>
          </div>
        )}
      </div>
    </div>
  );
}

export function Section({ title, desc, right, children, className = "" }: { title: ReactNode; desc?: ReactNode; right?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`card p-5 ${className}`}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-[15px] font-bold">{title}</h2>
          {desc && <p className="mt-0.5 text-xs leading-relaxed text-muted">{desc}</p>}
        </div>
        {right}
      </div>
      {children}
    </section>
  );
}

export function StatusPill({ status }: { status: string }) {
  const m: Record<string, [string, string]> = {
    active: ["回答中", "bg-brand-50 text-brand"],
    completed: ["完了", "bg-good-50 text-good"],
    dropped: ["中断（離脱）", "bg-warn-50 text-warn"],
    declined: ["取消・不同意", "bg-[#eef0f4] text-ink-2"],
    screened_out: ["取消・理解度", "bg-bad-50 text-bad"],
    withdrawn: ["取消・本人", "bg-bad-50 text-bad"],
  };
  const [label, cls] = m[status] ?? [status, "bg-[#eef0f4] text-ink-2"];
  return <span className={`pill ${cls}`}>{label}</span>;
}
