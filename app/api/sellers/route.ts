import { NextRequest } from "next/server";
import { ApiError, fail, ok, rid, uploadPublic } from "@/lib/api";
import { getStore } from "@/lib/store";
import { normalizeLang } from "@/lib/languages";
import { sarvamAvailable, speechToText } from "@/lib/sarvam";

export const maxDuration = 45;

/**
 * Seller onboarding. multipart:
 *   name, language, city, state, craft, gender
 *   introAudio? (WAV) — stored in voice-intros + transcribed with Sarvam STT
 *   introText?  — transcript from browser STT / typed (fallback)
 */
export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const name = String(form.get("name") || "").trim().slice(0, 60);
    if (!name) throw new ApiError(400, "no_name", "Name is required");
    const language = normalizeLang(form.get("language"));
    const gender = form.get("gender") === "male" ? "male" : "female";
    const str = (k: string) => {
      const v = String(form.get(k) || "").trim();
      return v ? v.slice(0, 80) : null;
    };

    let voice_intro_url: string | null = null;
    let voice_intro_transcript: string | null = str("introText");
    const audio = form.get("introAudio");
    if (audio instanceof Blob && audio.size > 0) {
      if (audio.size > 4_000_000) throw new ApiError(413, "too_large", "Intro too long");
      const type = (audio.type || "audio/wav").split(";")[0];
      const ext = type.includes("wav") ? "wav" : type.includes("mp4") ? "m4a" : "webm";
      const [url, stt] = await Promise.all([
        uploadPublic("voice-intros", `${rid()}.${ext}`, audio, type),
        sarvamAvailable()
          ? speechToText(audio, { language, filename: `intro.${ext}` }).catch((e) => {
              console.warn("intro STT failed:", e.message);
              return null;
            })
          : Promise.resolve(null),
      ]);
      voice_intro_url = url;
      if (stt?.transcript) voice_intro_transcript = stt.transcript;
    }

    const data = await getStore().insertSeller({
        name,
        language,
        gender,
        city: str("city"),
        state: str("state"),
        craft: str("craft"),
        voice_intro_url,
      voice_intro_transcript,
    });
    return ok(data);
  } catch (e) {
    return fail(e);
  }
}
