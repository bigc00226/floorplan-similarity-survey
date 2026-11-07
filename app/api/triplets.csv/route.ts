import { tripletsCsv } from "@/lib/dataset";

export const dynamic = "force-static";

export function GET() {
  return new Response(tripletsCsv(), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="demo_triplets.csv"',
    },
  });
}
