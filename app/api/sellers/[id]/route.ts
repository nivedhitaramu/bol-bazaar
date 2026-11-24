import { NextRequest } from "next/server";
import { ApiError, fail, ok } from "@/lib/api";
import { getSeller } from "@/lib/data";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const s = await getSeller(id);
    if (!s) throw new ApiError(404, "not_found", "Seller not found");
    return ok(s);
  } catch (e) {
    return fail(e);
  }
}
