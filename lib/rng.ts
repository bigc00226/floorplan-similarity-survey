/** Deterministic pseudo-random helpers (used for demo data generation and simulations). */

export type Rng = () => number;

/** Mulberry32 PRNG: small, fast and good enough for sampling/shuffling. */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** FNV-1a string hash → 32-bit seed. */
export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export const rngFrom = (key: string | number) => mulberry32(typeof key === "number" ? key : hashString(key));

export function randInt(rng: Rng, min: number, maxInclusive: number) {
  return min + Math.floor(rng() * (maxInclusive - min + 1));
}

export function randRange(rng: Rng, min: number, max: number) {
  return min + rng() * (max - min);
}

export function shuffle<T>(arr: T[], rng: Rng = Math.random): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function uid(prefix = ""): string {
  const c = globalThis.crypto as Crypto | undefined;
  if (c?.randomUUID) return prefix + c.randomUUID();
  return prefix + Math.random().toString(36).slice(2) + Date.now().toString(36);
}
