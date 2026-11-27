/**
 * Offline phrase dictionary (used when SARVAM_API_KEY is not set, or Sarvam is down).
 * Covers the seeded demo conversation, the README demo script, both maker intros, and
 * common marketplace phrases. Matching is fuzzy so browser speech-recognition transcripts
 * (different punctuation, a word dropped/added) still hit.
 */

type Entry = { ta: string; hi: string; en: string };

const PHRASES: Entry[] = [
  // ── Seeded conversation (Priya ⇄ Meena) ──
  {
    hi: "नमस्ते! क्या यह साड़ी असली कांचीपुरम रेशम की है?",
    ta: "வணக்கம்! இந்தப் புடவை உண்மையான காஞ்சிபுரம் பட்டா?",
    en: "Hello! Is this saree real Kanchipuram silk?",
  },
  {
    ta: "ஆமாம், இது தூய பட்டு, உண்மையான ஜரிகையுடன் நானே கையால் நெய்தது.",
    hi: "हाँ, यह शुद्ध रेशम है, असली ज़री के साथ, मैंने ख़ुद हाथ से बुनी है।",
    en: "Yes, it is pure silk with real zari, hand-woven by me.",
  },
  {
    hi: "इसकी कीमत क्या है? क्या थोड़ा कम हो सकता है?",
    ta: "இதன் விலை என்ன? கொஞ்சம் குறைக்க முடியுமா?",
    en: "What is the price? Can you reduce it a little?",
  },
  {
    ta: "விலை ₹8,500. லக்னோவுக்கு இலவச டெலிவரி தருகிறேன்.",
    hi: "कीमत ₹8,500 है। लखनऊ के लिए मुफ़्त डिलीवरी दूँगी।",
    en: "The price is ₹8,500. I will give free delivery to Lucknow.",
  },
  {
    hi: "ठीक है, मुझे लाल रंग वाली एक साड़ी चाहिए। मैं ऑर्डर कर रही हूँ।",
    ta: "சரி, எனக்கு சிவப்பு நிறப் புடவை ஒன்று வேண்டும். ஆர்டர் செய்கிறேன்.",
    en: "Okay, I want one red saree. I am placing the order.",
  },
  {
    ta: "நன்றி! உங்கள் ஆர்டர் கிடைத்தது, இன்றே உறுதி செய்கிறேன்.",
    hi: "धन्यवाद! आपका ऑर्डर मिल गया, आज ही पक्का करती हूँ।",
    en: "Thank you! I received your order, I will confirm it today.",
  },
  // ── README demo script ──
  {
    hi: "नमस्ते, क्या यह साड़ी लाल रंग में मिलेगी?",
    ta: "வணக்கம், இந்த சேலை சிவப்பு நிறத்தில் கிடைக்குமா?",
    en: "Hello, is this saree available in red?",
  },
  {
    ta: "ஆமாம், சிவப்பு நிறத்தில் இருக்கிறது, விலை எட்டாயிரத்து ஐநூறு",
    hi: "हाँ, लाल रंग में है, कीमत आठ हज़ार पाँच सौ रुपये है।",
    en: "Yes, it is available in red, the price is eight thousand five hundred rupees.",
  },
  // ── Maker intros (Hear the maker) ──
  {
    ta: "வணக்கம், என் பெயர் மீனா. நான் காஞ்சிபுரத்தில் இருபது வருடங்களாகப் பட்டுப் புடவை நெய்கிறேன். என் அம்மாவிடம் கற்றுக்கொண்டேன். ஒவ்வொரு புடவையும் என் கையால் நெய்தது.",
    hi: "नमस्ते, मेरा नाम मीना है। मैं कांचीपुरम में बीस सालों से रेशमी साड़ियाँ बुन रही हूँ। मैंने यह अपनी माँ से सीखा। हर साड़ी मेरे हाथ से बुनी है।",
    en: "Hello, my name is Meena. I have been weaving silk sarees in Kanchipuram for twenty years. I learnt it from my mother. Every saree is woven by my own hands.",
  },
  {
    hi: "नमस्ते, मेरा नाम रमेश है। मैं खुर्जा से हूँ और तीन पीढ़ियों से हमारा परिवार मिट्टी के बर्तन बनाता है। हर बर्तन चाक पर हाथ से बनता है।",
    ta: "வணக்கம், என் பெயர் ரமேஷ். நான் குர்ஜாவைச் சேர்ந்தவன், மூன்று தலைமுறைகளாக எங்கள் குடும்பம் மண்பாண்டங்கள் செய்கிறது. ஒவ்வொரு பாண்டமும் சக்கரத்தில் கையால் செய்யப்படுகிறது.",
    en: "Hello, my name is Ramesh. I am from Khurja and our family has made pottery for three generations. Every pot is made by hand on the wheel.",
  },
  // ── Common marketplace phrases ──
  { hi: "नमस्ते", ta: "வணக்கம்", en: "Hello" },
  { hi: "धन्यवाद", ta: "நன்றி", en: "Thank you" },
  { hi: "हाँ", ta: "ஆமாம்", en: "Yes" },
  { hi: "नहीं", ta: "இல்லை", en: "No" },
  { hi: "ठीक है", ta: "சரி", en: "Okay" },
  { hi: "इसकी कीमत क्या है?", ta: "இதன் விலை என்ன?", en: "What is the price?" },
  { hi: "क्या थोड़ा कम हो सकता है?", ta: "கொஞ்சம் குறைக்க முடியுமா?", en: "Can you reduce it a little?" },
  { hi: "क्या यह उपलब्ध है?", ta: "இது கிடைக்குமா?", en: "Is this available?" },
  { hi: "कौन-कौन से रंग हैं?", ta: "என்னென்ன நிறங்கள் இருக்கின்றன?", en: "What colours are there?" },
  { hi: "कौन-कौन से साइज़ हैं?", ta: "என்னென்ன அளவுகள் இருக்கின்றன?", en: "What sizes are there?" },
  { hi: "डिलीवरी में कितने दिन लगेंगे?", ta: "டெலிவரிக்கு எத்தனை நாட்கள் ஆகும்?", en: "How many days will delivery take?" },
  { hi: "मुफ़्त डिलीवरी है।", ta: "இலவச டெலிவரி உண்டு.", en: "Delivery is free." },
  { hi: "मैं कल भेज दूँगी।", ta: "நாளை அனுப்புகிறேன்.", en: "I will send it tomorrow." },
  { hi: "मैंने भेज दिया है।", ta: "அனுப்பிவிட்டேன்.", en: "I have sent it." },
  { hi: "मुझे एक चाहिए।", ta: "எனக்கு ஒன்று வேண்டும்.", en: "I want one." },
  { hi: "मुझे दो चाहिए।", ta: "எனக்கு இரண்டு வேண்டும்.", en: "I want two." },
  { hi: "कृपया ऑर्डर पक्का कीजिए।", ta: "தயவுசெய்து ஆர்டரை உறுதி செய்யுங்கள்.", en: "Please confirm the order." },
  { hi: "आपका ऑर्डर पक्का हो गया है।", ta: "உங்கள் ஆர்டர் உறுதி செய்யப்பட்டது.", en: "Your order is confirmed." },
  { hi: "क्या आप फ़ोटो भेज सकती हैं?", ta: "புகைப்படம் அனுப்ப முடியுமா?", en: "Can you send a photo?" },
  { hi: "बहुत सुंदर है!", ta: "மிகவும் அழகாக இருக்கிறது!", en: "It is very beautiful!" },
  { hi: "यह हाथ से बना है।", ta: "இது கையால் செய்தது.", en: "It is handmade." },
  { hi: "भुगतान कैसे करूँ?", ta: "பணம் எப்படி செலுத்துவது?", en: "How do I pay?" },
  { hi: "UPI से भुगतान कर सकते हैं।", ta: "UPI மூலம் பணம் செலுத்தலாம்.", en: "You can pay by UPI." },
];

