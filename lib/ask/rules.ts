/**
 * "Ask your shop" — pure parts (unit-tested in tests/ask.test.ts, no network):
 *  - detectIntentRules(): rule-based intent (no-keys mode, and a guard for the LLM)
 *  - composeAnswer():     short, warm spoken answer in the seller's language from facts
 * Numbers, prices and names go into the sentence verbatim — never through machine translation.
 */
import { NAMES } from "../translate/protect";
import { formatIndian } from "../numbers";

export type AskIntent = "today_summary" | "pending_replies" | "orders" | "last_message_from" | "help";

export type AskFacts = {
  todayEnquiries: number; // conversations with a buyer message today
  todayOrders: number;
  todayOrdersWorth: number;
  waiting: string[]; // buyer names whose last message has no reply yet
  openOrders: { toConfirm: number; toShip: number; worth: number; total: number };
  lastMessage: { from: string; text: string } | null;
  person: string | null; // who the seller asked about (for "not found")
};

const lower = (s: string) => s.normalize("NFC").toLowerCase();

/** Every script form of a known name → its English form ("பிரியா" → "Priya"). */
export function canonicalName(x: string): string {
  const hit = NAMES.find((n) => Object.values(n).some((f) => lower(f) === lower(x)));
  return hit?.en ?? x;
}

/** A name in the seller's script ("Priya" → "பிரியா" for Tamil). */
export function nameIn(x: string, langShort: string): string {
  const hit = NAMES.find((n) => Object.values(n).some((f) => lower(f) === lower(x)));
  return hit?.[langShort] ?? x;
}

/** Which buyer (from this seller's conversations) does the question mention? Any script. */
export function findPerson(question: string, buyers: string[]): string | null {
  const q = lower(question);
  for (const b of buyers) {
    const forms = [b, ...(NAMES.find((n) => Object.values(n).some((f) => lower(f) === lower(b))) ? Object.values(NAMES.find((n) => Object.values(n).some((f) => lower(f) === lower(b)))!) : [])];
    if (forms.some((f) => f.length >= 2 && q.includes(lower(f)))) return b;
  }
  return null;
}

const RX = {
  lastFrom: /(what did|what has|said|asked|message from|enna sonn|enna kett|என்ன சொன்ன|என்ன கேட்ட|சொன்னா|கேட்டா|ने क्या|क्या पूछा|क्या कहा|क्या बोला|kya poocha|kya bola|kya kaha)/u,
  pending: /(waiting|wait|reply|replied|respond|pending|jawab|जवाब|इंतज़ार|इंतजार|प्रतीक्षा|பதில்|காத்திரு|wait pann|badhil|bathil|pathil)/u,
  today: /(today|todays|indru|inniki|innaiku|இன்று|இன்னிக்கு|இன்னைக்கு|aaj|आज|what happened|enna aachu|enna achu|என்ன ஆச்சு|என்ன நடந்த|क्या हुआ|kya hua|summary|news)/u,
  orders: /(order|ऑर्डर|आर्डर|ஆர்டர்|sales|sold|बिक्री|விற்பனை)/u,
};

export function detectIntentRules(question: string, buyers: string[] = []): { intent: AskIntent; person: string | null } {
  const q = lower(question);
  const person = findPerson(question, buyers);
  if (RX.lastFrom.test(q) || (person && !RX.pending.test(q) && !RX.orders.test(q))) return { intent: "last_message_from", person };
  if (RX.pending.test(q)) return { intent: "pending_replies", person: null };
  if (RX.today.test(q)) return { intent: "today_summary", person: null };
  if (RX.orders.test(q)) return { intent: "orders", person: null };
  // A seller who taps the mic and says anything most likely wants "what's new?".
  return { intent: q.trim().length > 2 ? "today_summary" : "help", person: null };
}

// ───────────────────────── Answers ─────────────────────────

type Lang = "en" | "hi" | "ta";

const list = (names: string[], l: Lang) => {
  if (names.length <= 1) return names.join("");
  const and = l === "hi" ? " और " : l === "ta" ? " மற்றும் " : " and ";
  return names.slice(0, -1).join(", ") + and + names[names.length - 1];
};
const rs = (n: number) => `₹${formatIndian(n)}`;

/** A buyer's message that asks something ("…?", "क्या …", "…ா?") → "asked", otherwise "said". */
export function isQuestion(text: string): boolean {
  const t = text.trim();
  return /[?？]/.test(t) || /^(क्या|कब|कितन|कैसे|कहाँ|कौन)\s/u.test(t) || /(what|when|how|where|which|who|can you|is it|do you)\b/i.test(t.split(/[.!।]/)[0] ?? "");
}

