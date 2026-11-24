import { NextRequest } from "next/server";
import { z } from "zod";
import { fail, ok } from "@/lib/api";
import { setOrderStatus } from "@/lib/orders";

export const maxDuration = 30;

const Patch = z.object({
  sellerId: z.string().uuid(),
  status: z.enum(["placed", "confirmed", "shipped", "delivered"]),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const b = Patch.parse(await req.json());
    return ok(await setOrderStatus(id, b.sellerId, b.status));
  } catch (e) {
    return fail(e);
  }
}
