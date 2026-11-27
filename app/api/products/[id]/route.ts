import { NextRequest } from "next/server";
import { z } from "zod";
import { fail, ok } from "@/lib/api";
import { getStore } from "@/lib/store";

const Patch = z.object({ sellerId: z.string().uuid(), status: z.enum(["draft", "published"]) });

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const b = Patch.parse(await req.json());
    await getStore().setProductStatus(id, b.sellerId, b.status);
    return ok({ ok: true });
  } catch (e) {
    return fail(e);
  }
}
