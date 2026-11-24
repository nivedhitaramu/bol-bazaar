/**
 * Sarvam AI client (server-side only — reads SARVAM_API_KEY).
 * Endpoints verified against https://docs.sarvam.ai (Nov 2026):
 *   STT        POST /speech-to-text           multipart, model saaras:v4
 *   Translate  POST /translate                json, model mayura:v1
 *   TTS        POST /text-to-speech           json, model bulbul:v3 -> { audios: [base64] }
 *   LLM        POST /v1/chat/completions      json, model sarvam-105b
 */
import { sarvamKey } from "./env";

const BASE = "https://api.sarvam.ai";

export type SarvamService = "stt" | "translate" | "tts" | "llm";

export class SarvamError extends Error {
  constructor(
    public service: SarvamService,
    message: string,
    public status?: number,
    public code?: string
  ) {
    super(`[sarvam:${service}] ${message}`);
    this.name = "SarvamError";
  }
}

export function sarvamAvailable(): boolean {
  return Boolean(sarvamKey());
}

const models = {
  stt: () => process.env.SARVAM_STT_MODEL || "saaras:v4",
  tts: () => process.env.SARVAM_TTS_MODEL || "bulbul:v3",
  translate: () => process.env.SARVAM_TRANSLATE_MODEL || "mayura:v1",
  llm: () => process.env.SARVAM_LLM_MODEL || "sarvam-105b",
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type CallOpts = { timeoutMs: number; retries: number };

async function call<T>(service: SarvamService, path: string, init: RequestInit, opts: CallOpts): Promise<T> {
  const key = sarvamKey();
  if (!key) throw new SarvamError(service, "SARVAM_API_KEY is not set", undefined, "missing_key");

  let lastErr: SarvamError | null = null;
  for (let attempt = 0; attempt <= opts.retries; attempt++) {
    if (attempt > 0) await sleep(250 * 2 ** (attempt - 1));
    try {
      const headers = new Headers(init.headers);
      headers.set("api-subscription-key", key);
      if (service === "llm") headers.set("Authorization", `Bearer ${key}`);
      const res = await fetch(BASE + path, {
        ...init,
        headers,
        signal: AbortSignal.timeout(opts.timeoutMs),
        cache: "no-store",
      });
      if (res.ok) return (await res.json()) as T;

      let message = `HTTP ${res.status}`;
      let code: string | undefined;
      try {
        const body = await res.json();
        message = body?.error?.message || body?.message || body?.detail || JSON.stringify(body).slice(0, 300);
        code = body?.error?.code;
      } catch {}
      lastErr = new SarvamError(service, message, res.status, code);
      // Retry only transient failures.
      if (res.status !== 429 && res.status < 500) throw lastErr;
    } catch (e) {
      if (e instanceof SarvamError && e.status && e.status !== 429 && e.status < 500) throw e;
      if (!(e instanceof SarvamError)) {
        const name = (e as Error)?.name;
        lastErr = new SarvamError(
          service,
          name === "TimeoutError" || name === "AbortError" ? "timed out" : (e as Error)?.message || "network error",
          undefined,
          name === "TimeoutError" ? "timeout" : "network"
        );
      }
    }
  }
  throw lastErr ?? new SarvamError(service, "unknown error");
}

// ───────────────────────── Speech to text ─────────────────────────

export type SttResult = { transcript: string; languageCode: string | null };

export async function speechToText(
  audio: Blob,
  opts: { language?: string | "unknown"; filename?: string; keyterms?: string[] } = {}
): Promise<SttResult> {
  const form = new FormData();
  form.append("file", audio, opts.filename ?? "audio.wav");
  form.append("model", models.stt());
  form.append("mode", "transcribe");
  form.append("language_code", opts.language || "unknown");
  if (opts.keyterms?.length && models.stt() === "saaras:v4") {
    form.append("keyterms", JSON.stringify(opts.keyterms.slice(0, 50).map((k) => k.slice(0, 64))));
  }
  const data = await call<{ transcript: string; language_code: string | null }>(
    "stt",
    "/speech-to-text",
    { method: "POST", body: form },
    { timeoutMs: 20_000, retries: 1 }
  );
  return { transcript: (data.transcript ?? "").trim(), languageCode: data.language_code ?? null };
}

// ───────────────────────── Translation ─────────────────────────

export type TranslateMode = "formal" | "modern-colloquial" | "classic-colloquial" | "code-mixed";

function chunkText(text: string, max: number): string[] {
  if (text.length <= max) return [text];
  const parts = text.split(/(?<=[.!?।\n])\s+/);
  const out: string[] = [];
  let cur = "";
  for (const p of parts) {
    if ((cur + " " + p).length > max && cur) {
      out.push(cur);
      cur = p;
    } else cur = cur ? cur + " " + p : p;
  }
  if (cur) out.push(cur);
  return out.flatMap((c) => (c.length > max ? c.match(new RegExp(`[\\s\\S]{1,${max}}`, "g")) ?? [] : [c]));
}

export async function translateText(
  text: string,
  source: string | "auto",
  target: string,
  mode: TranslateMode = "formal"
): Promise<string> {
  const input = text.trim();
  if (!input || source === target) return input;
  const chunks = chunkText(input, 950);
  const results = await Promise.all(
    chunks.map((chunk) =>
      call<{ translated_text: string }>(
        "translate",
        "/translate",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            input: chunk,
            source_language_code: source,
            target_language_code: target,
            model: models.translate(),
            mode,
            numerals_format: "international",
          }),
        },
        { timeoutMs: 12_000, retries: 1 }
      ).then((r) => r.translated_text)
    )
  );
  return results.join(" ").trim();
}

