import { NextRequest } from "next/server";
import { ApiError, fail, ok } from "@/lib/api";
import { getDashboard } from "@/lib/data";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const d = await getDashboard(id);
    if (!d) throw new ApiError(404, "not_found", "Seller not found");
    return ok(d);
  } catch (e) {
    return fail(e);
  }
}
