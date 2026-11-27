import { fail, ok } from "@/lib/api";
import { getStore } from "@/lib/store";
import { sarvamAvailable, textToSpeech } from "@/lib/sarvam";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Re-seeds the demo sellers, products, conversation and order (Supabase or in-memory). */
export async function POST() {
  try {
    const store = getStore();
    const tts =
      store.mode === "supabase" && sarvamAvailable()
        ? async (text: string, lang: string, gender: "female" | "male") =>
            Buffer.from((await textToSpeech(text, lang, gender)).base64, "base64")
        : undefined;
    const logs: string[] = [];
    const result = await store.reset({ tts, log: (s) => logs.push(s) });
    return ok({ ok: true, mode: store.mode, result, logs });
  } catch (e) {
    return fail(e);
  }
}
