import type { SupabaseClient } from "@supabase/supabase-js";
import type { Listing } from "./types";

/** Fixed IDs so the /demo page can always find its data. */
export const DEMO = {
  meenaId: "11111111-1111-4111-8111-111111111111",
  rameshId: "22222222-2222-4222-8222-222222222222",
  sareeId: "aaaaaaaa-0000-4000-8000-000000000001",
  potsId: "aaaaaaaa-0000-4000-8000-000000000002",
  pickleId: "aaaaaaaa-0000-4000-8000-000000000003",
  bedsheetId: "aaaaaaaa-0000-4000-8000-000000000004",
  conversationId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  orderId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
  buyerName: "Priya",
  buyerLanguage: "hi-IN",
  sellerLanguage: "ta-IN",
} as const;

const SELLERS = [
  {
    id: DEMO.meenaId,
    name: "Meena",
    language: "ta-IN",
    city: "Kanchipuram",
    state: "Tamil Nadu",
    craft: "Silk weaving",
    gender: "female" as const,
    voice_intro_transcript:
      "வணக்கம், என் பெயர் மீனா. நான் காஞ்சிபுரத்தில் இருபது வருடங்களாகப் பட்டுப் புடவை நெய்கிறேன். என் அம்மாவிடம் கற்றுக்கொண்டேன். ஒவ்வொரு புடவையும் என் கையால் நெய்தது.",
  },
  {
    id: DEMO.rameshId,
    name: "Ramesh",
    language: "hi-IN",
    city: "Khurja",
    state: "Uttar Pradesh",
    craft: "Pottery",
    gender: "male" as const,
    voice_intro_transcript:
      "नमस्ते, मेरा नाम रमेश है। मैं खुर्जा से हूँ और तीन पीढ़ियों से हमारा परिवार मिट्टी के बर्तन बनाता है। हर बर्तन चाक पर हाथ से बनता है।",
  },
];

const L = (title: string, description: string, tags: string[]) => ({ title, description, tags });

