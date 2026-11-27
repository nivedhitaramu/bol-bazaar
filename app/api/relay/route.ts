import { NextRequest } from "next/server";
import { ApiError, fail, ok, voiceInput } from "@/lib/api";
import { loadConversation, postMessage, sideLanguages } from "@/lib/chat";

export const maxDuration = 30;

/**
 * The live-chat hot path, in ONE round trip:
 *   audio (or text) → Sarvam STT → Sarvam Translate → Sarvam TTS → Storage → messages INSERT
 * The INSERT fans out over Supabase Realtime; the other device auto-plays audio_url.
 *
 * multipart: conversationId, sender ("buyer" | "seller"), audio | text
 */
export async function POST(req: NextRequest) {
  const t0 = Date.now();
  try {
    const form = await req.formData();
    const conversationId = String(form.get("conversationId") || "");
    const sender = form.get("sender");
    if (!conversationId) throw new ApiError(400, "no_conversation", "conversationId required");
    if (sender !== "buyer" && sender !== "seller") throw new ApiError(400, "bad_sender", "sender must be buyer or seller");

    const conv = await loadConversation(conversationId);
    const { from } = sideLanguages(conv, sender);

    const s0 = Date.now();
    // STT auto-detects the spoken language ("unknown"); typed text is detected from its script / text-lid.
    const input = await voiceInput(form, "unknown");
    const stt_ms = input.via === "sarvam" ? Date.now() - s0 : 0;

    const r = await postMessage({
      conv,
      sender,
      text: input.transcript,
      sourceLang: input.detectedLanguage ?? from, // hint only; postMessage verifies against the script
    });
    return ok({
      message: r.message,
      translatedOk: r.translatedOk,
      ttsOk: r.ttsOk,
      flagged: r.flagged,
      missing: r.missing,
      timings: { ...r.timings, stt_ms, total_ms: Date.now() - t0 },
    });
  } catch (e) {
    return fail(e);
  }
}
