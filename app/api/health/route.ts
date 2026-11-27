import { NextRequest, NextResponse } from "next/server";
import { isSupabaseConfigured, sarvamKey } from "@/lib/env";
import { chatCompletion, speechToText, textToSpeech } from "@/lib/sarvam";
import { translate as runTranslate } from "@/lib/translate";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Check = { ok: boolean; ms: number; detail?: string; fallback?: string };

async function check(fn: () => Promise<string | void>): Promise<Check> {
  const t0 = Date.now();
  try {
    const detail = await fn();
    return { ok: true, ms: Date.now() - t0, ...(detail ? { detail } : {}) };
  } catch (e) {
    return { ok: false, ms: Date.now() - t0, detail: (e as Error).message };
  }
}

const keyNotSet = (fallback: string): Check => ({ ok: true, ms: 0, detail: "SARVAM_API_KEY not set", fallback });

/** 0.6 s of silence as a 16 kHz mono WAV — used to ping the STT endpoint. */
function silentWav(): Blob {
  const samples = 9600;
  const buf = new ArrayBuffer(44 + samples * 2);
  const v = new DataView(buf);
  const w = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  w(0, "RIFF"); v.setUint32(4, 36 + samples * 2, true); w(8, "WAVE"); w(12, "fmt ");
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, 16000, true); v.setUint32(28, 32000, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  w(36, "data"); v.setUint32(40, samples * 2, true);
  return new Blob([buf], { type: "audio/wav" });
}

/**
 * GET /api/health          → checks every service (a few seconds with keys; instant in demo mode)
 * GET /api/health?quick=1  → configuration flags only (the client uses this to pick STT/realtime modes)
 */
export async function GET(req: NextRequest) {
  const sarvam = Boolean(sarvamKey());
  const supabase = isSupabaseConfigured();
  const config = {
    sarvam,
    supabase,
    store: supabase ? "supabase" : "memory",
    demoMode: !sarvam || !supabase,
  };
  if (req.nextUrl.searchParams.has("quick")) return NextResponse.json({ config });

  const store = getStore();
  const [stt, translate, tts, llm, data] = await Promise.all([
    sarvam
      ? check(async () => `transcript="${(await speechToText(silentWav(), { language: "en-IN" })).transcript}"`)
      : Promise.resolve(keyNotSet("browser SpeechRecognition")),
    sarvam
      ? check(async () => {
          const r = await runTranslate("Hello, how much is this saree? It is ₹8,500.", "en-IN", "ta-IN");
          if (!r.ok || r.flagged) throw new Error(`translation check failed: ${r.text}`);
          return `${r.model}: ${r.text}`;
        })
      : Promise.resolve(keyNotSet("built-in Tamil/Hindi/English phrase dictionary")),
    sarvam
      ? check(async () => `${(await textToSpeech("வணக்கம்", "ta-IN")).base64.length} b64 chars`)
      : Promise.resolve(keyNotSet("browser speechSynthesis")),
    sarvam
      ? check(async () => (await chatCompletion([{ role: "user", content: 'Reply with JSON {"ok": true}' }], { json: true, maxTokens: 30 })).slice(0, 80))
      : Promise.resolve(keyNotSet("rule-based extraction (lib/llm.ts + lib/numbers.ts)")),
    check(async () => {
      const r = await store.check();
      return `${r.db} · storage: ${r.storage}`;
    }),
  ]);

  const services = { stt, translate, tts, llm, data };
  const healthy = Object.values(services).every((c) => c.ok);
  return NextResponse.json(
    {
      healthy,
      mode: config.demoMode ? "demo" : "full",
      message: config.demoMode ? "Demo mode — API keys not set. Add keys in .env.local for full AI voice." : "All services configured.",
      config,
      services,
    },
    { status: 200 }
  );
}
