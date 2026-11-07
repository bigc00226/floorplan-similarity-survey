"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { callWithRetry } from "@/lib/api";
import { getTriplet, imagePath } from "@/lib/dataset";
import {
  ServerError,
  answeredTotal,
  comprehension,
  consent,
  currentSlot,
  enter,
  heartbeat,
  howtoDone,
  labelOf,
  leave,
  logImageError,
  mainAnswer,
  practiceAnswer,
  startMain,
  submitPost,
  type PostItem,
  type TrialAnswer,
} from "@/lib/engine";
import { transact, transactSync, useDemoState } from "@/lib/store";
import type { DemoState, Participant, Side, Stage } from "@/lib/types";
import { CenterMessage, Shell } from "./ui";
import { TrialScreen, type TrialImages } from "./TrialScreen";
import {
  AspectsScreen,
  CommentsScreen,
  ComprehensionScreen,
  ConsentScreen,
  DemographicsScreen,
  DifficultyScreen,
  EndScreen,
  HowToScreen,
  PracticeIntro,
  ReadyScreen,
} from "./screens";
import { DemoInspector } from "./DemoInspector";

type Gate = "loading" | "ok" | "invalid" | "paused" | "already_completed" | "screened_out";

const SECTION: Record<Stage, number> = {
  consent: 0,
  howto: 0,
  comprehension: 0,
  practice: 1,
  ready: 1,
  main: 2,
  post_aspects: 3,
  post_most: 3,
  post_difficulty: 3,
  post_comments: 3,
  demographics: 3,
  done: 3,
};

function overallProgress(p: Participant, n: number) {
  const total = 3 + p.practice.length + 1 + (n + 2) + 5;
  const order: Stage[] = ["consent", "howto", "comprehension", "practice", "ready", "main", "post_aspects", "post_most", "post_difficulty", "post_comments", "demographics", "done"];
  const idx = order.indexOf(p.stage);
  let done = Math.min(idx, 3);
  if (idx > 3) done += p.practice.length;
  else if (p.stage === "practice") done += p.practiceIndex;
  if (idx > 4) done += 1;
  if (p.stage === "main") done += answeredTotal(p);
  if (idx > 5) done += n + 2 + (idx - 6);
  return Math.min(1, done / total);
}

function trialImages(tripletId: string, bSide: Side, mode: DemoState["settings"]["labelMode"]): TrialImages {
  const t = getTriplet(tripletId)!;
  const leftFile = bSide === "left" ? "b.png" : "c.png";
  const rightFile = bSide === "left" ? "c.png" : "b.png";
  return {
    a: imagePath(t.triplet_id, "a.png"),
    left: { url: imagePath(t.triplet_id, leftFile), label: labelOf("left", bSide, mode) },
    right: { url: imagePath(t.triplet_id, rightFile), label: labelOf("right", bSide, mode) },
  };
}

