"use client";
/**
 * Simulated network layer between the participant UI and the demo backend.
 * - adds realistic latency
 * - can inject failures (admin setting) — half of them "lost request", half "lost response"
 *   (the server already committed), which proves that saves are idempotent
 * - `callWithRetry` retries with exponential backoff until the server confirms the save
 */
import { snapshot, transact } from "./store";
import { ServerError } from "./engine";
import type { DemoState } from "./types";

export class NetworkError extends Error {}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function call<T>(op: (s: DemoState) => T): Promise<T> {
  const rate = snapshot().settings.networkFailureRate;
  await sleep(90 + Math.random() * 160);
  const roll = Math.random();
  if (roll < rate / 2) throw new NetworkError("request lost");
  const result = await transact(op);
  await sleep(40 + Math.random() * 80);
  if (roll < rate) throw new NetworkError("response lost");
  return result;
}

export interface RetryHooks {
  onRetry?: (attempt: number, err: unknown) => void;
}

export async function callWithRetry<T>(op: (s: DemoState) => T, hooks: RetryHooks = {}): Promise<T> {
  let attempt = 0;
  for (;;) {
    try {
      return await call(op);
    } catch (e) {
      if (e instanceof ServerError) throw e;
      attempt++;
      hooks.onRetry?.(attempt, e);
      await sleep(Math.min(8000, 400 * 2 ** (attempt - 1)));
    }
  }
}
