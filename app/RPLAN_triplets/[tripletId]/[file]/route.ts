import { defectOf, getTriplet } from "@/lib/dataset";
import { planSvg } from "@/lib/floorplan";

/**
 * Demo image server: mirrors the client's folder layout RPLAN_triplets/{triplet_id}/{a,b,c}.png.
 * To use the real images, place them under public/RPLAN_triplets/ with the same paths.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ tripletId: string; file: string }> }) {
  const { tripletId, file } = await ctx.params;
  const t = getTriplet(decodeURIComponent(tripletId));
  const role = ({ "a.png": "anchor_id", "b.png": "b_id", "c.png": "c_id" } as const)[file as "a.png"];
  if (!t || !role) return new Response("Not found", { status: 404 });

  const defect = defectOf(t.triplet_id, file);
  if (defect === "missing") return new Response("Not found", { status: 404 });
  if (defect === "corrupt") {
    return new Response(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x00, 0x13, 0x37, 0x00, 0xde, 0xad]), {
      headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=31536000, immutable" },
    });
  }
  return new Response(planSvg(Number(t[role])), {
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
