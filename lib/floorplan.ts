/**
 * Procedural floor-plan renderer used ONLY for the demo (the real study uses the client's RPLAN PNGs).
 * Mimics the client's visual convention: 18 m × 18 m canvas, black walls, white interior,
 * gray exterior, entrance always at the bottom, no room labels / furniture.
 *
 * Plan id = family * 10 + variant. Plans in the same family share footprint and room structure,
 * variants jitter proportions — so "similar" B/C look plausibly similar to A.
 */
import { randRange, rngFrom, type Rng } from "./rng";

interface R {
  x: number;
  y: number;
  w: number;
  h: number;
}

const CANVAS = 18; // meters
const PX = 256;
const S = PX / CANVAS;
const MIN_ROOM = 2.3;
const snap = (v: number) => Math.round(v * 4) / 4;
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

/**
 * Binary space partition into rooms. Every node draws from its own RNG stream keyed by its path,
 * so a variant's proportional jitter never cascades into a completely different structure.
 */
function bsp(r: R, depth: number, family: number, planId: number, path: string, out: R[]) {
  const fr = rngFrom(`f${family}:${path}`);
  const vr = rngFrom(`v${planId}:${path}`);
  const longH = r.w >= r.h;
  const orientRoll = fr();
  const stopRoll = fr();
  const ratioBase = randRange(fr, 0.34, 0.66);
  const jitter = (vr() - 0.5) * 0.12;
  const mergeRoll = vr();

  const stopP = [0, 0, 0.18, 0.6, 1][Math.min(depth, 4)];
  const big = r.w * r.h;
  if (stopRoll < stopP || big < MIN_ROOM * MIN_ROOM * 2.1 || (depth >= 3 && mergeRoll < 0.18)) {
    out.push(r);
    return;
  }
  const horizontalCut = longH ? orientRoll < 0.2 : orientRoll < 0.8; // cut across the long side mostly
  const ratio = clamp(ratioBase + jitter, 0.26, 0.74);
  if (!horizontalCut) {
    const cut = snap(r.w * ratio);
    if (cut < MIN_ROOM || r.w - cut < MIN_ROOM) return void out.push(r);
    bsp({ x: r.x, y: r.y, w: cut, h: r.h }, depth + 1, family, planId, path + "0", out);
    bsp({ x: r.x + cut, y: r.y, w: r.w - cut, h: r.h }, depth + 1, family, planId, path + "1", out);
  } else {
    const cut = snap(r.h * ratio);
    if (cut < MIN_ROOM || r.h - cut < MIN_ROOM) return void out.push(r);
    bsp({ x: r.x, y: r.y, w: r.w, h: cut }, depth + 1, family, planId, path + "0", out);
    bsp({ x: r.x, y: r.y + cut, w: r.w, h: r.h - cut }, depth + 1, family, planId, path + "1", out);
  }
}

interface Shared {
  a: number;
  b: number;
  horizontal: boolean; // wall runs horizontally
  fixed: number; // y for horizontal walls, x for vertical walls
  len: number;
  start: number;
}

function sharedEdge(p: R, q: R): Shared | null {
  const eps = 0.01;
  // vertical shared wall
  for (const [l, r] of [
    [p, q],
    [q, p],
  ] as const) {
    if (Math.abs(l.x + l.w - r.x) < eps) {
      const s = Math.max(l.y, r.y);
      const e = Math.min(l.y + l.h, r.y + r.h);
      if (e - s > 1.3) return { a: 0, b: 0, horizontal: false, fixed: r.x, len: e - s, start: s };
    }
    if (Math.abs(l.y + l.h - r.y) < eps) {
      const s = Math.max(l.x, r.x);
      const e = Math.min(l.x + l.w, r.x + r.w);
      if (e - s > 1.3) return { a: 0, b: 0, horizontal: true, fixed: r.y, len: e - s, start: s };
    }
  }
  return null;
}