// ───────────────────────── Text to speech ─────────────────────────

const SPEAKERS = { female: "kavya", male: "aditya" } as const;
const TTS_LANGS = new Set(["bn-IN", "en-IN", "gu-IN", "hi-IN", "kn-IN", "ml-IN", "mr-IN", "od-IN", "pa-IN", "ta-IN", "te-IN"]);

export type TtsResult = { base64: string; mime: string };

export async function textToSpeech(
  text: string,
  language: string,
  gender: "female" | "male" = "female"
): Promise<TtsResult> {
  const clean = text.replace(/\s+/g, " ").trim().slice(0, 2400);
  if (!clean) throw new SarvamError("tts", "empty text");
  if (!TTS_LANGS.has(language)) throw new SarvamError("tts", `language ${language} not supported`);

  const body = (speaker?: string) =>
    JSON.stringify({
      text: clean,
      language_code: language,
      model: models.tts(),
      ...(speaker ? { speaker } : {}),
      pace: 1.05,
      output_audio_codec: "mp3",
      speech_sample_rate: 24000,
    });
  const req = (speaker?: string) =>
    call<{ audios: string[] }>(
      "tts",
      "/text-to-speech",
      { method: "POST", headers: { "Content-Type": "application/json" }, body: body(speaker) },
      { timeoutMs: 15_000, retries: 1 }
    );

  let data: { audios: string[] };
  try {
    data = await req(models.tts() === "bulbul:v3" ? SPEAKERS[gender] : undefined);
  } catch (e) {
    // If the speaker name was rejected (model change), retry with the model's default speaker.
    if (e instanceof SarvamError && e.status === 400 && /speaker/i.test(e.message)) data = await req();
    else throw e;
  }
  const b64 = data.audios?.[0];
  if (!b64) throw new SarvamError("tts", "no audio returned");
  return { base64: b64, mime: "audio/mpeg" };
}

// ───────────────────────── LLM chat ─────────────────────────

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export async function chatCompletion(
  messages: ChatMessage[],
  opts: { json?: boolean; maxTokens?: number; temperature?: number; timeoutMs?: number } = {}
): Promise<string> {
  const base = {
    model: models.llm(),
    messages,
    temperature: opts.temperature ?? 0.2,
    max_tokens: opts.maxTokens ?? 1200,
    reasoning_effort: null, // fast path: no reasoning trace
  };
  const send = (withFormat: boolean) =>
    call<{ choices: Array<{ message: { content: string | null } }> }>(
      "llm",
      "/v1/chat/completions",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(withFormat ? { ...base, response_format: { type: "json_object" } } : base),
      },
      { timeoutMs: opts.timeoutMs ?? 25_000, retries: 1 }
    );

  let data;
  try {
    data = await send(Boolean(opts.json));
  } catch (e) {
    // Some deployments may reject response_format — retry once without it.
    if (opts.json && e instanceof SarvamError && (e.status === 400 || e.status === 422)) data = await send(false);
    else throw e;
  }
  const content = data.choices?.[0]?.message?.content ?? "";
  return content.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
}

/** Pull the first JSON object out of an LLM reply (handles ``` fences and chatter). */
export function parseJsonObject(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end <= start) throw new Error("no JSON object in LLM output");
  return JSON.parse(candidate.slice(start, end + 1));
}
