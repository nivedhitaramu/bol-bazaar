import { NextRequest } from "next/server";
import { ApiError, fail, ok } from "@/lib/api";
import { getConversation, getConversationOrders, getMessages } from "@/lib/data";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const since = req.nextUrl.searchParams.get("messagesOnly");
    if (since) return ok({ messages: await getMessages(id) });
    const [conversation, messages, orders] = await Promise.all([getConversation(id), getMessages(id), getConversationOrders(id)]);
    if (!conversation) throw new ApiError(404, "not_found", "Conversation not found");
    return ok({ conversation, messages, orders });
  } catch (e) {
    return fail(e);
  }
}