export function composeAnswer(intent: AskIntent, f: AskFacts, lang: string): string {
  const l: Lang = lang.startsWith("hi") ? "hi" : lang.startsWith("ta") ? "ta" : "en";
  const waiting = f.waiting.slice(0, 3).map((n) => nameIn(n, l));
  const more = f.waiting.length - waiting.length;

  const others = (n: number) => (l === "hi" ? ` और ${n} लोग` : l === "ta" ? ` மற்றும் ${n} பேர்` : ` and ${n} more`);
  const whoWaiting = () => list(waiting, l) + (more > 0 ? others(more) : "");

  /** "Priya is waiting" — singular/plural verb agreement (Tamil/Hindi respectful forms). */
  const waitingLine = (): string => {
    const n = f.waiting.length;
    if (!n) return "";
    if (l === "hi") return ` ${whoWaiting()} आपके जवाब का इंतज़ार कर रहे हैं।`; // respectful plural, also for one person
    if (l === "ta") return ` ${whoWaiting()} உங்கள் பதிலுக்காகக் ${n === 1 ? "காத்திருக்கிறார்" : "காத்திருக்கிறார்கள்"}.`;
    return ` ${whoWaiting()} ${n === 1 ? "is" : "are"} waiting for your reply.`;
  };

  switch (intent) {
    case "today_summary": {
      const { todayEnquiries: e, todayOrders: o, todayOrdersWorth: w } = f;
      if (!e && !o) {
        const base = l === "hi" ? "आज अभी तक कुछ नया नहीं आया।" : l === "ta" ? "இன்று இதுவரை புதிதாக எதுவும் வரவில்லை." : "Nothing new has come in today yet.";
        return base + waitingLine();
      }
      if (l === "hi") {
        // पूछताछ is feminine & invariant; ऑर्डर masculine. मिली (1) / मिलीं (many) / मिले (mixed).
        const enq = e ? `${e} पूछताछ` : "";
        const ord = o ? `${o} ऑर्डर` : "";
        const verb = e && o ? "मिले" : e ? (e === 1 ? "मिली" : "मिलीं") : o === 1 ? "मिला" : "मिले";
        const worth = o ? `, कुल ${rs(w)} के` : "";
        return `आज आपको ${[enq, ord].filter(Boolean).join(" और ")} ${verb}${worth}।` + waitingLine();
      }
      if (l === "ta") {
        const enq = e ? (e === 1 ? "1 விசாரணை" : `${e} விசாரணைகள்`) : "";
        const ord = o ? (o === 1 ? "1 ஆர்டர்" : `${o} ஆர்டர்கள்`) : "";
        const many = (e ? 1 : 0) + (o ? 1 : 0) > 1 || e > 1 || o > 1;
        const verb = many ? "வந்துள்ளன" : "வந்துள்ளது";
        const worth = o ? `, மொத்தம் ${rs(w)}` : "";
        return `இன்று உங்களுக்கு ${[enq, ord].filter(Boolean).join(" மற்றும் ")} ${verb}${worth}.` + waitingLine();
      }
      const enq = e ? `${e} ${e === 1 ? "enquiry" : "enquiries"}` : "";
      const ord = o ? `${o} ${o === 1 ? "order" : "orders"} worth ${rs(w)}` : "";
      return `Today you got ${[enq, ord].filter(Boolean).join(" and ")}.` + waitingLine();
    }

    case "pending_replies": {
      const n = f.waiting.length;
      if (!n)
        return l === "hi"
          ? "कोई इंतज़ार नहीं कर रहा। आपने सबको जवाब दे दिया है।"
          : l === "ta"
            ? "யாரும் காத்திருக்கவில்லை. எல்லோருக்கும் பதில் சொல்லிவிட்டீர்கள்."
            : "No one is waiting. You have replied to everyone.";
      if (n === 1) return waitingLine().trim();
      if (l === "hi") return `${n} लोग आपके जवाब का इंतज़ार कर रहे हैं: ${whoWaiting()}।`;
      if (l === "ta") return `${n} பேர் உங்கள் பதிலுக்காகக் காத்திருக்கிறார்கள்: ${whoWaiting()}.`;
      return `${n} people are waiting for your reply: ${whoWaiting()}.`;
    }

    case "orders": {
      const { total, toConfirm, toShip, worth } = f.openOrders;
      const onTheWay = Math.max(0, total - toConfirm - toShip);
      if (!total)
        return l === "hi" ? "अभी कोई खुला ऑर्डर नहीं है।" : l === "ta" ? "இப்போது நிலுவையில் உள்ள ஆர்டர் எதுவும் இல்லை." : "You have no open orders right now.";

      // One order: say what it needs, no counts. Several: list only the non-zero parts.
      if (total === 1) {
        const need =
          toConfirm === 1
            ? { en: "waiting for you to confirm", hi: "इसे पक्का करना है", ta: "அதை உறுதி செய்ய வேண்டும்" }
            : toShip === 1
              ? { en: "ready to ship", hi: "इसे भेजना है", ta: "அதை அனுப்ப வேண்டும்" }
              : { en: "on its way to the buyer", hi: "यह रास्ते में है", ta: "அது வழியில் உள்ளது" };
        if (l === "hi") return `आपका 1 ऑर्डर खुला है, ${rs(worth)} का। ${need.hi}।`;
        if (l === "ta") return `உங்களிடம் 1 ஆர்டர் நிலுவையில் உள்ளது, ${rs(worth)}. ${need.ta}.`;
        return `You have 1 open order worth ${rs(worth)}, ${need.en}.`;
      }
      if (l === "hi") {
        const parts = [
          toConfirm && `${toConfirm} पक्का ${toConfirm === 1 ? "करना है" : "करने हैं"}`,
          toShip && `${toShip} ${toShip === 1 ? "भेजना है" : "भेजने हैं"}`,
          onTheWay && `${onTheWay} रास्ते में ${onTheWay === 1 ? "है" : "हैं"}`,
        ].filter(Boolean) as string[];
        return `आपके ${total} ऑर्डर खुले हैं, कुल ${rs(worth)} के। ${list(parts, "hi")}।`;
      }
      if (l === "ta") {
        const parts = [
          toConfirm && `${toConfirm} உறுதி செய்ய வேண்டும்`,
          toShip && `${toShip} அனுப்ப வேண்டும்`,
          onTheWay && `${onTheWay} வழியில் ${onTheWay === 1 ? "உள்ளது" : "உள்ளன"}`,
        ].filter(Boolean) as string[];
        return `உங்களிடம் ${total} ஆர்டர்கள் நிலுவையில் உள்ளன, மொத்தம் ${rs(worth)}. ${parts.join(", ")}.`;
      }
      const parts = [toConfirm && `${toConfirm} to confirm`, toShip && `${toShip} to ship`, onTheWay && `${onTheWay} on the way`].filter(Boolean) as string[];
      return `You have ${total} open orders worth ${rs(worth)}: ${list(parts, "en")}.`;
    }

    case "last_message_from": {
      if (!f.lastMessage) {
        const p = f.person ? nameIn(f.person, l) : null;
        if (l === "hi") return p ? `${p} का कोई संदेश नहीं मिला।` : "अभी कोई संदेश नहीं है।";
        if (l === "ta") return p ? `${p} அவர்களிடமிருந்து எந்தச் செய்தியும் இல்லை.` : "இப்போது எந்தச் செய்தியும் இல்லை.";
        return p ? `I couldn't find a message from ${p}.` : "There are no messages yet.";
      }
      const who = nameIn(f.lastMessage.from, l);
      const q = isQuestion(f.lastMessage.text);
      // Respectful forms: Tamil -ஆர் (not the neuter "சொன்னது"); Hindi ने पूछा / ने कहा.
      if (l === "hi") return `${who} ने ${q ? "पूछा" : "कहा"}: “${f.lastMessage.text}”`;
      if (l === "ta") return `${who} ${q ? "கேட்டார்" : "சொன்னார்"}: “${f.lastMessage.text}”`;
      return `${who} ${q ? "asked" : "said"}: “${f.lastMessage.text}”`;
    }

    default:
      return l === "hi"
        ? "आप पूछ सकते हैं: आज क्या हुआ? कौन जवाब का इंतज़ार कर रहा है? कितने ऑर्डर हैं? प्रिया ने क्या पूछा?"
        : l === "ta"
          ? "நீங்கள் கேட்கலாம்: இன்று என்ன ஆச்சு? யார் பதிலுக்குக் காத்திருக்கிறார்கள்? எத்தனை ஆர்டர்கள்? பிரியா என்ன கேட்டார்?"
          : "You can ask: what happened today? Who is waiting for my reply? How many orders? What did Priya ask?";
  }
}
