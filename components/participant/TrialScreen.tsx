"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { TRIAL_OPTIONS } from "@/lib/content";
import type { DisplayChoice } from "@/lib/types";
import type { TrialAnswer } from "@/lib/engine";
import { newId } from "@/lib/engine";
import { IconAlert, IconArrowRight, IconZoom } from "@/components/icons";
import { PrimaryButton, SaveBar } from "./ui";
import { ZoomModal, type ZoomItem } from "./ZoomModal";

export interface TrialImages {
  a: string;
  left: { url: string; label: "B" | "C" };
  right: { url: string; label: "B" | "C" };
}

type ImgState = "loading" | "ok" | "error";

function PlanImage({
  src,
  caption,
  sub,
  className = "",
  onSettled,
  onZoom,
}: {
  src: string;
  caption: string;
  sub?: string;
  className?: string;
  onSettled: (ok: boolean, detail?: string) => void;
  onZoom: () => void;
}) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<ImgState>("loading");
  const settled = useRef(false);
  const url = attempt ? `${src}?retry=${attempt}` : src;

  const done = (ok: boolean, detail?: string) => {
    if (settled.current) return;
    settled.current = true;
    setState(ok ? "ok" : "error");
    onSettled(ok, detail);
  };

  return (
    <figure className={`plan ${className}`}>
      <div className={`plan-box ${state === "loading" ? "skeleton" : ""}`}>
        {state !== "error" && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={url}
            src={url}
            alt={`Floor plan ${caption}`}
            draggable={false}
            onClick={state === "ok" ? onZoom : undefined}
            className={`cursor-zoom-in transition-opacity duration-200 ${state === "ok" ? "opacity-100" : "opacity-0"}`}
            onLoad={(e) => {
              const img = e.currentTarget;
              (img.decode ? img.decode() : Promise.resolve()).then(
                () => done(true),
                () => done(true),
              );
            }}
            onError={() => {
              if (attempt < 2) setTimeout(() => setAttempt((a) => a + 1), 500 * (attempt + 1));
              else done(false, "load failed after 3 attempts");
            }}
          />
        )}
        {state === "error" && (
          <div className="absolute inset-0 grid place-items-center p-4 text-center text-sm text-bad">
            <div>
              <IconAlert className="mx-auto mb-2" />
              This image could not be loaded.
            </div>
          </div>
        )}
        {state === "ok" && (
          <button
            type="button"
            onClick={onZoom}
            className="absolute right-1.5 top-1.5 grid size-7 place-items-center rounded-lg bg-white/85 text-ink shadow-sm ring-1 ring-black/5 transition hover:bg-white sm:right-2 sm:top-2 sm:size-9"
            aria-label={`Enlarge floor plan ${caption}`}
          >
            <IconZoom size={18} />
          </button>
        )}
      </div>
      <figcaption className="mt-1.5 text-center text-[15px] font-semibold text-ink">
        {caption}
        {sub && <span className="font-normal text-muted"> — {sub}</span>}
      </figcaption>
    </figure>
  );
}

