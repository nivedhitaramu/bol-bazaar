import { fail, ok } from "@/lib/api";
import { getAdminSupabase } from "@/lib/supabase/server";
import { seedDemo } from "@/lib/seed";
import { sarvamAvailable, textToSpeech } from "@/lib/sarvam";

export const maxDuration = 60;

/** Re-seeds the demo sellers, products, conversation and order. */
export async function POST() {
  try {
    const sb = getAdminSupabase();
    const tts = sarvamAvailable()
      ? async (text: string, lang: string, gender: "female" | "male") =>
          Buffer.from((await textToSpeech(text, lang, gender)).base64, "base64")
      : undefined;
    const logs: string[] = [];
    const result = await seedDemo(sb, { tts, log: (s) => logs.push(s) });
    return ok({ ok: true, result, logs });
  } catch (e) {
    return fail(e);
  }
}
