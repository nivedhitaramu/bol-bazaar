/** "When things go wrong" helpers — run with `npm test`. */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  applyChoice,
  clarifyPrompt,
  classifyYesNo,
  confirmPrompt,
  findConfusable,
  isUndo,
  matchOption,
  simulatedConfusion,
  valuesToConfirm,
} from "../lib/recovery";

test("spoken yes/no in English, Hindi, Tamil and romanised", () => {
  for (const y of ["yes", "Yes, correct", "haan", "हाँ, सही है", "aamaa", "ஆமாம்", "சரி", "ok"]) assert.equal(classifyYesNo(y), "yes", y);
  for (const n of ["no", "nahi", "नहीं", "illa", "இல்லை", "venam", "No, wrong"]) assert.equal(classifyYesNo(n), "no", n);
  assert.equal(classifyYesNo("haan nahi"), null, "contradictory → ask again");
  assert.equal(classifyYesNo("इस साड़ी की कीमत क्या है और कितने दिन में आएगी हाँ"), null, "a sentence is not an answer");
});

test("undo phrases: 'No, wrong' / 'illa, thappu' / 'nahi, galat'", () => {
  for (const u of ["No, wrong", "illa, thappu", "nahi, galat", "नहीं, गलत", "இல்லை, தப்பு", "undo", "that's wrong"]) assert.equal(isUndo(u), true, u);
  for (const x of ["no", "nahi", "illa", "What is the price?", "இந்த புடவை விலை என்ன"]) assert.equal(isUndo(x), false, x);
});

test("prices, quantities and phone numbers are read back before saving", () => {
  const v = valuesToConfirm("இந்த புடவை எட்டாயிரத்து ஐநூறு ரூபாய், இரண்டு இருக்கு");
  assert.deepEqual(v.map((x) => [x.kind, x.value]), [["price", 8500], ["number", 2]]);
  assert.equal(confirmPrompt(v, "en-IN"), "I heard ₹8,500 and 2. Is that right? Say yes or no.");
  assert.equal(confirmPrompt(v, "ta-IN"), "நான் ₹8,500, 2 என்று கேட்டேன். சரியா? ஆமாம் அல்லது இல்லை என்று சொல்லுங்கள்.");
  assert.equal(valuesToConfirm("call me on 98765 43210")[0].kind, "phone");
  assert.deepEqual(valuesToConfirm("नमस्ते, क्या यह साड़ी लाल रंग में मिलेगी?"), [], "no numbers → no confirmation");
});

test("misheard word: ask about ONLY that word, in the speaker's script", () => {
  assert.deepEqual(findConfusable("Is this real zari?"), { word: "zari", options: ["zari", "saree"] });
  assert.deepEqual(findConfusable("क्या यह असली ज़री है?"), { word: "ज़री", options: ["ज़री", "साड़ी"] });
  assert.equal(findConfusable("नमस्ते, कीमत क्या है?"), null);
  assert.equal(findConfusable("मुझे 2 साड़ी चाहिए"), null, "the common word never triggers a question");
  assert.equal(findConfusable("I want a silk saree"), null);
  assert.deepEqual(findConfusable("இது ஜரி வேலை"), { word: "ஜரி", options: ["ஜரி", "சாரி"] });
  assert.equal(clarifyPrompt({ word: "zari", options: ["zari", "saree"] }, "ta-IN"), "“zari”-ஆ, “saree”-ஆ?");
  assert.equal(matchOption("saree", ["zari", "saree"]), 1);
  assert.equal(matchOption("the first one", ["zari", "saree"]), 0);
  assert.equal(matchOption("hmm", ["zari", "saree"]), null);
  assert.equal(applyChoice("Is this real zari?", "zari", "saree"), "Is this real saree?");
});

test("/demo simulate noise: sound-alike, else swapped digits, else a near-miss — always two options", () => {
  assert.deepEqual(simulatedConfusion("Is this real zari?").options, ["zari", "saree"]);
  assert.deepEqual(simulatedConfusion("விலை 8500 ரூபாய்").options, ["8,500", "5,800"]);
  const c = simulatedConfusion("नमस्ते, क्या यह लाल रंग में मिलेगी?");
  assert.equal(c.options.length, 2);
  assert.notEqual(c.options[0], c.options[1]);
});
