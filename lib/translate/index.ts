import "server-only";
/**
 * Accuracy-first translation pipeline (wrong prices or names break trust):
 *
 *   source language   STT's detected language → script → Sarvam /text-lid (never a blind guess)
 *   romanised Indic   "Order confirm pannu" → /transliterate → "ஆர்டர் கன்ஃபர்ம் பண்ணு" (MT is far
 *                     more accurate on native script — verified against the live API)
 *   protect           names → ⟦n⟧ tokens; spoken numbers → exact digits ("எட்டாயிரத்து ஐநூறு" → 8,500)
 *                     (digits keep meaning AND value; full ⟦n⟧ number tokens are the retry strategy)
 *   translate         sarvam-translate:v1 (22 languages, most accurate, respectful register)
 *                     → mayura:v1 (formal) as fallback, and as a second opinion if a back-check fails
 *   restore           tokens → exact digits / names in the reader's script
 *   glossary          saree, zari, handloom, order, delivery, COD … kept consistent
 *   back-check        every number in the source must be in the output, else flagged ⚠
 *   cache             identical (masked) text → no second API call
 *
 * No SARVAM_API_KEY → the built-in phrase dictionary (lib/dictionary.ts), still back-checked.
 */
import { identifyLanguage, MODEL_LANGS, sarvamAvailable, transliterate, translateText, type TranslateModel } from "../sarvam";
import { translateOffline } from "../dictionary";
import { missingNumbers } from "../numbers";
import { applyGlossary, guessLanguageFromScript, mask, restore } from "./protect";

export type TranslateResult = {
  text: string;
  /** false = nothing could translate it (no key and no dictionary hit) → UI shows "Translation key not set". */
  ok: boolean;
  /** true = a number from the source is missing in the output → UI shows ⚠ check + original. */
  flagged: boolean;
  missing: number[];
  sourceLang: string;
  model: TranslateModel | "dictionary" | null;
  cached: boolean;
};

// ───────────────────────── Cache (LRU, per server process) ─────────────────────────

const g = globalThis as unknown as { __bbTranslateCache?: Map<string, string> };
const cache = (g.__bbTranslateCache ??= new Map<string, string>());
const CACHE_MAX = 2000;

function cacheGet(key: string) {
  const v = cache.get(key);
  if (v !== undefined) {
    cache.delete(key); // refresh LRU position
    cache.set(key, v);
  }
  return v;
}
function cacheSet(key: string, v: string) {
  cache.set(key, v);
  if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value as string);
}

async function cached<T extends string>(key: string, fn: () => Promise<T>): Promise<{ value: string; hit: boolean }> {
  const hit = cacheGet(key);
  if (hit !== undefined) return { value: hit, hit: true };
  const value = await fn();
  cacheSet(key, value);
  return { value, hit: false };
}

export function translationCacheSize() {
  return cache.size;
}

// ───────────────────────── Source language ─────────────────────────

/**
 * Resolve the language a text is actually written in.
 * Non-Latin scripts are unambiguous offline. Latin text may be English or romanised Indic
 * ("naalaikku ship pannuven") — Sarvam /text-lid tells them apart; without a key we trust the hint.
 */
export async function detectSourceLanguage(text: string, hint?: string | null): Promise<{ lang: string; romanized: boolean }> {
  const h = hint && hint !== "unknown" && hint !== "auto" ? hint : undefined;
  const local = guessLanguageFromScript(text, h);
  if (local.script && local.script !== "Latn" && local.lang) return { lang: local.lang, romanized: false };
  if (local.script === "Latn") {
    if (sarvamAvailable()) {
      try {
        const { value } = await cached(`lid|${text}`, async () => {
          const r = await identifyLanguage(text);
          return r.languageCode ?? "";
        });
        if (value) return { lang: value, romanized: value !== "en-IN" };
      } catch (e) {
        console.warn("text-lid failed:", (e as Error).message);
      }
    }
    return { lang: h ?? "en-IN", romanized: Boolean(h && h !== "en-IN") };
  }
  return { lang: h ?? "en-IN", romanized: false };
}

// ───────────────────────── Translate ─────────────────────────

export type TranslateOptions = {
  /** Names to keep verbatim (seller, buyer, product). Known names are restored in the target script. */
  names?: string[];
  /** Speaker's gender, for correct verb forms (Hindi "दूँगी" vs "दूँगा"). */
  gender?: "female" | "male";
};

export async function translate(text: string, source: string | null | undefined, target: string, opts: TranslateOptions = {}): Promise<TranslateResult> {
  const original = text.trim();
  const base = { missing: [] as number[], cached: false };
  if (!original) return { ...base, text: original, ok: true, flagged: false, sourceLang: source ?? target, model: null };

  // 1. What language is this really in? (The script beats a stale hint: a Tamil seller may type Hindi.)
  const { lang: src, romanized } = await detectSourceLanguage(original, source);

  // 2. Romanised Indic → native script first.
  let working = original;
  if (romanized && sarvamAvailable()) {
    try {
      working = (await cached(`tl|${src}|${original}`, () => transliterate(original, "en-IN", src))).value || original;
    } catch (e) {
      console.warn("transliterate failed:", (e as Error).message);
    }
  }

  if (src === target) return { ...base, text: original, ok: true, flagged: false, sourceLang: src, model: null };

  // 3. No key → offline dictionary (still back-checked).
  if (!sarvamAvailable()) return offline(original, src, target);

  // 4. Protect → translate → restore → glossary → back-check. Attempts in order of measured accuracy;
  //    the first one whose back-check passes wins.
  const supports = (m: TranslateModel) => MODEL_LANGS[m].has(src) && MODEL_LANGS[m].has(target);
  const attempts = (
    [
      { model: "sarvam-translate:v1", numbers: "digits" },
      { model: "mayura:v1", numbers: "digits" },
      { model: "sarvam-translate:v1", numbers: "tokens" },
    ] as const
  ).filter((a) => supports(a.model));
  const speakerGender = opts.gender === "male" ? "Male" : opts.gender === "female" ? "Female" : undefined;

  let best: TranslateResult | null = null;
  for (const { model, numbers } of attempts) {
    const masked = mask(working, opts.names ?? [], { numbers });
    let raw: { value: string; hit: boolean };
    try {
      raw = await cached(`mt|${model}|${src}|${target}|${speakerGender ?? ""}|${masked.text}`, () =>
        translateText(masked.text, src, target, "formal", { model, speakerGender })
      );
    } catch (e) {
      console.warn(`${model} failed:`, (e as Error).message);
      continue;
    }
    const restored = restore(raw.value, masked.slots, target);
    const finalText = applyGlossary(working, restored.text, target).trim();
    const missing = missingNumbers(working, finalText);
    const result: TranslateResult = {
      text: finalText,
      ok: true,
      flagged: missing.length > 0 || restored.lost.some((s) => s.kind === "number"),
      missing,
      sourceLang: src,
      model,
      cached: raw.hit,
    };
    if (!result.flagged && restored.lost.length === 0) return result;
    if (!best || result.missing.length < best.missing.length) best = result; // keep the least-bad, flagged
  }
  if (best) return best;

  // 5. Every model failed (outage) → dictionary, else untranslated.
  return offline(original, src, target);
}

function offline(original: string, src: string, target: string): TranslateResult {
  const hit = translateOffline(original, src, target);
  if (hit == null) return { text: original, ok: false, flagged: false, missing: [], sourceLang: src, model: null, cached: false };
  const missing = missingNumbers(original, hit);
  return { text: hit, ok: true, flagged: missing.length > 0, missing, sourceLang: src, model: "dictionary", cached: false };
}
