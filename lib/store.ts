"use client";
/**
 * Demo persistence: the whole "database" lives in this browser's localStorage.
 * Every mutation runs inside `transact`, which holds an exclusive Web Lock, so several participant tabs and the admin tab can work at the same time without conflicts.
 */
import { useSyncExternalStore } from "react";
import { initialState, sweep } from "./engine";
import type { DemoState } from "./types";

const KEY = "fpsurvey-demo:v3";
const REV = "fpsurvey-demo:v3:rev";
const LOCK = "fpsurvey-demo-lock";

let mem: DemoState | null = null;
let memRev: string | null = null;
const listeners = new Set<() => void>();

function readRev() {
  try {
    return localStorage.getItem(REV) ?? "0";
  } catch {
    return "0";
  }
}

function load(): DemoState {
  const rev = readRev();
  if (mem && rev === memRev) return mem;
  let next: DemoState | null = null;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as DemoState;
      if (parsed?.schema === 3) next = parsed;
    }
  } catch {
    next = null;
  }
  mem = next ?? initialState();
  memRev = rev;
  return mem;
}

function persist(s: DemoState) {
  const json = JSON.stringify(s);
  try {
    localStorage.setItem(KEY, json);
  } catch (e) {
    throw new Error("ブラウザの保存容量の上限に達しました。管理画面の「デモデータを初期化」を実行してください。" + String(e));
  }
  memRev = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  try {
    localStorage.setItem(REV, memRev);
  } catch {
    /* ignore */
  }
  mem = { ...s };
  lastBytes = json.length * 2;
  listeners.forEach((l) => l());
}

let lastBytes = 0;
export const storageBytes = () => lastBytes || (typeof localStorage !== "undefined" ? (localStorage.getItem(KEY)?.length ?? 0) * 2 : 0);

/** Run a mutation atomically (exclusive lock across all tabs of this origin). */
export async function transact<T>(fn: (s: DemoState) => T): Promise<T> {
  const run = () => {
    const s = load();
    try {
      sweep(s);
      const result = fn(s);
      persist(s);
      return result;
    } catch (e) {
      // roll back: discard in-memory mutations, reload last committed state
      mem = null;
      memRev = null;
      throw e;
    }
  };
  if (typeof navigator !== "undefined" && navigator.locks?.request) {
    return navigator.locks.request(LOCK, { mode: "exclusive" }, async () => run()) as Promise<T>;
  }
  return run();
}

/** Best-effort synchronous mutation (used from `pagehide`, where async locks may not finish). */
export function transactSync(fn: (s: DemoState) => void) {
  try {
    const s = load();
    fn(s);
    persist(s);
  } catch {
    /* ignore */
  }
}

export function snapshot(): DemoState {
  return load();
}

export function resetAll() {
  try {
    localStorage.removeItem(KEY);
    localStorage.setItem(REV, `reset-${Date.now()}`);
  } catch {
    /* ignore */
  }
  mem = null;
  memRev = null;
  load();
  mem = { ...mem! };
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  const onStorage = (e: StorageEvent) => {
    if (e.key === REV || e.key === KEY || e.key === null) {
      load();
      cb();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", onStorage);
  };
}

/** React hook: live view of the demo database (updates across tabs). */
export function useDemoState(): DemoState | null {
  return useSyncExternalStore(subscribe, load, () => null);
}
