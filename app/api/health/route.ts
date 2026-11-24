import { NextRequest, NextResponse } from "next/server";
import { isSupabaseConfigured, sarvamKey, supabasePublishableKey } from "@/lib/env";
import { chatCompletion, speechToText, textToSpeech, translateText } from "@/lib/sarvam";
import { getAdminSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Check = { ok: boolean; ms: number; detail?: string };

async function check(fn: () => Promise<string | void>): Promise<Check> {
  const t0 = Date.now();
  try {
    const detail = await fn();
    return { ok: true, ms: Date.now() - t0, ...(detail ? { detail } : {}) };
  } catch (e) {
    return { ok: false, ms: Date.now() - t0, detail: (e as Error).message };
  }
}

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
 * GET /api/health          → full check of every service (slow, ~3–6 s)
 * GET /api/health?quick=1  → configuration flags only (used by the client to pick STT mode)
 */
export async function GET(req: NextRequest) {
  const quick = req.nextUrl.searchParams.has("quick");
  const config = {
    sarvam: Boolean(sarvamKey()),
    supabase: isSupabaseConfigured(),
    supabaseRealtime: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && supabasePublishableKey()),
  };
  if (quick) return NextResponse.json({ config });

  const noKey = async () => {
    throw new Error("SARVAM_API_KEY not set");
  };
  const [stt, translate, tts, llm, db, storage] = await Promise.all([
    config.sarvam ? check(async () => `transcript="${(await speechToText(silentWav(), { language: "en-IN" })).transcript}"`) : check(noKey),
    config.sarvam ? check(async () => await translateText("Hello, how much is this saree?", "en-IN", "ta-IN")) : check(noKey),
    config.sarvam ? check(async () => `${(await textToSpeech("வணக்கம்", "ta-IN")).base64.length} b64 chars`) : check(noKey),
    config.sarvam
      ? check(async () => (await chatCompletion([{ role: "user", content: 'Reply with JSON {"ok": true}' }], { json: true, maxTokens: 30 })).slice(0, 80))
      : check(noKey),
    check(async () => {
      const { count, error } = await getAdminSupabase().from("products").select("id", { count: "exact", head: true });
      if (error) throw new Error(error.message);
      return `${count ?? 0} products`;
    }),
    check(async () => {
      const { data, error } = await getAdminSupabase().storage.listBuckets();
      if (error) throw new Error(error.message);
      const names = data.map((b) => b.name);
      const missing = ["product-photos", "voice-intros", "chat-audio"].filter((b) => !names.includes(b));
      if (missing.length) throw new Error(`missing buckets: ${missing.join(", ")}`);
      return names.join(", ");
    }),
  ]);

  const all = { stt, translate, tts, llm, db, storage };
  const healthy = Object.values(all).every((c) => c.ok);
  return NextResponse.json({ healthy, config, services: all }, { status: healthy ? 200 : 207 });
}
