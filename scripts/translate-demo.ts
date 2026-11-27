/**
 * npm run translate:demo — runs the real translation pipeline (lib/translate) on the demo sentences
 * and prints detected language, model, output, back-check and cache status.
 * Uses SARVAM_API_KEY from .env.local if present; with --offline it simulates no-keys mode.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
if (process.argv.includes("--offline")) delete process.env.SARVAM_API_KEY;

import { writeFileSync } from "fs";
import { translate } from "../lib/translate";

const CASES: Array<{ text: string; hint: string; target: string; who: string }> = [
  { text: "இந்த புடவை எட்டாயிரத்து ஐநூறு ரூபாய், இரண்டு இருக்கு", hint: "ta-IN", target: "hi-IN", who: "Meena (Tamil) → Priya (Hindi)" },
  { text: "क्या यह असली ज़री है? लखनऊ तक कितने दिन लगेंगे?", hint: "hi-IN", target: "ta-IN", who: "Priya (Hindi) → Meena (Tamil)" },
  { text: "Order confirm pannu, naalaikku ship pannuven", hint: "unknown", target: "hi-IN", who: "Meena (romanised Tamil) → Priya (Hindi)" },
];

async function main() {
  const mode = process.env.SARVAM_API_KEY ? "Sarvam (live)" : "NO KEY (offline dictionary)";
  let out = `Translation pipeline — ${mode}\n${"=".repeat(60)}\n`;
  for (const c of CASES) {
    out += `\n${c.who}\n  IN : ${c.text}\n`;
    for (const pass of [1, 2]) {
      const t0 = Date.now();
      const r = await translate(c.text, c.hint, c.target, { gender: "female", names: ["Meena", "Priya"] });
      const ms = Date.now() - t0;
      if (pass === 1) {
        out += `  OUT: ${r.text}\n`;
        out += `       source=${r.sourceLang} model=${r.model} ok=${r.ok} back-check=${r.flagged ? `⚠ MISSING ${r.missing.join(",")}` : "✓ all numbers present"}  ${ms}ms\n`;
      } else {
        out += `       repeat: cached=${r.cached} ${ms}ms\n`;
      }
    }
  }
  const file = process.argv.find((a) => a.startsWith("--out="))?.slice(6);
  if (file) writeFileSync(file, out, "utf8");
  else console.log(out);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
