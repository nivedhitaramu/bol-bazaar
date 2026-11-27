/** Spoken / typed PIN → 4 digits. Browser-safe (no node:crypto). */
import { normalizeDigits, parseAmount } from "./numbers";

const ZERO = new Set(["zero", "oh", "o", "शून्य", "सुन्ना", "ஜீரோ", "பூஜ்யம்", "சுழியம்", "பூஜ்ஜியம்"]);

/**
 * "one two three four" · "एक दो तीन चार" · "ஒன்று இரண்டு மூன்று நான்கு" · "1 2 3 4" · "1234" → "1234".
 * Each spoken word is one digit (we never read "twelve" as 1-2). Returns null unless exactly 4 digits.
 */
export function parsePinDigits(text: string): string | null {
  const tokens = normalizeDigits(text)
    .toLowerCase()
    .replace(/[\p{P}\p{S}]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
  let out = "";
  for (const t of tokens) {
    if (/^\d+$/.test(t)) out += t;
    else if (ZERO.has(t)) out += "0";
    else {
      const v = parseAmount(t);
      if (v != null && v >= 0 && v <= 9) out += String(v);
    }
  }
  return /^\d{4}$/.test(out) ? out : null;
}
