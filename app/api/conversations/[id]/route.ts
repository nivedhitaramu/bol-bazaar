import { NextRequest } from "next/server";
import { z } from "zod";
import { ApiError, fail, ok } from "@/lib/api";
import { getConversation, getConversationOrders, getMessages } from "@/lib/data";
import { getPresence, setPresence } from "@/lib/presence";

export const dynamic = "force-dynamic";

/**
 * GET                  → { conversation, messages, orders }
 * GET ?messagesOnly=1  → { messages, orders, presence }   (the polling path when Realtime is off)
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (req.nextUrl.searchParams.get("messagesOnly")) {
      const [messages, orders] = await Promise.all([getMessages(id), getConversationOrders(id)]);
      return ok({ messages, orders, presence: getPresence(id) });
    }
    const [conversation, messages, orders] = await Promise.all([getConversation(id), getMessages(id), getConversationOrders(id)]);
    if (!conversation) throw new ApiError(404, "not_found", "Conversation not found");
    return ok({ conversation, messages, orders });
  } catch (e) {
    return fail(e);
  }
}

const Status = z.object({
  side: z.enum(["buyer", "seller"]),
  state: z.enum(["idle", "listening", "translating", "speaking"]),
});

/** POST { side, state } — live status for polling clients. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const b = Status.parse(await req.json());
    setPresence(id, b.side, b.state);
    return ok({ ok: true });
  } catch (e) {
    return fail(e);
  }
}