export function generatePlan(planId: number) {
  const family = Math.floor(planId / 10);
  const fr = rngFrom(`fam-${family}`);
  const vr = rngFrom(`var-${planId}`);

  const vj = () => 1 + (vr() - 0.5) * 0.12;
  const W = snap(clamp(randRange(fr, 9, 13.5) * vj(), 8, 14));
  const H = snap(clamp(randRange(fr, 7, 11.5) * vj(), 6.5, 12));
  const main: R = { x: snap((CANVAS - W) / 2 + (fr() - 0.5) * 1.2), y: snap((CANVAS - H) / 2 + (fr() - 0.5) * 1.2), w: W, h: H };

  const rects: R[] = [];
  bsp(main, 0, family, planId, "r", rects);

  // Extensions (L / T shapes)
  const extCount = Math.floor(fr() * 2.6);
  for (let i = 0; i < extCount; i++) {
    const side = Math.floor(fr() * 4); // 0 top,1 right,2 bottom,3 left
    const along = fr();
    const ew = snap(randRange(fr, 2.5, 4.6) * vj());
    const ed = snap(randRange(fr, 1.8, 3.4) * vj());
    const drop = vr() < 0.12;
    if (drop) continue;
    let e: R;
    if (side === 0 || side === 2) {
      const w = Math.min(ew, main.w - 0.5);
      const x = snap(main.x + (main.w - w) * along);
      e = side === 0 ? { x, y: main.y - ed, w, h: ed } : { x, y: main.y + main.h, w, h: ed };
    } else {
      const h = Math.min(ew, main.h - 0.5);
      const y = snap(main.y + (main.h - h) * along);
      e = side === 3 ? { x: main.x - ed, y, w: ed, h } : { x: main.x + main.w, y, w: ed, h };
    }
    if (e.x < 0.6 || e.y < 0.6 || e.x + e.w > CANVAS - 0.6 || e.y + e.h > CANVAS - 0.6) continue;
    if (rects.some((r) => r !== main && overlap(r, e) && !rectsFromMain(r, main))) continue;
    rects.push(e);
  }

  // Doors: spanning tree over adjacency + a few extra connections
  const n = rects.length;
  const edges: { i: number; j: number; s: Shared }[] = [];
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++) {
      const s = sharedEdge(rects[i], rects[j]);
      if (s) edges.push({ i, j, s });
    }
  const parent = rects.map((_, i) => i);
  const find = (x: number): number => (parent[x] === x ? x : (parent[x] = find(parent[x])));
  const order = edges.map((e) => ({ e, k: vr() })).sort((p, q) => p.k - q.k);
  const doors: Shared[] = [];
  for (const { e } of order) {
    const a = find(e.i);
    const b = find(e.j);
    if (a !== b) {
      parent[a] = b;
      doors.push(e.s);
    } else if (vr() < 0.15) doors.push(e.s);
  }

  // Entrance on the lowest exterior wall
  const bottom = Math.max(...rects.map((r) => r.y + r.h));
  const bottomRooms = rects.filter((r) => Math.abs(r.y + r.h - bottom) < 0.01 && r.w > 1.6);
  const er = bottomRooms[Math.floor(fr() * bottomRooms.length)] ?? rects[0];
  const entrance = { x: er.x + 0.4 + (er.w - 1.8) * fr(), y: bottom, len: 1.0 };

  return { rects, doors, entrance };
}

function overlap(a: R, b: R) {
  return a.x < b.x + b.w - 0.01 && b.x < a.x + a.w - 0.01 && a.y < b.y + b.h - 0.01 && b.y < a.y + a.h - 0.01;
}
function rectsFromMain(r: R, m: R) {
  return r.x >= m.x - 0.01 && r.y >= m.y - 0.01 && r.x + r.w <= m.x + m.w + 0.01 && r.y + r.h <= m.y + m.h + 0.01;
}

const f1 = (v: number) => (Math.round(v * S * 10) / 10).toString();

export function planSvg(planId: number): string {
  const { rects, doors, entrance } = generatePlan(planId);
  const wall = 0.22 * S;
  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${PX} ${PX}" width="${PX * 2}" height="${PX * 2}" shape-rendering="crispEdges">`,
  );
  parts.push(`<rect width="${PX}" height="${PX}" fill="#cfcfcf"/>`);
  for (const r of rects) parts.push(`<rect x="${f1(r.x)}" y="${f1(r.y)}" width="${f1(r.w)}" height="${f1(r.h)}" fill="#fff"/>`);
  for (const r of rects)
    parts.push(
      `<rect x="${f1(r.x)}" y="${f1(r.y)}" width="${f1(r.w)}" height="${f1(r.h)}" fill="none" stroke="#000" stroke-width="${wall.toFixed(1)}" stroke-linejoin="miter"/>`,
    );
  const doorLen = 0.85;
  for (const d of doors) {
    const pos = d.start + 0.25 + (d.len - doorLen - 0.5) * ((d.fixed * 7.31 + d.start * 3.17) % 1);
    if (d.horizontal) {
      parts.push(`<rect x="${f1(pos)}" y="${((d.fixed * S) - wall).toFixed(1)}" width="${f1(doorLen)}" height="${(wall * 2).toFixed(1)}" fill="#fff"/>`);
    } else {
      parts.push(`<rect x="${((d.fixed * S) - wall).toFixed(1)}" y="${f1(pos)}" width="${(wall * 2).toFixed(1)}" height="${f1(doorLen)}" fill="#fff"/>`);
    }
  }
  parts.push(
    `<rect x="${f1(entrance.x)}" y="${(entrance.y * S - wall).toFixed(1)}" width="${f1(entrance.len)}" height="${(wall * 1.6).toFixed(1)}" fill="#fff"/>`,
  );
  parts.push(`</svg>`);
  return parts.join("");
}
