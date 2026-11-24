# Bol Bazaar — Build Plan

## Verified Sarvam API facts (from docs.sarvam.ai, Nov 2026)
| Service | Endpoint | Notes |
|---|---|---|
| STT | `POST https://api.sarvam.ai/speech-to-text` (multipart) | `model=saaras:v4` (current default; Saarika is legacy), `mode=transcribe`, `language_code` = `xx-IN` or `unknown`. REST limit **30 s**. Accepts WAV/WebM/MP3… → we send 16 kHz mono WAV (encoded client-side) for cross-browser reliability. Response: `transcript`, `language_code`. |
| Translate | `POST https://api.sarvam.ai/translate` (JSON) | `model=mayura:v1` (≤1000 chars, supports `auto`, `modern-colloquial`), `numerals_format=international` so digits/prices are untouched. Response: `translated_text`. |
| TTS | `POST https://api.sarvam.ai/text-to-speech` (JSON) | `model=bulbul:v3`, `language_code`, `speaker` (lowercase e.g. `kavya`, `aditya`), `output_audio_codec=mp3`. ≤2500 chars. Response: `audios[0]` base64. |
| LLM | `POST https://api.sarvam.ai/v1/chat/completions` | `model=sarvam-105b`, `reasoning_effort: null` (fast), `response_format: {type:"json_object"}`. Auth: `Authorization: Bearer` **and** `api-subscription-key`. |

Auth header for STT/TTS/Translate: `api-subscription-key`.

## Milestones
1. **Plan** — this file.
2. **Scaffold** — Next.js 15 (App Router) + TS + Tailwind v4, Supabase browser/admin clients, env handling (supports new `sb_publishable_`/`sb_secret_` keys and legacy anon/service_role names).
3. **Database** — `supabase/migrations/0001_init.sql` (tables, RLS, Realtime publication, Storage buckets) + `scripts/seed.ts` (`npm run seed`) sharing `lib/seed.ts` with `/api/demo/reset`.
4. **Sarvam lib** — `lib/sarvam.ts` (typed, timeouts, retries), `lib/llm.ts` (extraction / listing / edit / order-intent prompts + zod + deterministic heuristic fallbacks), `/api/health`.
5. **Voice listing** — `/seller/new`: photo → speak → STT → strict extraction → missing fields in yellow → listing in en/hi/seller-lang → TTS read-back → voice edit → publish + WhatsApp share.
6. **Live chat + demo** — `/api/relay` (STT → translate → TTS → store → insert, one round trip), `/chat/[id]` with Realtime + auto-play + broadcast status ("Listening…/Translating…/Speaking…"), `/demo` split screen + reset.
7. **Rest of app** — onboarding with voice intro, seller dashboard (products, conversations w/ unread badges, orders + voice commands), `/shop`, `/shop/[sellerId]`, `/product/[id]` with "Hear the maker", Buy.
8. **Polish + README** — i18n (en/hi/ta UI), toasts, error states, mobile layout, Mermaid architecture.
9. **Build** — `npm run build` clean; lint clean.

## Fallback strategy
- No/failed Sarvam key → STT uses browser `SpeechRecognition` (client switches mode automatically), TTS uses `speechSynthesis`, translation returns source text with a toast, LLM uses deterministic regex extractors (price/qty/Indian number words, edit commands, order intents).
- All failures surface as a non-blocking toast in the user's language.
