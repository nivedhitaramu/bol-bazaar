/**
 * npm run seed — (re)creates the demo sellers, products, conversation and order.
 * Reads .env.local. Generates TTS voice intros if SARVAM_API_KEY is set.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config();

import { createClient } from "@supabase/supabase-js";
import { seedDemo } from "../lib/seed";
import { normalizeSupabaseUrl } from "../lib/env";
import { sarvamAvailable, textToSpeech } from "../lib/sarvam";

async function main() {
  const url = normalizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.log("ℹ Supabase keys not set — nothing to seed.");
    console.log("  Demo mode uses a built-in in-memory store that is seeded automatically when the app starts.");
    console.log("  To use Supabase, set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local.");
    return;
  }
  const sb = createClient(url, key, { auth: { persistSession: false } });

  const tts = sarvamAvailable()
    ? async (text: string, lang: string, gender: "female" | "male") => {
        const r = await textToSpeech(text, lang, gender);
        return Buffer.from(r.base64, "base64");
      }
    : undefined;
  if (!tts) console.log("ℹ SARVAM_API_KEY not set — skipping voice intro audio (browser TTS will be used).");

  const res = await seedDemo(sb, { tts, log: (s) => console.log("  •", s) });
  console.log("✓ Seed complete:", res);
}

main().catch((e) => {
  console.error("✗ Seed failed:", e.message ?? e);
  process.exit(1);
});
