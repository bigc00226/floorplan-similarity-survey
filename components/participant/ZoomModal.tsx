"use client";
import { useEffect, useRef, useState } from "react";
import { IconChevronLeft, IconChevronRight, IconX } from "@/components/icons";

export interface ZoomItem {
  key: string;
  url: string;
  caption: string;
}

export function ZoomModal({ items, index, onIndex, onClose }: { items: ZoomItem[]; index: number; onIndex: (i: number) => void; onClose: () => void }) {
  const [zoom, setZoom] = useState(1);
  const closeRef = useRef<HTMLButtonElement>(null);
  const item = items[index];

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") onIndex((index + 1) % items.length);
      if (e.key === "ArrowLeft") onIndex((index - 1 + items.length) % items.length);
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [index, items.length, onClose, onIndex]);

  const size = "min(88vw, calc(100dvh - 170px))";

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#0d1117]/92 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label={`Enlarged floor plan ${item.caption}`} onClick={onClose}>
      <div className="flex items-center gap-3 px-4 py-3 text-white" onClick={(e) => e.stopPropagation()}>
        <div className="flex rounded-lg bg-white/10 p-1" role="tablist">
          {items.map((it, i) => (
            <button
              key={it.key}
              role="tab"
              aria-selected={i === index}
              onClick={() => onIndex(i)}
              className={`rounded-md px-3 py-1.5 text-sm font-semibold transition ${i === index ? "bg-white text-ink" : "text-white/80 hover:bg-white/10"}`}
            >
              {it.caption}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-1 rounded-lg bg-white/10 p-1">
          {[1, 2, 3].map((z) => (
            <button key={z} onClick={() => setZoom(z)} className={`rounded-md px-2.5 py-1.5 text-sm font-semibold ${zoom === z ? "bg-white text-ink" : "text-white/80 hover:bg-white/10"}`}>
              {z === 1 ? "Fit" : `${z}×`}
            </button>
          ))}
        </div>
        <button ref={closeRef} onClick={onClose} className="grid size-10 place-items-center rounded-lg bg-white/10 hover:bg-white/20" aria-label="Close">
          <IconX />
        </button>
      </div>
      <div className="relative flex flex-1 items-center justify-center px-4 pb-4" onClick={(e) => e.stopPropagation()}>
        <button
          className="absolute left-3 z-10 grid size-11 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20 sm:left-6"
          onClick={() => onIndex((index - 1 + items.length) % items.length)}
          aria-label="Previous image"
        >
          <IconChevronLeft />
        </button>
        <div className="overflow-auto rounded-xl bg-[#e9eaec]" style={{ width: size, height: size }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={item.url}
            alt={`Floor plan ${item.caption}`}
            draggable={false}
            style={{ width: `${zoom * 100}%`, height: `${zoom * 100}%`, maxWidth: "none", objectFit: "contain", display: "block" }}
          />
        </div>
        <button
          className="absolute right-3 z-10 grid size-11 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20 sm:right-6"
          onClick={() => onIndex((index + 1) % items.length)}
          aria-label="Next image"
        >
          <IconChevronRight />
        </button>
      </div>
      <p className="pb-4 text-center text-xs text-white/60">Esc to close · ← → to switch · scroll to pan when zoomed</p>
    </div>
  );
}
