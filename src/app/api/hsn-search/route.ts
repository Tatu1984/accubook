import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { optional } from "@/backend/validators/common";
import { searchHsn } from "@/backend/services/india/hsn-library";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const querySchema = z.object({
  q: z.string().min(1, "q is required"),
  type: optional(z.enum(["HSN", "SAC"])),
  limit: optional(z.coerce.number().int().positive().max(50)),
});

/**
 * GET /api/hsn-search?q=...&type=HSN|SAC&limit=20
 *
 * Public lookup over the curated HSN/SAC library. Used by the line-item
 * HSN auto-complete in invoice / bill / item-master forms. Not org-
 * scoped — the HSN code list is the same for everyone.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const parsed = querySchema.safeParse({
    q: searchParams.get("q"),
    type: searchParams.get("type") ?? undefined,
    limit: searchParams.get("limit") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid query parameters", details: parsed.error.issues },
      { status: 400 }
    );
  }

  const results = searchHsn(parsed.data.q, {
    type: parsed.data.type,
    limit: parsed.data.limit,
  });

  return NextResponse.json({ results, count: results.length });
}