const PRODUCTS: Array<{
  id: string;
  seller_id: string;
  name: string;
  category: string;
  material: string;
  craft_story: string;
  price: number;
  quantity: number;
  size_options: string[];
  photo_url: string;
  listing: Listing;
}> = [
  {
    id: DEMO.sareeId,
    seller_id: DEMO.meenaId,
    name: "Kanchipuram silk saree",
    category: "Sarees & Textiles",
    material: "Pure mulberry silk with real zari",
    craft_story: "Hand-woven by Meena on a pit loom over 12 days, a skill learnt from her mother.",
    price: 8500,
    quantity: 3,
    size_options: ["6.2 m with blouse piece"],
    photo_url: "/seed/saree.svg",
    listing: {
      en: L(
        "Hand-woven Kanchipuram Silk Saree",
        "Pure mulberry silk with a real zari border.\nWoven by Meena on a pit loom over 12 days.\nA craft passed down from her mother in Kanchipuram.",
        ["kanchipuram", "silk saree", "handloom", "zari", "wedding"]
      ),
      hi: L(
        "हाथ से बुनी कांचीपुरम रेशमी साड़ी",
        "असली ज़री बॉर्डर के साथ शुद्ध मलबरी रेशम।\nमीना ने 12 दिनों में गड्ढा करघे पर बुनी।\nकांचीपुरम में माँ से सीखी गई कारीगरी।",
        ["कांचीपुरम", "रेशमी साड़ी", "हथकरघा", "ज़री", "शादी"]
      ),
      ta: L(
        "கையால் நெய்த காஞ்சிபுரம் பட்டுப் புடவை",
        "உண்மையான ஜரிகை பார்டருடன் தூய மல்பெரி பட்டு.\nமீனா குழித்தறியில் 12 நாட்கள் நெய்தது.\nகாஞ்சிபுரத்தில் அம்மாவிடம் கற்ற கைவினை.",
        ["காஞ்சிபுரம்", "பட்டுப் புடவை", "கைத்தறி", "ஜரிகை", "திருமணம்"]
      ),
    },
  },
  {
    id: DEMO.bedsheetId,
    seller_id: DEMO.meenaId,
    name: "Handloom cotton bedsheet",
    category: "Home Linen",
    material: "100% cotton",
    craft_story: "Woven on a handloom in Kanchipuram in a traditional checked pattern.",
    price: 1800,
    quantity: 8,
    size_options: ["Double", "King"],
    photo_url: "/seed/bedsheet.svg",
    listing: {
      en: L(
        "Handloom Cotton Bedsheet",
        "Soft 100% cotton in a traditional checked pattern.\nHand-woven in Kanchipuram.\nAvailable in double and king sizes.",
        ["handloom", "cotton", "bedsheet", "checks", "home"]
      ),
      hi: L(
        "हथकरघा सूती चादर",
        "पारंपरिक चेक डिज़ाइन में मुलायम 100% सूती।\nकांचीपुरम में हाथ से बुनी।\nडबल और किंग साइज़ में उपलब्ध।",
        ["हथकरघा", "सूती", "चादर", "चेक", "घर"]
      ),
      ta: L(
        "கைத்தறி பருத்திப் படுக்கை விரிப்பு",
        "பாரம்பரியக் கட்டம் போட்ட மென்மையான 100% பருத்தி.\nகாஞ்சிபுரத்தில் கைத்தறியில் நெய்தது.\nடபுள், கிங் அளவுகளில் கிடைக்கும்.",
        ["கைத்தறி", "பருத்தி", "படுக்கை விரிப்பு", "கட்டம்", "வீடு"]
      ),
    },
  },
  {
    id: DEMO.potsId,
    seller_id: DEMO.rameshId,
    name: "Terracotta pots set",
    category: "Pottery & Clay",
    material: "Terracotta clay",
    craft_story: "Thrown on the wheel by Ramesh's family in Khurja, potters for three generations.",
    price: 1200,
    quantity: 10,
    size_options: ["Set of 3"],
    photo_url: "/seed/pots.svg",
    listing: {
      en: L(
        "Hand-thrown Terracotta Pots (Set of 3)",
        "Three terracotta pots shaped on the potter's wheel.\nMade by Ramesh's family in Khurja.\nPotters for three generations.",
        ["terracotta", "pottery", "khurja", "planters", "handmade"]
      ),
      hi: L(
        "हाथ से बने टेराकोटा गमले (3 का सेट)",
        "चाक पर बने तीन टेराकोटा गमले।\nखुर्जा में रमेश के परिवार ने बनाए।\nतीन पीढ़ियों से कुम्हार।",
        ["टेराकोटा", "मिट्टी के बर्तन", "खुर्जा", "गमले", "हस्तनिर्मित"]
      ),
    },
  },
  {
    id: DEMO.pickleId,
    seller_id: DEMO.rameshId,
    name: "Homemade mango pickle",
    category: "Food & Pickles",
    material: "Raw mango, mustard oil, spices",
    craft_story: "Made at home by Ramesh's mother with a family recipe, sun-cured for a month.",
    price: 350,
    quantity: 20,
    size_options: ["500 g"],
    photo_url: "/seed/pickle.svg",
    listing: {
      en: L(
        "Homemade Mango Pickle (500 g)",
        "Raw mangoes in mustard oil and hand-ground spices.\nRamesh's mother's family recipe.\nSun-cured for a whole month.",
        ["mango pickle", "achaar", "homemade", "mustard oil", "khurja"]
      ),
      hi: L(
        "घर का बना आम का अचार (500 ग्राम)",
        "सरसों के तेल और हाथ से पिसे मसालों में कच्चे आम।\nरमेश की माँ की पारिवारिक रेसिपी।\nपूरे एक महीने धूप में पका।",
        ["आम का अचार", "अचार", "घर का बना", "सरसों का तेल", "खुर्जा"]
      ),
    },
  },
];

const MESSAGES: Array<{ sender: "buyer" | "seller"; hi: string; ta: string }> = [
  {
    sender: "buyer",
    hi: "नमस्ते! क्या यह साड़ी असली कांचीपुरम रेशम की है?",
    ta: "வணக்கம்! இந்தப் புடவை உண்மையான காஞ்சிபுரம் பட்டா?",
  },
  {
    sender: "seller",
    ta: "ஆமாம், இது தூய பட்டு, உண்மையான ஜரிகையுடன் நானே கையால் நெய்தது.",
    hi: "हाँ, यह शुद्ध रेशम है, असली ज़री के साथ, मैंने ख़ुद हाथ से बुनी है।",
  },
  {
    sender: "buyer",
    hi: "इसकी कीमत क्या है? क्या थोड़ा कम हो सकता है?",
    ta: "இதன் விலை என்ன? கொஞ்சம் குறைக்க முடியுமா?",
  },
  {
    sender: "seller",
    ta: "விலை ₹8,500. லக்னோவுக்கு இலவச டெலிவரி தருகிறேன்.",
    hi: "कीमत ₹8,500 है। लखनऊ के लिए मुफ़्त डिलीवरी दूँगी।",
  },
  {
    sender: "buyer",
    hi: "ठीक है, मुझे लाल रंग वाली एक साड़ी चाहिए। मैं ऑर्डर कर रही हूँ।",
    ta: "சரி, எனக்கு சிவப்பு நிறப் புடவை ஒன்று வேண்டும். ஆர்டர் செய்கிறேன்.",
  },
  {
    sender: "seller",
    ta: "நன்றி! உங்கள் ஆர்டர் கிடைத்தது, இன்றே உறுதி செய்கிறேன்.",
    hi: "धन्यवाद! आपका ऑर्डर मिल गया, आज ही पक्का करती हूँ।",
  },
];

