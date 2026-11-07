"use client";
import { useEffect, useState } from "react";
import { IconArrowRight, IconRefresh } from "./icons";

const hex = (n: number) => Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => (b % 16).toString(16)).join("");
const KEY = "fpsurvey-demo:last-ids";

interface Ids {
  pid: string;
  study: string;
  session: string;
}

const make = (): Ids => ({ pid: hex(24), study: "6650c0ffee" + hex(14), session: hex(24) });
const urlOf = (ids: Ids) => `/study?PROLIFIC_PID=${ids.pid}&STUDY_ID=${ids.study}&SESSION_ID=${ids.session}`;

export function StartPanel() {
  const [ids, setIds] = useState<Ids | null>(null);
  const [last, setLast] = useState<Ids | null>(null);

  useEffect(() => {
    setIds(make());
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) setLast(JSON.parse(raw));
    } catch {
      /* ignore */
    }
  }, []);

  const open = (x: Ids) => {
    try {
      localStorage.setItem(KEY, JSON.stringify(x));
    } catch {
      /* ignore */
    }
    window.open(urlOf(x), "_blank", "noopener");
    setLast(x);
    setIds(make());
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-line bg-[#f8f9fb] p-3.5">
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-xs font-semibold text-muted">Prolific から渡される URL（自動生成）</span>
          <button onClick={() => setIds(make())} className="inline-flex items-center gap-1 text-xs font-semibold text-brand hover:underline">
            <IconRefresh size={12} /> 再生成
          </button>
        </div>
        <code className="block break-all font-mono text-[11.5px] leading-relaxed text-ink-2">
          {ids ? (
            <>
              /study?<b className="text-brand">PROLIFIC_PID</b>={ids.pid}&amp;<b className="text-brand">STUDY_ID</b>={ids.study}&amp;<b className="text-brand">SESSION_ID</b>={ids.session}
            </>
          ) : (
            "…"
          )}
        </code>
      </div>
      <div className="flex flex-wrap gap-2.5">
        <button className="btn btn-primary" disabled={!ids} onClick={() => ids && open(ids)}>
          新しい参加者として開始 <IconArrowRight size={16} />
        </button>
        <button
          className="btn btn-secondary"
          disabled={!last}
          onClick={() => last && open({ ...last, session: hex(24) })}
          title={last ? `PROLIFIC_PID=${last.pid}` : "まだ参加者を開始していません"}
        >
          直前の参加者で再アクセス
        </button>
      </div>
      <p className="text-xs leading-relaxed text-muted">
        「再アクセス」は同じ参加者IDで開き直します。途中離脱した参加者は続きから再開でき、完了済みの参加者は再回答できないことを確認できます。
      </p>
    </div>
  );
}
