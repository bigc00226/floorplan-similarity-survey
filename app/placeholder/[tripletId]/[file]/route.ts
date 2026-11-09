import { getTriplet } from "@/lib/dataset";
import { planSvg } from "@/lib/floorplan";

/**
 * 練習・注意力確認用の仮画像（依頼者様がご用意される画像に差し替える前提）。
 * 本試行の画像は public/RPLAN_triplets/ の実データを静的配信しています。
 */
export async function GET(_req: Request, ctx: { params: Promise<{ tripletId: string; file: string }> }) {
  const { tripletId, file } = await ctx.params;
  const t = getTriplet(decodeURIComponent(tripletId));
  const role = ({ a: "anchor_id", b: "b_id", c: "c_id" } as const)[file as "a"];
  if (!t || !role || t.pool === "main") return new Response("Not found", { status: 404 });
  return new Response(planSvg(Number(t[role])), {
    headers: { "Content-Type": "image/svg+xml; charset=utf-8", "Cache-Control": "public, max-age=31536000, immutable" },
  });
}