export default function StudyApp() {
  const sp = useSearchParams();
  const pid = (sp.get("PROLIFIC_PID") ?? "").trim();
  const studyId = (sp.get("STUDY_ID") ?? "").trim();
  const sessionId = (sp.get("SESSION_ID") ?? "").trim();
  const state = useDemoState();

  const [gate, setGate] = useState<Gate>("loading");
  const [completionUrl, setCompletionUrl] = useState<string | null>(null);
  const [left, setLeft] = useState<null | "back_button">(null);
  const [saving, setSaving] = useState(false);
  const [retry, setRetry] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const entered = useRef(false);

  const doEnter = useCallback(async () => {
    if (!pid) return setGate("invalid");
    const r = await callWithRetry((s) => enter(s, { pid, studyId: studyId || "(missing)", sessionId: sessionId || "(missing)" }));
    if (r.ok) {
      setGate("ok");
      setLeft(null);
    } else {
      setCompletionUrl(r.completionUrl ?? null);
      setGate(r.reason);
    }
  }, [pid, studyId, sessionId]);

  useEffect(() => {
    if (entered.current) return;
    entered.current = true;
    void doEnter();
  }, [doEnter]);

  // Browser back = drop-out (spec). Closing the tab = drop-out (released immediately).
  useEffect(() => {
    if (gate !== "ok") return;
    history.pushState({ fps: 1 }, "", location.href);
    const onPop = () => {
      let wasActive = false;
      transactSync((s) => {
        const p = s.participants[pid];
        wasActive = !!p && p.status === "active" && p.stage !== "done";
        leave(s, pid, "back_button");
      });
      if (wasActive) setLeft("back_button");
      history.pushState({ fps: 1 }, "", location.href);
    };
    const onHide = () => transactSync((s) => void leave(s, pid, "tab_closed"));
    window.addEventListener("popstate", onPop);
    window.addEventListener("pagehide", onHide);
    return () => {
      window.removeEventListener("popstate", onPop);
      window.removeEventListener("pagehide", onHide);
    };
  }, [gate, pid]);

  // Heartbeat keeps the reservation alive; silence for `leaseMinutes` → items are released.
  useEffect(() => {
    if (gate !== "ok") return;
    const beat = () => void transact((s) => heartbeat(s, pid)).catch(() => {});
    beat();
    const t = setInterval(beat, 15_000);
    return () => clearInterval(t);
  }, [gate, pid]);

  // Each request belongs to the screen it was sent from. If the server state has already moved on
  // (e.g. the save committed but its response was lost and a retry is still pending), the stale
  // request must not keep the next screen in a "saving" state.
  const reqToken = useRef(0);
  const run = useCallback(async <T,>(op: (s: DemoState) => T): Promise<T | undefined> => {
    const token = ++reqToken.current;
    const mine = () => reqToken.current === token;
    setSaving(true);
    setRetry(0);
    setError(null);
    try {
      return await callWithRetry(op, { onRetry: (n) => mine() && setRetry(n) });
    } catch (e) {
      if (!mine()) return undefined;
      if (e instanceof ServerError && (e.code === "out_of_order" || e.code === "stage_mismatch")) return undefined; // UI re-syncs from server state
      setError(e instanceof Error ? e.message : String(e));
      return undefined;
    } finally {
      if (mine()) {
        setSaving(false);
        setRetry(0);
      }
    }
  }, []);

  const onImageError = useCallback(
    (tripletId: string, bSide: Side) => (pos: string, detail: string) => {
      const file = pos === "a" ? "a.png" : (pos === "left") === (bSide === "left") ? "b.png" : "c.png";
      void transact((s) => logImageError(s, { pid, triplet_id: tripletId, file, source: "participant", detail })).catch(() => {});
    },
    [pid],
  );

  const p = state?.participants[pid];
  const settings = state?.settings;
  const save = { saving, retry, error };

  const viewKey = p ? [p.status, p.stage, p.practiceIndex, p.comprehensionAttempts, p.stage === "main" ? (currentSlot(p)?.pos ?? "") : ""].join("|") : "";
  useEffect(() => {
    reqToken.current++;
    setSaving(false);
    setRetry(0);
    setError(null);
  }, [viewKey]);

  const goProlific = useCallback(() => {
    const target = completionUrl ?? settings?.completionUrl ?? "";
    if (settings?.demoRedirect) {
      let cc = "";
      try {
        cc = new URL(target).searchParams.get("cc") ?? "";
      } catch {
        /* ignore */
      }
      window.location.href = `/demo/prolific-complete?cc=${encodeURIComponent(cc)}&pid=${encodeURIComponent(pid)}&to=${encodeURIComponent(target)}`;
    } else window.location.href = target;
  }, [completionUrl, settings, pid]);

  const preload = useMemo(() => {
    if (!p || p.stage !== "main" || !settings) return undefined;
    const idx = p.slots.findIndex((x) => x.state !== "answered");
    const next = p.slots[idx + 1];
    if (!next?.triplet_id) return undefined;
    const im = trialImages(next.triplet_id, next.b_side, settings.labelMode);
    return [im.a, im.left.url, im.right.url];
  }, [p, settings]);

  /* ───────── gates ───────── */
  if (gate === "invalid")
    return (
      <CenterMessage title="This study link is incomplete">
        <p>We could not find your Prolific participant ID in the link. Please open the study again from the Prolific website.</p>
        <DemoHint />
      </CenterMessage>
    );
  if (gate === "paused")
    return (
      <CenterMessage title="The study is temporarily paused">
        <p>New participants cannot start at the moment. Please try again later, or return your submission on Prolific.</p>
        <p className="text-sm text-muted">If you already started, your previous answers are safely stored.</p>
      </CenterMessage>
    );
  if (gate === "already_completed")
    return (
      <CenterMessage title="You have already completed this study" tone="good">
        <p>Our records show that you have already submitted this study, so it cannot be taken again. Thank you for your participation.</p>
        <p>If you have not yet registered your completion on Prolific, use the button below.</p>
        <div className="flex justify-center pt-2">
          <button className="btn btn-primary" onClick={goProlific}>
            Return to Prolific
          </button>
        </div>
      </CenterMessage>
    );
  if (gate === "screened_out" || p?.status === "screened_out") return <ScreenedOut />;
  if (gate === "loading" || !state || !p || !settings)
    return (
      <Shell>
        <div className="card h-80 skeleton" />
      </Shell>
    );

  if (p.status === "completed")
    return (
      <Shell section={4} progress={1}>
        <EndScreen url={completionUrl ?? settings.completionUrl} seconds={settings.autoRedirectSeconds} onGo={goProlific} />
        <DemoInspector p={p} state={state} />
      </Shell>
    );

  if (p.status === "declined")
    return (
      <CenterMessage title="Thank you for your time">
        <p>You chose not to take part in this study. No further answers will be collected.</p>
        <p>
          Please return to Prolific and click <b>“Stop Without Completing”</b> (or “Cancel participation”) to return your submission.
        </p>
        <p className="text-sm text-muted">
          Changed your mind?{" "}
          <button className="font-semibold text-brand underline" onClick={() => void doEnter()}>
            Go back to the consent page
          </button>
        </p>
      </CenterMessage>
    );

  const leftReason = left ?? (p.status === "dropped" ? (p.dropouts.at(-1)?.reason ?? "timeout") : null);
  if (leftReason)
    return (
      <CenterMessage title="Your session was interrupted">
        <p>
          {leftReason === "back_button"
            ? "You used the browser’s back button. Going back to previous questions is not possible in this study, so the current session has been paused."
            : "We have not received a signal from this page for a while, so the session has been paused."}
        </p>
        <p>
          <b>All answers you have already submitted are saved.</b> You may continue where you left off. Questions you had not answered yet may be replaced with new ones.
        </p>
        <div className="flex justify-center pt-2">
          <button className="btn btn-primary" onClick={() => void doEnter()}>
            Continue the study
          </button>
        </div>
      </CenterMessage>
    );

  /* ───────── stages ───────── */
  const n = p.n ?? settings.n;
  const progress = overallProgress(p, n);
  const section = SECTION[p.stage];
  let counter: string | undefined;
  let body: React.ReactNode = null;
  let wide = false;

  switch (p.stage) {
    case "consent":
      body = <ConsentScreen {...save} onAnswer={(agree) => void run((s) => consent(s, pid, agree, crypto.randomUUID()))} />;
      break;
    case "howto":
      body = <HowToScreen {...save} exampleUrl={imagePath("example", "a.png")} onNext={() => void run((s) => howtoDone(s, pid))} />;
      break;
    case "comprehension":
      body = (
        <ComprehensionScreen
          key={p.comprehensionAttempts}
          {...save}
          attempt={p.comprehensionAttempts + 1}
          onAnswer={(v, rt) => void run((s) => comprehension(s, pid, v, crypto.randomUUID(), rt))}
        />
      );
      break;
    case "practice": {
      const item = p.practice[p.practiceIndex];
      wide = true;
      counter = `Practice ${p.practiceIndex + 1} / ${p.practice.length}`;
      body = (
        <TrialScreen
          key={`practice-${p.practiceIndex}`}
          tripletId={item.triplet_id}
          heading={`Practice ${p.practiceIndex + 1} of ${p.practice.length}`}
          intro={<PracticeIntro />}
          images={trialImages(item.triplet_id, item.b_side, settings.labelMode)}
          {...save}
          onImageError={onImageError(item.triplet_id, item.b_side)}
          onSubmit={(a: TrialAnswer) => void run((s) => practiceAnswer(s, pid, p.practiceIndex, a))}
        />
      );
      break;
    }
    case "ready":
      body = <ReadyScreen {...save} total={settings.n + 2} onStart={() => void run((s) => startMain(s, pid))} />;
      break;
    case "main": {
      const slot = currentSlot(p);
      if (!slot?.triplet_id) break;
      const total = p.slots.length;
      wide = true;
      counter = `Question ${slot.pos} / ${total}`;
      body = (
        <TrialScreen
          key={`main-${slot.pos}-${slot.triplet_id}`}
          tripletId={slot.triplet_id}
          heading={`Question ${slot.pos} / ${total}`}
          attention={slot.kind === "attention" ? slot.target : undefined}
          images={trialImages(slot.triplet_id, slot.b_side, settings.labelMode)}
          preload={preload}
          {...save}
          onImageError={onImageError(slot.triplet_id, slot.b_side)}
          onSubmit={(a: TrialAnswer) => void run((s) => mainAnswer(s, pid, slot.pos, a))}
        />
      );
      break;
    }
    case "post_aspects":
    case "post_most":
      body = (
        <AspectsScreen
          key={p.stage}
          multi={p.stage === "post_aspects"}
          {...save}
          onSubmit={(items: PostItem[]) => void run((s) => submitPost(s, pid, p.stage, items, crypto.randomUUID()))}
        />
      );
      break;
    case "post_difficulty":
      body = <DifficultyScreen {...save} onSubmit={(items) => void run((s) => submitPost(s, pid, "post_difficulty", items, crypto.randomUUID()))} />;
      break;
    case "post_comments":
      body = <CommentsScreen {...save} onSubmit={(items) => void run((s) => submitPost(s, pid, "post_comments", items, crypto.randomUUID()))} />;
      break;
    case "demographics":
      body = (
        <DemographicsScreen
          {...save}
          onSubmit={async (items) => {
            const r = await run((s) => submitPost(s, pid, "demographics", items, crypto.randomUUID()));
            if (r && "completionUrl" in r && r.completionUrl) setCompletionUrl(r.completionUrl);
          }}
        />
      );
      break;
  }

  return (
    <Shell section={section} progress={progress} counter={counter} wide={wide}>
      {body ?? <div className="card h-80 skeleton" />}
      <DemoInspector p={p} state={state} />
    </Shell>
  );
}

function ScreenedOut() {
  return (
    <CenterMessage title="End of study — comprehension check">
      <p className="text-center text-xl font-bold text-ink">Thank you for your time.</p>
      <p>You did not pass the comprehension check after two attempts, so you cannot continue with this study.</p>
      <div>
        <p>Please follow these steps:</p>
        <ol className="mt-1 list-decimal space-y-1 pl-6">
          <li>Close this survey tab.</li>
          <li>Return to the Prolific website.</li>
          <li>Click “Stop Without Completing” (or “Cancel participation”) to return your submission.</li>
        </ol>
      </div>
    </CenterMessage>
  );
}

function DemoHint() {
  return (
    <div lang="ja" className="rounded-xl border border-dashed border-line-2 bg-[#fafbfc] p-4 text-sm text-ink-2">
      <b>デモ版:</b> Prolific からは <code className="rounded bg-white px-1">?PROLIFIC_PID=…&amp;STUDY_ID=…&amp;SESSION_ID=…</code> 付きでアクセスされます。
      <Link href="/" className="ml-1 font-semibold text-brand underline">
        デモのトップページ
      </Link>
      から参加者IDを自動生成して開始できます。
    </div>
  );
}
