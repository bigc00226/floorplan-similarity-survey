/**
 * Demo dataset: 3,000 triplets that mimic the client's CSV
 * (triplet_id, anchor_id, b_id, c_id) and folder layout RPLAN_triplets/{triplet_id}/{a,b,c}.png.
 *
 * In production this module is replaced by the imported CSV (stored in the DB) and the real PNGs
 * (stored in object storage). Everything is deterministic so the server (image route) and the
 * browser see exactly the same data.
 */
import { CONDITIONS, type Condition, type Triplet } from "./types";
import { randInt, rngFrom } from "./rng";

export const ANCHOR_COUNT = 300;
/** per anchor: a×2, b×1, c×1, d×2, e×1, f×1, g×2 = 10 triplets → 3,000 total (ratio 2:1:1:2:1:1:2) */
const PER_ANCHOR: Record<Condition, number> = { a: 2, b: 1, c: 1, d: 2, e: 1, f: 1, g: 2 };

/** Probability that B / C come from the same layout family as the anchor (looks similar). */
const SIMILAR_PROB: Record<Condition, [number, number]> = {
  a: [0.9, 0.1],
  b: [0.85, 0.85],
  c: [0.15, 0.15],
  d: [0.8, 0.3],
  e: [0.6, 0.6],
  f: [0.95, 0.5],
  g: [0.7, 0.05],
};

/** Intentional defects so the import validator has something to find (demo only). */
export const INJECTED_DEFECTS: { index: number; file: "a.png" | "b.png" | "c.png"; kind: "missing" | "corrupt" }[] = [
  { index: 237, file: "c.png", kind: "missing" },
  { index: 1481, file: "b.png", kind: "corrupt" },
  { index: 2606, file: "a.png", kind: "missing" },
];

export function parseCondition(tripletId: string): Condition | null {
  const m = /^\d+_([a-g])_\d+$/.exec(tripletId);
  return m ? (m[1] as Condition) : null;
}

function makeMain(): Triplet[] {
  const rng = rngFrom("dataset-v1");
  const out: Triplet[] = [];
  const usedFamilies = new Set<number>();
  for (let i = 0; i < ANCHOR_COUNT; i++) {
    let family = 1000 + i * 3 + randInt(rng, 0, 2);
    while (usedFamilies.has(family)) family++;
    usedFamilies.add(family);
    const anchorVariant = randInt(rng, 1, 9);
    const anchor = family * 10 + anchorVariant;
    for (const cond of CONDITIONS) {
      for (let k = 1; k <= PER_ANCHOR[cond]; k++) {
        const pick = (similar: boolean) => {
          if (similar) {
            let v = randInt(rng, 0, 9);
            if (v === anchorVariant) v = (v + 1 + randInt(rng, 0, 7)) % 10;
            return family * 10 + v;
          }
          let f = randInt(rng, 1000, 1999);
          if (f === family) f += 1;
          return f * 10 + randInt(rng, 0, 9);
        };
        const [pb, pc] = SIMILAR_PROB[cond];
        let b = pick(rng() < pb);
        let c = pick(rng() < pc);
        if (b === c) c = pick(false);
        if (rng() < 0.5) [b, c] = [c, b];
        out.push({
          triplet_id: `${anchor}_${cond}_${k}`,
          anchor_id: String(anchor),
          b_id: String(b),
          c_id: String(c),
          condition: cond,
          pool: "main",
        });
      }
    }
  }
  return out;
}

function makeExtra(): Triplet[] {
  const extra: Triplet[] = [];
  const mk = (id: string, pool: Triplet["pool"], a: number, b: number, c: number): Triplet => ({
    triplet_id: id,
    anchor_id: String(a),
    b_id: String(b),
    c_id: String(c),
    condition: "a",
    pool,
  });
  extra.push(mk("example", "example", 90013, 90013, 90013));
  extra.push(mk("practice_1", "practice", 90101, 90104, 91207));
  extra.push(mk("practice_2", "practice", 90302, 92408, 90306));
  extra.push(mk("practice_3", "practice", 90505, 90509, 93101));
  extra.push(mk("attention_1", "attention", 90701, 90703, 94204));
  extra.push(mk("attention_2", "attention", 90902, 95301, 90905));
  return extra;
}

let cache: { main: Triplet[]; extra: Triplet[]; byId: Map<string, Triplet> } | null = null;

function build() {
  if (cache) return cache;
  const main = makeMain();
  const extra = makeExtra();
  const byId = new Map<string, Triplet>();
  for (const t of [...main, ...extra]) byId.set(t.triplet_id, t);
  cache = { main, extra, byId };
  return cache;
}

export const mainTriplets = () => build().main;
export const getTriplet = (id: string) => build().byId.get(id);
export const practiceTriplets = () => build().extra.filter((t) => t.pool === "practice");
export const attentionTriplets = () => build().extra.filter((t) => t.pool === "attention");

/** Returns "missing" | "corrupt" | null for a given file of a triplet (demo defect injection). */
export function defectOf(tripletId: string, file: string): "missing" | "corrupt" | null {
  const main = build().main;
  for (const d of INJECTED_DEFECTS) {
    if (main[d.index]?.triplet_id === tripletId && d.file === file) return d.kind;
  }
  return null;
}

export function defectList() {
  const main = build().main;
  return INJECTED_DEFECTS.map((d) => ({ triplet_id: main[d.index].triplet_id, file: d.file, kind: d.kind }));
}

export function imagePath(tripletId: string, file: "a.png" | "b.png" | "c.png") {
  return `/RPLAN_triplets/${encodeURIComponent(tripletId)}/${file}`;
}

/** Map a role to the file name inside the triplet folder. */
export const roleFile = { a: "a.png", b: "b.png", c: "c.png" } as const;

export function tripletsCsv(): string {
  const lines = ["triplet_id,anchor_id,b_id,c_id"];
  for (const t of mainTriplets()) lines.push(`${t.triplet_id},${t.anchor_id},${t.b_id},${t.c_id}`);
  return lines.join("\n") + "\n";
}
