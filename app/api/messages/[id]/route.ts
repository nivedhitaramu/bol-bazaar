import { NextRequest } from "next/server";
import { z } from "zod";
import { ApiError, fail, ok } from "@/lib/api";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

const Body = z.object({ conversationId: z.string().min(1), sender: z.enum(["buyer", "seller"]) });
const UNDO_WINDOW_MS = 10 * 60_000;

/**
 * DELETE — "No, wrong" / "illa, thappu": the sender takes back their own recent message.
 * Only the sender's own message, in that conversation, within 10 minutes.
 */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const b = Body.parse(await req.json());
    const store = getStore();
    const m = await store.getMessage(id);
    if (!m) throw new ApiError(404, "not_found", "Message not found");
    if (m.conversation_id !== b.conversationId || m.sender !== b.sender) throw new ApiError(403, "forbidden", "Not your message");
    if (Date.now() - new Date(m.created_at).getTime() > UNDO_WINDOW_MS) throw new ApiError(409, "too_old", "Too late to undo");
    await store.deleteMessage(id);
    return ok({ ok: true, id });
  } catch (e) {
    return fail(e);
  }
}
