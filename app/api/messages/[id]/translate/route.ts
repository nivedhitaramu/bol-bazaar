import { NextRequest } from "next/server";
import { ApiError, fail, ok, rid, translateSafe, ttsSafe, uploadPublic } from "@/lib/api";
import { getStore } from "@/lib/store";
import { loadConversation } from "@/lib/chat";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * POST — retry a translation that failed earlier ("Translation pending").
 * Never guesses: if the pipeline still can't translate, the message stays original-only (503).
 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const store = getStore();
    const m = await store.getMessage(id);
    if (!m) throw new ApiError(404, "not_found", "Message not found");
    if (m.translated_text) return ok({ message: m });
    const target = m.translated_language;
    if (!target) throw new ApiError(400, "no_target", "No target language");

    const conv = await loadConversation(m.conversation_id);
    const tr = await translateSafe(m.original_text, m.original_language, target, {
      gender: m.sender === "seller" ? conv.seller.gender : undefined,
      names: [conv.seller.name, conv.buyer_name],
    });
    if (!tr.ok) throw new ApiError(503, "translation_pending", "Translation still unavailable");

    const audio = await ttsSafe(tr.text, target, m.sender === "seller" ? conv.seller.gender : "female", m.sender === "seller" ? "seller" : "buyer");
    let audio_url: string | null = null;
    if (audio) {
      try {
        audio_url = await uploadPublic("chat-audio", `${conv.id}/${rid()}.mp3`, Buffer.from(audio.base64, "base64"), audio.mime);
      } catch {}
    }
    const message = await store.updateMessage(id, { translated_text: tr.text, audio_url });
    return ok({ message });
  } catch (e) {
    return fail(e);
  }
}
