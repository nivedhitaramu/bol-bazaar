import "server-only";
import { NextResponse } from "next/server";
import { ConfigError } from "./supabase/server";
import { getStore } from "./store";
import { translateOffline } from "./dictionary";
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
  mode: TranslateMode = "formal"
): Promise<{ text: string; ok: boolean }> {
  if (!text.trim() || source === target) return { text, ok: true };
  if (sarvamAvailable()) {
    try {
      return { text: await translateText(text, source, target, mode), ok: true };
    } catch (e) {
      console.warn("translate failed, trying offline dictionary:", (e as Error).message);
    }
  }
  // No key (or Sarvam down): built-in phrase dictionary covering the demo conversation.
  const offline = translateOffline(text, source, target);
  return offline != null ? { text: offline, ok: true } : { text, ok: false };
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
  try {
    return await getStore().upload(bucket, path, data, contentType);
  } catch (e) {
    throw new ApiError(500, "upload_failed", (e as Error).message);
  }
}

export function rid() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
