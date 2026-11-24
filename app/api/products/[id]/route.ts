import { NextRequest } from "next/server";
import { z } from "zod";
import { ApiError, fail, ok } from "@/lib/api";
import { getAdminSupabase } from "@/lib/supabase/server";

const Patch = z.object({ sellerId: z.string().uuid(), status: z.enum(["draft", "published"]) });

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const b = Patch.parse(await req.json());
    const { error } = await getAdminSupabase()
      .from("products")
      .update({ status: b.status })
      .eq("id", id)
      .eq("seller_id", b.sellerId);
    if (error) throw new ApiError(500, "db_error", error.message);
    return ok({ ok: true });
  } catch (e) {
    return fail(e);
  }
}
