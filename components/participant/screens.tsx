"use client";
import { useEffect, useRef, useState } from "react";
import { ASPECTS, COMPREHENSION_OPTIONS, DEMOGRAPHICS, DIFFICULTY } from "@/lib/content";
import type { PostItem } from "@/lib/engine";
import { IconArrowRight, IconExternal, IconZoom } from "@/components/icons";
import { Notice, Panel, PrimaryButton, RadioOption, SaveBar } from "./ui";
import { ZoomModal } from "./ZoomModal";

export interface SaveProps {
  saving: boolean;
  retry: number;
  error?: string | null;
}

const Footer = ({ children }: { children: React.ReactNode }) => <div className="mt-8 flex flex-wrap items-center justify-end gap-3">{children}</div>;

/* ───────── Consent ───────── */
export function ConsentScreen({ onAnswer, ...save }: SaveProps & { onAnswer: (agree: boolean) => void }) {
  return (
    <Panel title="Study information and consent">
      <div className="space-y-6 text-[16px] leading-relaxed text-ink-2">
        <section>
          <h2 className="mb-1.5 text-[17px] font-bold text-ink">Purpose</h2>
          <p>We study how people perceive similarities between apartment floor plans. Responses will be used to evaluate and calibrate a computational similarity measure.</p>
        </section>
        <section>
          <h2 className="mb-1.5 text-[17px] font-bold text-ink">Your Task</h2>
          <p>
            For each question, compare a reference (A) with two alternatives (B and C). Indicate which looks more similar to A, or select a tie / unable-to-judge response. This is
            not a housing-preference survey.
          </p>
        </section>
        <section>
          <h2 className="mb-1.5 text-[17px] font-bold text-ink">Data and rights</h2>
          <p>We will record your responses, Prolific participant ID and background answers. Data will be stored securely and analyzed for research.</p>
        </section>
        <Notice tone="info">
          Please complete the study in one sitting. You cannot go back to previous questions, and using the browser&apos;s back button will end your session.
        </Notice>
      </div>
      <div className="mt-8 grid gap-3 sm:grid-cols-2">
        <button className="btn btn-secondary h-12" disabled={save.saving} onClick={() => onAnswer(false)}>
          I do not agree
        </button>
        <PrimaryButton saving={save.saving} onClick={() => onAnswer(true)}>
          I agree and continue
        </PrimaryButton>
      </div>
      <SaveBar {...save} />
    </Panel>
  );
}

/* ───────── How to read ───────── */
export function HowToScreen({ exampleUrl, onNext, ...save }: SaveProps & { exampleUrl: string; onNext: () => void }) {
  const [zoom, setZoom] = useState(false);
  return (
    <Panel title="How to read the floor plans">
      <div className="grid items-center gap-8 md:grid-cols-[1fr_300px]">
        <div className="space-y-4 text-[16px] leading-relaxed text-ink-2">
          <p>The diagram is an example of a floor plan. All diagrams use the same spatial canvas: 18 m × 18 m.</p>
          <div>
            <p className="mb-2">The colors represent the following:</p>
            <ul className="space-y-2">
              {[
                ["#000", "Black", "walls"],
                ["#fff", "White", "interior"],
                ["#cfcfcf", "Gray", "exterior"],
              ].map(([c, n, d]) => (
                <li key={n} className="flex items-center gap-3">
                  <span className="inline-block size-5 rounded border border-line-2" style={{ background: c }} />
                  <span className="w-14 font-semibold text-ink">{n}</span>
                  <span>{d}</span>
                </li>
              ))}
            </ul>
          </div>
          <p>The orientation of the entrances is consistently downward. Room labels and furniture are not shown.</p>
          <Notice tone="info">Compare the visible outline and room arrangement. Do not choose based on which home you would prefer.</Notice>
        </div>
        <figure className="mx-auto w-full max-w-[300px]">
          <button type="button" onClick={() => setZoom(true)} className="group relative block w-full overflow-hidden rounded-xl border border-line-2 bg-[#e9eaec]" aria-label="Enlarge example">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={exampleUrl} alt="Example floor plan" className="aspect-square w-full object-contain" />
            <span className="absolute right-2 top-2 grid size-9 place-items-center rounded-lg bg-white/90 shadow-sm ring-1 ring-black/5">
              <IconZoom size={18} />
            </span>
          </button>
          <figcaption className="mt-2 text-center text-sm text-muted">Example (click to enlarge)</figcaption>
        </figure>
      </div>
      <Footer>
        <PrimaryButton saving={save.saving} onClick={onNext}>
          Continue <IconArrowRight size={16} />
        </PrimaryButton>
      </Footer>
      <SaveBar {...save} />
      {zoom && <ZoomModal items={[{ key: "ex", url: exampleUrl, caption: "Example" }]} index={0} onIndex={() => {}} onClose={() => setZoom(false)} />}
    </Panel>
  );
}