export type SeedTts = (text: string, lang: string, gender: "female" | "male") => Promise<Buffer | null>;

export type SeedResult = { sellers: number; products: number; messages: number; introAudio: number };

async function must<T>(p: PromiseLike<{ data: T; error: { message: string } | null }>, what: string) {
  const { data, error } = await p;
  if (error) throw new Error(`${what}: ${error.message}`);
  return data;
}

/**
 * Deletes the demo sellers (cascades to products, conversations, messages, orders)
 * and recreates everything. Idempotent.
 */
export async function seedDemo(sb: SupabaseClient, opts: { tts?: SeedTts; log?: (s: string) => void } = {}): Promise<SeedResult> {
  const log = opts.log ?? (() => {});

  await must(sb.from("sellers").delete().in("id", [DEMO.meenaId, DEMO.rameshId]), "delete sellers");
  log("Cleared old demo data");

  // Voice intros (optional — only if TTS is available)
  let introAudio = 0;
  const sellerRows = [];
  for (const s of SELLERS) {
    let voice_intro_url: string | null = null;
    if (opts.tts) {
      try {
        const audio = await opts.tts(s.voice_intro_transcript, s.language, s.gender);
        if (audio) {
          const path = `seed/${s.id}.mp3`;
          const { error } = await sb.storage
            .from("voice-intros")
            .upload(path, audio, { contentType: "audio/mpeg", upsert: true });
          if (!error) {
            voice_intro_url = sb.storage.from("voice-intros").getPublicUrl(path).data.publicUrl;
            introAudio++;
          } else log(`Intro upload failed for ${s.name}: ${error.message}`);
        }
      } catch (e) {
        log(`Intro TTS failed for ${s.name}: ${(e as Error).message}`);
      }
    }
    sellerRows.push({ ...s, voice_intro_url });
  }

  await must(sb.from("sellers").insert(sellerRows), "insert sellers");
  log(`Inserted ${sellerRows.length} sellers (${introAudio} with generated voice intros)`);

  await must(
    sb.from("products").insert(PRODUCTS.map((p) => ({ ...p, status: "published" }))),
    "insert products"
  );
  log(`Inserted ${PRODUCTS.length} products`);

  const base = Date.now() - 1000 * 60 * 60 * 3;
  await must(
    sb.from("conversations").insert({
      id: DEMO.conversationId,
      product_id: DEMO.sareeId,
      seller_id: DEMO.meenaId,
      buyer_name: DEMO.buyerName,
      buyer_language: DEMO.buyerLanguage,
      created_at: new Date(base).toISOString(),
    }),
    "insert conversation"
  );

  await must(
    sb.from("messages").insert(
      MESSAGES.map((m, i) => {
        const fromBuyer = m.sender === "buyer";
        return {
          conversation_id: DEMO.conversationId,
          sender: m.sender,
          original_text: fromBuyer ? m.hi : m.ta,
          original_language: fromBuyer ? "hi-IN" : "ta-IN",
          translated_text: fromBuyer ? m.ta : m.hi,
          translated_language: fromBuyer ? "ta-IN" : "hi-IN",
          audio_url: null,
          created_at: new Date(base + (i + 1) * 60_000).toISOString(),
        };
      })
    ),
    "insert messages"
  );
  log(`Inserted ${MESSAGES.length} messages`);

  await must(
    sb.from("orders").insert({
      id: DEMO.orderId,
      product_id: DEMO.sareeId,
      conversation_id: DEMO.conversationId,
      buyer_name: DEMO.buyerName,
      quantity: 1,
      status: "placed",
      created_at: new Date(base + 5 * 60_000).toISOString(),
    }),
    "insert order"
  );
  log("Inserted 1 order (status: placed)");

  return { sellers: SELLERS.length, products: PRODUCTS.length, messages: MESSAGES.length, introAudio };
}
