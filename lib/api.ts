import "server-only";
import { NextResponse } from "next/server";
import { ConfigError, getAdminSupabase } from "./supabase/server";
import { SarvamError, sarvamAvailable, speechToText, textToSpeech, translateText, type TranslateMode } from "./sarvam";

export class ApiError extends Error {
  constructor(public status: number, public code: string, message?: string) {
    super(message ?? code);
  }
}

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

export function fail(e: unknown) {
  if (e instanceof ApiError) return NextResponse.json({ error: e.message, code: e.code }, { status: e.status });
  if (e instanceof ConfigError) return NextResponse.json({ error: e.message, code: "not_configured" }, { status: 503 });
  if (e instanceof SarvamError)
    return NextResponse.json({ error: e.message, code: `${e.service}_unavailable` }, { status: 502 });
  console.error(e);
  return NextResponse.json({ error: (e as Error)?.message || "Server error", code: "server_error" }, { status: 500 });
}

/**
 * Reads either `text` (typed, or from browser SpeechRecognition) or `audio` (WAV from the
 * recorder) from a multipart form and returns a transcript.
 */
export async function voiceInput(
  form: FormData,
  lang: string
): Promise<{ transcript: string; via: "sarvam" | "text"; detectedLanguage: string | null }> {
  const text = form.get("text");
  if (typeof text === "string" && text.trim()) return { transcript: text.trim(), via: "text", detectedLanguage: null };
  const audio = form.get("audio");
  if (!(audio instanceof Blob) || audio.size === 0) throw new ApiError(400, "no_input", "Send audio or text");
  if (audio.size > 4_000_000) throw new ApiError(413, "audio_too_large", "Recording too long");
  if (!sarvamAvailable()) throw new ApiError(503, "stt_unavailable", "Speech recognition unavailable");
  try {
    const r = await speechToText(audio, { language: lang || "unknown", filename: "speech.wav" });
    if (!r.transcript) throw new ApiError(422, "empty_transcript", "Could not hear anything");
    return { transcript: r.transcript, via: "sarvam", detectedLanguage: r.languageCode };
  } catch (e) {
    if (e instanceof ApiError) throw e;
    console.warn("STT failed:", (e as Error).message);
    throw new ApiError(503, "stt_unavailable", "Speech recognition unavailable");
  }
}

export async function translateSafe(
  text: string,
  source: string,
  target: string,
  mode: TranslateMode = "modern-colloquial"
): Promise<{ text: string; ok: boolean }> {
  if (!text.trim() || source === target) return { text, ok: true };
  if (!sarvamAvailable()) return { text, ok: false };
  try {
    return { text: await translateText(text, source, target, mode), ok: true };
  } catch (e) {
    console.warn("translate failed:", (e as Error).message);
    return { text, ok: false };
  }
}

export async function ttsSafe(
  text: string,
  lang: string,
  gender: "female" | "male" = "female",
  role: "seller" | "buyer" = "seller"
) {
  if (!sarvamAvailable() || !text.trim()) return null;
  try {
    return await textToSpeech(text, lang, gender, role);
  } catch (e) {
    console.warn("tts failed:", (e as Error).message);
    return null;
  }
}

export async function uploadPublic(bucket: string, path: string, data: Blob | Buffer, contentType: string) {
  const sb = getAdminSupabase();
  const { error } = await sb.storage.from(bucket).upload(path, data, { contentType, upsert: true });
  if (error) throw new ApiError(500, "upload_failed", `Upload failed: ${error.message}`);
  return sb.storage.from(bucket).getPublicUrl(path).data.publicUrl;
}

export function rid() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