/* ───────── Comprehension ───────── */
export function ComprehensionScreen({ attempt, onAnswer, ...save }: SaveProps & { attempt: number; onAnswer: (v: string, rt: number) => void }) {
  const [v, setV] = useState<string | null>(null);
  const t0 = useRef(0);
  useEffect(() => {
    t0.current = performance.now();
  }, []);
  return (
    <Panel title={attempt >= 2 ? "Comprehension check — second attempt" : "Comprehension check"}>
      <p className="text-[16px] font-medium text-ink">What is your task when comparing floor plans B and C?</p>
      <p className="mt-1 text-[15px] italic text-muted">Reminder: choose the plan that looks more similar to reference A, based on the visible layout.</p>
      {attempt >= 2 && (
        <div className="mt-5">
          <Notice tone="attn">
            <b>
              <i>Your first answer was incorrect. Please review the reminder and try once more.</i>
            </b>
          </Notice>
        </div>
      )}
      <div className="mt-6 grid gap-2.5" role="radiogroup">
        {COMPREHENSION_OPTIONS.map((o) => (
          <RadioOption key={o.value} checked={v === o.value} onClick={() => setV(o.value)}>
            {o.label}
          </RadioOption>
        ))}
      </div>
      <Footer>
        <PrimaryButton disabled={!v} saving={save.saving} onClick={() => v && onAnswer(v, performance.now() - t0.current)}>
          Submit answer
        </PrimaryButton>
      </Footer>
      <SaveBar {...save} />
    </Panel>
  );
}

/* ───────── Practice intro / ready ───────── */
export function PracticeIntro() {
  return (
    <div className="mb-4 rounded-lg bg-brand-50 px-4 py-3 text-[15px] leading-relaxed text-[#1f3d85]">
      <b>Practice.</b> The floor plan at the top is the reference A. Please choose which of the two floor plans below (B or C) is more similar to A. Some comparisons may be difficult.
      Please make your best judgment. Practice answers are not part of the main results.
    </div>
  );
}

export function ReadyScreen({ total, onStart, ...save }: SaveProps & { total: number; onStart: () => void }) {
  return (
    <Panel title="Practice complete">
      <div className="space-y-4 text-[16px] leading-relaxed text-ink-2">
        <p>
          Well done. The main part of the study has <b className="text-ink">{total} questions</b>. It usually takes about {Math.max(5, Math.round(total * 0.2))}–
          {Math.max(8, Math.round(total * 0.35))} minutes.
        </p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>Some questions contain a special instruction — please read each question carefully.</li>
          <li>You can enlarge any floor plan by clicking on it.</li>
          <li>You cannot return to a previous question or change an answer after continuing.</li>
          <li>Please do not use the browser&apos;s back button or refresh the page.</li>
        </ul>
      </div>
      <Footer>
        <PrimaryButton saving={save.saving} onClick={onStart}>
          Start the main questions <IconArrowRight size={16} />
        </PrimaryButton>
      </Footer>
      <SaveBar {...save} />
    </Panel>
  );
}