const LANG_KEY: Record<string, keyof Entry> = { ta: "ta", hi: "hi", en: "en" };

function norm(s: string): string {
  return s
    .normalize("NFC")
    .toLowerCase()
    .replace(/[\p{P}\p{S}]/gu, " ") // punctuation & symbols (₹, !, ।, ?)
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(s: string): Set<string> {
  return new Set(norm(s).split(" ").filter(Boolean));
}

function similarity(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  a.forEach((t) => b.has(t) && inter++);
  return inter / (a.size + b.size - inter); // Jaccard
}

/** Returns the translation, or null when the phrase is not in the dictionary. */
export function translateOffline(text: string, source: string, target: string): string | null {
  const src = LANG_KEY[source.split("-")[0]];
  const tgt = LANG_KEY[target.split("-")[0]];
  if (!tgt || !text.trim()) return null;
  const n = norm(text);
  const t = tokens(text);

  let best: { e: Entry; score: number } | null = null;
  const candidates = src ? [src] : (["ta", "hi", "en"] as const); // unknown source: try all
  for (const e of PHRASES) {
    for (const k of candidates) {
      const score = norm(e[k]) === n ? 1 : similarity(t, tokens(e[k]));
      if (!best || score > best.score) best = { e, score };
    }
  }
  // Short phrases need an exact hit; longer ones tolerate STT drift.
  const threshold = t.size <= 2 ? 1 : 0.6;
  return best && best.score >= threshold ? best.e[tgt] : null;
}
