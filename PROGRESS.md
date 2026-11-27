# Bol Bazaar — Progress

_Last updated: 2026-11-27_

## Status
Feature-complete for submission. `npm run lint`, `npm run build`, `npm test` (31 tests) pass;
`docker compose up --build` builds and runs keyless; every page passes a 375px audit
(no overflow, tap targets ≥ 56px, text ≥ 12px).

## Done
- **Core:** voice listing (`/seller/new`), live cross-language chat (`/chat/[id]`, `/demo`), seller
  onboarding + dashboard, catalog, product page with "Hear the maker", voice order commands.
- **Keyless / Docker:** in-memory seeded store, browser STT/TTS fallbacks, offline phrase
  dictionary, demo banner; Dockerfile + compose (node:22-alpine, standalone).
- **Translation accuracy:** sarvam-translate primary (Mayura fallback), STT/script/text-lid
  language detection, transliteration of romanised Indic, protected names/numbers, glossary,
  number back-check with ⚠ badge, cache.
- **Speak your shop online:** 60 s voice intro → 3-language storefront (`/seller/shop-setup`, `/shop/[id]`).
- **Hands-free mode:** VAD-based continuous listening in chat, `/demo`, `/seller/new`.
- **Ask your shop:** spoken daily summary on the dashboard (`/api/ask`).
- **When things go wrong:** read-back + spoken yes before sending/saving (chat numbers, listings,
  orders), one-word clarification for sound-alikes, undo ("illa, thappu"), quiet prompt, two
  strikes → text box, "Translation pending" + retry, hidden `/demo` "simulate noise" (Shift+N).
- **Polish:** separate app language vs. "I speak" language, portal-based overlays, mobile sizing,
  `/demo` story strip, README.

## Open / manual
- **Supabase:** run `supabase/migrations/0002_shop_profile.sql` in the SQL Editor, then `npm run seed`
  (needed for storefronts in Supabase mode; keyless/Docker mode doesn't need it).
- **Real-microphone check:** recovery answers ("aamaa", "haan") and the keyless browser-STT
  hands-free path were verified with typed/tapped input and a fake mic, not on a phone.
- **Known limitation:** wrong-word translations (e.g. Sarvam rendered "brother's wedding" as
  "sister's wedding") aren't caught — the back-check covers numbers, not word meaning.

## Dev workflow
- `npm run dev` — your dev server, uses `.next` (no Turbopack).
- Test builds/servers never touch `.next`:
  `npm run build:test` / `npm run start:test` (port 3202) use `NEXT_DIST_DIR=.next-test` via cross-env.
- `npm run build` / `npm start` and the Dockerfile use the default `.next`.