/* ───────── Post questions ───────── */
export function AspectsScreen({ multi, onSubmit, ...save }: SaveProps & { multi: boolean; onSubmit: (items: PostItem[]) => void }) {
  const [sel, setSel] = useState<string[]>([]);
  const [other, setOther] = useState("");
  const toggle = (v: string) => setSel((s) => (multi ? (s.includes(v) ? s.filter((x) => x !== v) : [...s, v]) : [v]));
  const otherSel = sel.includes("other");
  const valid = sel.length > 0 && (!otherSel || other.trim().length > 0);
  const id = multi ? "post_aspects" : "post_most_important";
  return (
    <Panel title={multi ? "About your judgement" : "Most important aspect"}>
      <p className="text-[16px] font-medium text-ink">
        {multi ? "Which aspects did you consider when judging similarity? Select all that apply." : "Which aspect did you consider most when judging similarity? Select one."}
      </p>
      <div className="mt-5 grid gap-2.5 sm:grid-cols-2" role={multi ? "group" : "radiogroup"}>
        {ASPECTS.map((o) => (
          <RadioOption key={o.value} square={multi} checked={sel.includes(o.value)} onClick={() => toggle(o.value)}>
            {o.label}
          </RadioOption>
        ))}
      </div>
      {otherSel && (
        <div className="mt-3">
          <label className="mb-1 block text-sm font-medium text-ink-2" htmlFor="other">
            Please specify “Other”
          </label>
          <input id="other" className="input" value={other} maxLength={300} onChange={(e) => setOther(e.target.value)} autoFocus />
        </div>
      )}
      <Footer>
        <PrimaryButton
          disabled={!valid}
          saving={save.saving}
          onClick={() => onSubmit([{ item_id: id, response: (multi ? sel : sel.slice(0, 1)).join(";"), response_text: otherSel ? other.trim() : undefined }])}
        >
          Continue <IconArrowRight size={16} />
        </PrimaryButton>
      </Footer>
      <SaveBar {...save} />
    </Panel>
  );
}

export function DifficultyScreen({ onSubmit, ...save }: SaveProps & { onSubmit: (items: PostItem[]) => void }) {
  const [v, setV] = useState<string | null>(null);
  return (
    <Panel title="Overall difficulty">
      <p className="text-[16px] font-medium text-ink">How difficult was it to compare the floor plans?</p>
      <div className="mt-5 grid gap-2.5" role="radiogroup">
        {DIFFICULTY.map((o) => (
          <RadioOption key={o.value} checked={v === o.value} onClick={() => setV(o.value)}>
            {o.label}
          </RadioOption>
        ))}
      </div>
      <Footer>
        <PrimaryButton disabled={!v} saving={save.saving} onClick={() => v && onSubmit([{ item_id: "post_difficulty", response: v }])}>
          Continue <IconArrowRight size={16} />
        </PrimaryButton>
      </Footer>
      <SaveBar {...save} />
    </Panel>
  );
}

export function CommentsScreen({ onSubmit, ...save }: SaveProps & { onSubmit: (items: PostItem[]) => void }) {
  const [v, setV] = useState("");
  return (
    <Panel title="Additional comments">
      <label htmlFor="comments" className="block text-[16px] font-medium text-ink">
        Was there anything that made the floor plans difficult to compare? Please share any comments about how you made your judgments.
      </label>
      <p className="mt-1 text-sm text-muted">Optional.</p>
      <textarea id="comments" className="input mt-4 min-h-40 resize-y leading-relaxed" maxLength={2000} value={v} onChange={(e) => setV(e.target.value)} />
      <p className="mt-1 text-right text-xs text-muted num">{v.length} / 2000</p>
      <Footer>
        <PrimaryButton saving={save.saving} onClick={() => onSubmit([{ item_id: "post_comments", response: v.trim() }])}>
          Continue <IconArrowRight size={16} />
        </PrimaryButton>
      </Footer>
      <SaveBar {...save} />
    </Panel>
  );
}

