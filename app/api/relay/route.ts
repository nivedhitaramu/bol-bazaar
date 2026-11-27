import { NextRequest } from "next/server";
import { ApiError, fail, ok, ttsSafe, voiceInput } from "@/lib/api";
import { loadConversation, postMessage, sideLanguages } from "@/lib/chat";
import { normalizeLang } from "@/lib/languages";
import {
  clarifyPrompt,
  confirmPrompt,
  findConfusable,
  isUndo,
  simulatedConfusion,
  valuesToConfirm,
} from "@/lib/recovery";

export const maxDuration = 30;

/**
 * The live-chat hot path, in ONE round trip:
 *   audio (or text) → Sarvam STT → Sarvam Translate → Sarvam TTS → Storage → messages INSERT
 * The INSERT fans out over Supabase Realtime; the other device auto-plays audio_url.
 *
 * multipart: conversationId, sender ("buyer" | "seller"), audio | text
 * Recovery checks (opt-in with checks=1) — nothing is sent until the speaker agrees:
 *   action "undo"    — "No, wrong" / "illa, thappu" / "nahi, galat": take back the last message
 *   action "clarify" — a sound-alike word ("zari" ↔ "saree"): ask about ONLY that word
 *   action "confirm" — prices / quantities / phone numbers: read back, wait for "yes"
 *   action "sent"    — delivered
 * Flags: clarified=1 / confirmed=1 (the answer came back), simulateNoise=1 (/demo).
 */
export async function POST(req: NextRequest) {
  const t0 = Date.now();
  try {
    const form = await req.formData();
    const conversationId = String(form.get("conversationId") || "");
    const sender = form.get("sender");
    if (!conversationId) throw new ApiError(400, "no_conversation", "conversationId required");
    if (sender !== "buyer" && sender !== "seller") throw new ApiError(400, "bad_sender", "sender must be buyer or seller");
    const flag = (k: string) => form.get(k) === "1";

    const conv = await loadConversation(conversationId);
    const { from } = sideLanguages(conv, sender);
    const speakerLang = normalizeLang(from);

    const s0 = Date.now();
    // STT auto-detects the spoken language ("unknown"); typed text is detected from its script / text-lid.
    const input = await voiceInput(form, "unknown");
    const stt_ms = input.via === "sarvam" ? Date.now() - s0 : 0;
    const transcript = input.transcript;

    if (flag("checks")) {
      /** A prompt back to the speaker, spoken in their language (audio in the same response). */
      const ask = async (action: "clarify" | "confirm", prompt: string, extra: Record<string, unknown>) => {
        const audio = await ttsSafe(prompt, speakerLang);
        return ok({ action, transcript, prompt, audio: audio?.base64 ?? null, mime: audio?.mime ?? null, ...extra, timings: { stt_ms, total_ms: Date.now() - t0 } });
      };

      if (isUndo(transcript)) return ok({ action: "undo", transcript });

      if (flag("simulateNoise")) {
        const clarify = simulatedConfusion(transcript);
        return ask("clarify", clarifyPrompt(clarify, speakerLang), { clarify, simulated: true });
      }
      if (!flag("clarified")) {
        const clarify = findConfusable(transcript);
        if (clarify) return ask("clarify", clarifyPrompt(clarify, speakerLang), { clarify });
      }
      if (!flag("confirmed")) {
        const values = valuesToConfirm(transcript);
        if (values.length) return ask("confirm", confirmPrompt(values, speakerLang), { values });
      }
    }

    const r = await postMessage({
      conv,
      sender,
      text: transcript,
      sourceLang: input.detectedLanguage ?? from, // hint only; postMessage verifies against the script
    });
    return ok({
      action: "sent",
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
