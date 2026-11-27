/**
 * Translation safety tests — run with `npm test` (no network, no keys needed).
 * They simulate the machine-translation step by hand so the protection logic is tested exactly.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { applyGlossary, guessLanguageFromScript, mask, restore } from "../lib/translate/protect";
import { findNumberSpans, missingNumbers } from "../lib/numbers";
import { translateOffline } from "../lib/dictionary";

test("Tamil number words → protected, restored as exact digits", () => {
  const src = "இந்த புடவை எட்டாயிரத்து ஐநூறு ரூபாய், இரண்டு இருக்கு";
  const m = mask(src);
  assert.equal(m.text, "இந்த புடவை ⟦1⟧ ரூபாய், ⟦2⟧ இருக்கு");
  assert.deepEqual(
    m.slots.map((s) => (s.kind === "number" ? s.value : s.original)),
    [8500, 2]
  );
  // Simulated MT output (Hindi) that kept the tokens:
  const r = restore("इस साड़ी की कीमत ⟦1⟧ रुपये है, ⟦2⟧ हैं।", m.slots, "hi-IN");
  assert.equal(r.text, "इस साड़ी की कीमत 8,500 रुपये है, 2 हैं।");
  assert.equal(r.lost.length, 0);
  assert.deepEqual(missingNumbers(src, r.text), []);
});

test("default 'digits' strategy: number words become exact digits inline, names still tokenised", () => {
  // Live-API finding: opaque tokens made the model read "⟦2⟧ இருக்கு" as "2 rupees"; digits keep meaning.
  const m = mask("இந்த புடவை எட்டாயிரத்து ஐநூறு ரூபாய், இரண்டு இருக்கு — மீனா", [], { numbers: "digits" });
  assert.equal(m.text, "இந்த புடவை 8,500 ரூபாய், 2 இருக்கு — ⟦1⟧");
  assert.equal(m.slots.length, 1);
  assert.equal(restore("इस साड़ी की कीमत 8,500 रुपये है और इसमें 2 हैं। — ⟦1⟧", m.slots, "hi-IN").text, "इस साड़ी की कीमत 8,500 रुपये है और इसमें 2 हैं। — मीना");
  // digits and phone numbers pass through untouched
  assert.equal(mask("₹1,200, 3 pcs, call 98765 43210", [], { numbers: "digits" }).text, "₹1,200, 3 pcs, call 98765 43210");
});

test("digits, ₹ amounts, lakh and phone numbers are kept verbatim", () => {
  const src = "Price ₹8,500 or 1.2 lakh for 3 pieces — call 98765 43210";
  const m = mask(src);
  const values = m.slots.filter((s) => s.kind === "number").map((s) => s.original);
  assert.deepEqual(values, ["8,500", "1.2 lakh", "3", "98765 43210"]);
  const r = restore(m.text, m.slots, "ta-IN");
  assert.equal(r.text, src, "round-trip without translation must be lossless");
});

test("names are protected and restored in the READER's script", () => {
  const src = "क्या यह असली ज़री है? लखनऊ तक कितने दिन लगेंगे? — प्रिया";
  const m = mask(src);
  assert.ok(m.text.includes("⟦1⟧ तक"), m.text);
  const names = m.slots.filter((s) => s.kind === "name").map((s) => s.original);
  assert.deepEqual(names, ["लखनऊ", "प्रिया"]);
  const r = restore("இது உண்மையான ஜரிகையா? ⟦1⟧ வரை எத்தனை நாட்கள் ஆகும்? — ⟦2⟧", m.slots, "ta-IN");
  assert.equal(r.text, "இது உண்மையான ஜரிகையா? லக்னோ வரை எத்தனை நாட்கள் ஆகும்? — பிரியா");
});

test("extra names (seller/buyer/product) stay verbatim; Kanchipuram/Meena map across scripts", () => {
  const m = mask("Meena from Kanchipuram sent Zoya's order", ["Zoya"]);
  const r = restore(m.text.replace("sent", "ने भेजा").replace("order", "ऑर्डर"), m.slots, "hi-IN");
  assert.ok(r.text.includes("मीना") && r.text.includes("कांचीपुरम") && r.text.includes("Zoya"), r.text);
});

test("restore tolerates tokens a model reformatted: ⟦ 1 ⟧, [2], 【3】", () => {
  const m = mask("₹350 and ₹1,200 and ₹8,500");
  assert.equal(m.text, "₹⟦1⟧ and ₹⟦2⟧ and ₹⟦3⟧", "₹ stays outside the token");
  const r = restore("₹⟦ 1 ⟧ और ₹[2] और ₹【3】", m.slots, "hi-IN");
  assert.equal(r.text, "₹350 और ₹1,200 और ₹8,500");
});

test("a token the model DROPPED is reported as lost, and the back-check flags the price", () => {
  const src = "விலை 8500 ரூபாய்";
  const m = mask(src);
  const r = restore("कीमत रुपये है", m.slots, "hi-IN"); // model dropped ⟦1⟧
  assert.equal(r.lost.length, 1);
  assert.deepEqual(missingNumbers(src, r.text), [8500]);
});

test("back-check: wrong number is flagged; number written as words in output is accepted", () => {
  assert.deepEqual(missingNumbers("விலை எட்டாயிரத்து ஐநூறு", "कीमत 8,000 है"), [8500]);
  assert.deepEqual(missingNumbers("விலை எட்டாயிரத்து ஐநூறு", "कीमत आठ हज़ार पाँच सौ रुपये है"), []);
  assert.deepEqual(missingNumbers("இரண்டு இருக்கு", "दो हैं"), [], "lone 'दो' counts in the output");
  assert.deepEqual(missingNumbers("मुझे दो", "எனக்குக் கொடுங்கள்"), [], "'दो' = 'give' is not a number in the source");
});

test("articles are not numbers: 'ஒரு புடவை', 'एक साड़ी' are left for the translator", () => {
  assert.equal(findNumberSpans("இது ஒரு புடவை").length, 0);
  assert.equal(findNumberSpans("मुझे एक साड़ी चाहिए").length, 0);
  assert.equal(mask("இது ஒரு புடவை").slots.length, 0);
});

test("glossary: leaked or inconsistent craft/commerce terms are normalised", () => {
  assert.equal(applyGlossary("Order confirm pannu", "कृपया आदेश की पुष्टि करें", "hi-IN"), "कृपया ऑर्डर की पुष्टि करें");
  assert.equal(applyGlossary("இந்த சேலை", "इस saree की कीमत", "hi-IN"), "इस साड़ी की कीमत");
  assert.equal(applyGlossary("असली ज़री", "இது real zari-யா?", "ta-IN"), "இது real ஜரிகை-யா?");
  assert.equal(applyGlossary("COD available", "कैश ऑन डिलीवरी (COD) उपलब्ध है", "hi-IN"), "कैश ऑन डिलीवरी (COD) उपलब्ध है");
  // A term NOT in the source is never touched:
  assert.equal(applyGlossary("नमस्ते", "आदेश", "hi-IN"), "आदेश");
});

test("script detection beats a stale language hint", () => {
  assert.equal(guessLanguageFromScript("இந்த புடவை", "hi-IN").lang, "ta-IN");
  assert.equal(guessLanguageFromScript("यह साड़ी", "ta-IN").lang, "hi-IN");
  assert.equal(guessLanguageFromScript("हे साडी", "mr-IN").lang, "mr-IN");
  assert.equal(guessLanguageFromScript("Order confirm pannu").script, "Latn");
});

test("no-keys dictionary: demo phrases translate and keep their numbers", () => {
  const hi = translateOffline("ஆமாம் சிவப்பு நிறத்தில் இருக்கிறது விலை எட்டாயிரத்து ஐநூறு", "ta-IN", "hi-IN");
  assert.ok(hi, "should hit the dictionary despite missing punctuation");
  assert.deepEqual(missingNumbers("விலை எட்டாயிரத்து ஐநூறு", hi!), []);
  assert.equal(translateOffline("मेरे भाई की शादी अगले महीने है", "hi-IN", "ta-IN"), null);
  assert.equal(translateOffline("Order confirm pannu, naalaikku ship pannuven", "en-IN", "hi-IN"), "ऑर्डर की पुष्टि करें, मैं इसे कल भेज दूँगी।");
});

test("known names in 'verify' mode are left for natural grammar and checked afterwards", async () => {
  const { missingNames } = await import("../lib/translate/protect");
  const m = mask("Meena weaves in Kanchipuram for Zoya", ["Meena", "Zoya"], { numbers: "digits", knownNames: "verify" });
  assert.equal(m.text, "Meena weaves in Kanchipuram for ⟦1⟧", "only the unknown name is tokenised");
  // Tamil case ending glued onto the name still counts (காஞ்சிபுரம் → காஞ்சிபுரத்தில்):
  assert.deepEqual(missingNames("Meena weaves in Kanchipuram", "மீனா காஞ்சிபுரத்தில் நெய்கிறார்", "ta-IN"), []);
  assert.deepEqual(missingNames("Meena weaves in Kanchipuram", "அவர் நெய்கிறார்", "ta-IN"), ["Meena", "Kanchipuram"]);
});