export function DemographicsScreen({ onSubmit, ...save }: SaveProps & { onSubmit: (items: PostItem[]) => void }) {
  const [ans, setAns] = useState<Record<string, string>>({});
  const [tried, setTried] = useState(false);
  const missing = DEMOGRAPHICS.filter((d) => !ans[d.id]);
  const submit = () => {
    setTried(true);
    if (missing.length) {
      document.getElementById(`q-${missing[0].id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    onSubmit(DEMOGRAPHICS.map((d) => ({ item_id: d.id, response: ans[d.id] })));
  };
  return (
    <Panel title="About you">
      <p className="text-[16px] text-ink-2">Finally, we&apos;d like to ask about your background and experience.</p>
      <p className="mt-1 text-sm text-muted">
        Questions marked <span className="text-bad">*</span> are required. You may select “Prefer not to say” where available.
      </p>
      <div className="mt-6 space-y-7">
        {DEMOGRAPHICS.map((d, i) => {
          const err = tried && !ans[d.id];
          return (
            <fieldset key={d.id} id={`q-${d.id}`} className={`rounded-xl ${err ? "-m-3 bg-bad-50/60 p-3 ring-1 ring-[#f3c9c5]" : ""}`}>
              <legend className="mb-3 text-[16px] font-semibold text-ink">
                {i + 1}. {d.q} <span className="text-bad">*</span>
              </legend>
              <div className="grid gap-2 sm:grid-cols-2" role="radiogroup">
                {d.options.map((o) => (
                  <RadioOption key={o} checked={ans[d.id] === o} onClick={() => setAns((a) => ({ ...a, [d.id]: o }))}>
                    {o}
                  </RadioOption>
                ))}
              </div>
              {err && <p className="mt-2 text-sm font-medium text-bad">Please answer this question.</p>}
            </fieldset>
          );
        })}
      </div>
      <Footer>
        {tried && missing.length > 0 && <span className="text-sm text-bad">{missing.length} question(s) still need an answer.</span>}
        <PrimaryButton saving={save.saving} onClick={submit}>
          Submit survey
        </PrimaryButton>
      </Footer>
      <SaveBar {...save} />
    </Panel>
  );
}

/* ───────── End ───────── */
export function EndScreen({ url, seconds, onGo }: { url: string; seconds: number; onGo: () => void }) {
  const [left, setLeft] = useState(seconds);
  useEffect(() => {
    if (seconds <= 0) return;
    const t = setInterval(() => setLeft((s) => s - 1), 1000);
    return () => clearInterval(t);
  }, [seconds]);
  useEffect(() => {
    if (seconds > 0 && left <= 0) onGo();
  }, [left, seconds, onGo]);
  return (
    <Panel className="mx-auto max-w-[720px] text-center">
      <h1 className="text-2xl font-bold tracking-tight">End of Study</h1>
      <p className="mt-6 text-xl font-bold">Thank you for your time.</p>
      <div className="mx-auto mt-6 max-w-[520px]">
        <Notice tone="good">✓ Your survey responses have been saved.</Notice>
      </div>
      <p className="mt-6 text-[16px] text-ink-2">Please click the button below and register your completion.</p>
      <div className="mt-6 flex justify-center">
        <a href={url} onClick={(e) => (e.preventDefault(), onGo())} className="btn btn-primary h-12 min-w-[240px] text-base">
          Return to Prolific <IconExternal size={16} />
        </a>
      </div>
      {seconds > 0 && (
        <p className="mt-4 text-sm text-muted num" aria-live="polite">
          You will be redirected automatically in {Math.max(0, left)} s.
        </p>
      )}
    </Panel>
  );
}