export function TrialScreen({
  tripletId,
  heading,
  attention,
  intro,
  images,
  preload,
  saving,
  retry,
  error,
  onSubmit,
  onImageError,
}: {
  tripletId: string;
  heading: string;
  attention?: "B" | "C";
  intro?: React.ReactNode;
  images: TrialImages;
  preload?: string[];
  saving: boolean;
  retry: number;
  error?: string | null;
  onSubmit: (a: TrialAnswer) => void;
  onImageError: (file: string, detail: string) => void;
}) {
  const [choice, setChoice] = useState<DisplayChoice | null>(null);
  const [settledCount, setSettled] = useState(0);
  const [hadError, setHadError] = useState(false);
  const [zoomIdx, setZoomIdx] = useState<number | null>(null);
  const t0 = useRef<number | null>(null);
  const displayedAt = useRef<string | undefined>(undefined);
  const firstChoice = useRef<number | undefined>(undefined);
  const changes = useRef(0);
  const ready = settledCount >= 3;

  const settle = useCallback(
    (file: string) => (ok: boolean, detail?: string) => {
      if (!ok) {
        setHadError(true);
        onImageError(file, detail ?? "error");
      }
      setSettled((n) => {
        const next = n + 1;
        if (next === 3) {
          t0.current = performance.now();
          displayedAt.current = new Date().toISOString();
        }
        return next;
      });
    },
    [onImageError],
  );

  // preload the next trial's images once this one is visible
  useEffect(() => {
    if (!ready || !preload) return;
    preload.forEach((u) => {
      const i = new Image();
      i.src = u;
    });
  }, [ready, preload]);

  const pick = (c: DisplayChoice) => {
    if (!ready || saving) return;
    if (t0.current != null && firstChoice.current === undefined) firstChoice.current = performance.now() - t0.current;
    if (choice && choice !== c) changes.current++;
    setChoice(c);
  };

  const submit = () => {
    if (!choice || !ready || t0.current == null) return;
    onSubmit({
      id: newId(),
      choice,
      rt_ms: performance.now() - t0.current,
      first_choice_ms: firstChoice.current,
      choice_changes: changes.current,
      displayed_at: displayedAt.current,
      answered_at: new Date().toISOString(),
      image_error: hadError,
    });
  };

  const zoomItems: ZoomItem[] = [
    { key: "A", url: images.a, caption: "A — Reference" },
    { key: "L", url: images.left.url, caption: images.left.label },
    { key: "R", url: images.right.url, caption: images.right.label },
  ];

  return (
    <div className="trial fade-up" data-triplet={tripletId}>
      <div className="grid gap-5 min-[960px]:grid-cols-[1fr_340px] min-[960px]:items-start">
        <section className="card p-4 sm:p-5">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <h1 className="text-lg font-bold tracking-tight sm:text-xl">{heading}</h1>
            <span className="text-xs text-muted">Click an image to enlarge</span>
          </div>
          {intro}
          {attention ? (
            <div className="mb-4 rounded-lg border border-[#f5cfba] bg-attn px-4 py-2.5 text-[15px] italic text-[#5c240b]">
              For this question only, select “Floor plan {attention}” regardless of similarity.
            </div>
          ) : (
            <p className="mb-4 text-[16px] text-ink-2">Which floor plan is more similar to A?</p>
          )}
          <div className="plans">
            <PlanImage className="plan-a" src={images.a} caption="A" sub="Reference" onSettled={settle("a")} onZoom={() => setZoomIdx(0)} />
            <PlanImage src={images.left.url} caption={images.left.label} onSettled={settle("left")} onZoom={() => setZoomIdx(1)} />
            <PlanImage src={images.right.url} caption={images.right.label} onSettled={settle("right")} onZoom={() => setZoomIdx(2)} />
          </div>
        </section>

        <aside className="card p-4 sm:p-5 min-[960px]:sticky min-[960px]:top-20">
          <p className="mb-3 text-sm font-semibold text-ink-2">Your answer</p>
          <div className="grid gap-2.5" role="radiogroup" aria-label="Answer">
            {TRIAL_OPTIONS.map((o) => (
              <button
                key={o.value}
                type="button"
                role="radio"
                aria-checked={choice === o.value}
                disabled={!ready || saving}
                className="opt disabled:cursor-wait disabled:opacity-60"
                onClick={() => pick(o.value)}
              >
                <span className="dot" />
                <span>{o.label}</span>
              </button>
            ))}
          </div>
          <div className="mt-5 flex flex-col items-stretch gap-2">
            <PrimaryButton disabled={!choice || !ready} saving={saving} onClick={submit}>
              Continue <IconArrowRight size={16} />
            </PrimaryButton>
            <p className="min-h-5 text-center text-xs text-muted" aria-live="polite">
              {!ready ? "Loading images…" : !choice ? "Select an answer to continue." : "You cannot return to this question after continuing."}
            </p>
          </div>
          <SaveBar saving={saving} retry={retry} error={error} />
        </aside>
      </div>
      {zoomIdx !== null && <ZoomModal items={zoomItems} index={zoomIdx} onIndex={setZoomIdx} onClose={() => setZoomIdx(null)} />}
    </div>
  );
}
