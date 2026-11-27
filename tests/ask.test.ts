/** "Ask your shop" — intent rules and spoken answers (no network). Run with `npm test`. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { composeAnswer, detectIntentRules, isQuestion, type AskFacts } from "../lib/ask/rules";

const buyers = ["Priya", "Arjun"];

test("rule-based intents: Tamil, romanised Tamil, Hindi, English", () => {
  const cases: Array<[string, string, string | null]> = [
    ["Indru enna aachu?", "today_summary", null],
    ["இன்று என்ன ஆச்சு?", "today_summary", null],
    ["आज क्या हुआ?", "today_summary", null],
    ["What happened today?", "today_summary", null],
    ["How many orders?", "orders", null],
    ["எத்தனை ஆர்டர்?", "orders", null],
    ["कितने ऑर्डर हैं?", "orders", null],
    ["Who is waiting for my reply?", "pending_replies", null],
    ["யார் பதிலுக்கு காத்திருக்காங்க?", "pending_replies", null],
    ["किसको जवाब देना है?", "pending_replies", null],
    ["What did Priya ask?", "last_message_from", "Priya"],
    ["பிரியா என்ன கேட்டாங்க?", "last_message_from", "Priya"],
    ["प्रिया ने क्या पूछा?", "last_message_from", "Priya"],
    ["Priya enna sonnanga?", "last_message_from", "Priya"],
  ];
  for (const [q, intent, person] of cases) {
    const r = detectIntentRules(q, buyers);
    assert.equal(r.intent, intent, q);
    assert.equal(r.person, person, q);
  }
});

const facts: AskFacts = {
  todayEnquiries: 3,
  todayOrders: 1,
  todayOrdersWorth: 8500,
  waiting: ["Priya"],
  openOrders: { total: 2, toConfirm: 1, toShip: 1, worth: 10300 },
  lastMessage: { from: "Priya", text: "இந்தப் புடவை உண்மையான காஞ்சிபுரம் பட்டா?" },
  person: "Priya",
};

test("today summary — exact numbers and names in the seller's language", () => {
  assert.equal(
    composeAnswer("today_summary", facts, "en-IN"),
    "Today you got 3 enquiries and 1 order worth ₹8,500. Priya is waiting for your reply."
  );
  assert.equal(
    composeAnswer("today_summary", facts, "ta-IN"),
    "இன்று உங்களுக்கு 3 விசாரணைகள் மற்றும் 1 ஆர்டர் வந்துள்ளன, மொத்தம் ₹8,500. பிரியா உங்கள் பதிலுக்காகக் காத்திருக்கிறார்."
  );
  assert.equal(
    composeAnswer("today_summary", facts, "hi-IN"),
    "आज आपको 3 पूछताछ और 1 ऑर्डर मिले, कुल ₹8,500 के। प्रिया आपके जवाब का इंतज़ार कर रहे हैं।"
  );
});

test("pending replies, orders, last message, and empty cases", () => {
  assert.equal(composeAnswer("pending_replies", { ...facts, waiting: ["Priya", "Arjun"] }, "en-IN"), "2 people are waiting for your reply: Priya and Arjun.");
  assert.equal(composeAnswer("pending_replies", { ...facts, waiting: [] }, "ta-IN"), "யாரும் காத்திருக்கவில்லை. எல்லோருக்கும் பதில் சொல்லிவிட்டீர்கள்.");
  assert.equal(composeAnswer("orders", facts, "en-IN"), "You have 2 open orders worth ₹10,300: 1 to confirm and 1 to ship.");
  assert.equal(composeAnswer("last_message_from", facts, "ta-IN"), "பிரியா கேட்டார்: “இந்தப் புடவை உண்மையான காஞ்சிபுரம் பட்டா?”");
  assert.equal(composeAnswer("last_message_from", { ...facts, lastMessage: null, person: "Zoya" }, "en-IN"), "I couldn't find a message from Zoya.");
  assert.equal(
    composeAnswer("today_summary", { ...facts, todayEnquiries: 0, todayOrders: 0, waiting: [] }, "en-IN"),
    "Nothing new has come in today yet."
  );
});

test("grammar: Tamil/Hindi singular for one, plural for many", () => {
  const one = { ...facts, todayEnquiries: 1, todayOrders: 0, todayOrdersWorth: 0 };
  assert.equal(composeAnswer("today_summary", one, "ta-IN"), "இன்று உங்களுக்கு 1 விசாரணை வந்துள்ளது. பிரியா உங்கள் பதிலுக்காகக் காத்திருக்கிறார்.");
  assert.equal(composeAnswer("today_summary", one, "hi-IN"), "आज आपको 1 पूछताछ मिली। प्रिया आपके जवाब का इंतज़ार कर रहे हैं।");
  assert.equal(composeAnswer("today_summary", one, "en-IN"), "Today you got 1 enquiry. Priya is waiting for your reply.");
  const many = { ...facts, todayEnquiries: 4, todayOrders: 0, waiting: ["Priya", "Arjun"] };
  assert.equal(composeAnswer("today_summary", many, "ta-IN"), "இன்று உங்களுக்கு 4 விசாரணைகள் வந்துள்ளன. பிரியா மற்றும் அர்ஜுன் உங்கள் பதிலுக்காகக் காத்திருக்கிறார்கள்.");
  assert.equal(composeAnswer("today_summary", many, "hi-IN"), "आज आपको 4 पूछताछ मिलीं। प्रिया और अर्जुन आपके जवाब का इंतज़ार कर रहे हैं।");
  assert.equal(composeAnswer("pending_replies", facts, "ta-IN"), "பிரியா உங்கள் பதிலுக்காகக் காத்திருக்கிறார்.");
  assert.equal(composeAnswer("pending_replies", facts, "en-IN"), "Priya is waiting for your reply.");
});

test("orders: never says '0 to ship' — one order says what it needs, several list non-zero parts", () => {
  const single = { ...facts, openOrders: { total: 1, toConfirm: 1, toShip: 0, worth: 8500 } };
  assert.equal(composeAnswer("orders", single, "en-IN"), "You have 1 open order worth ₹8,500, waiting for you to confirm.");
  assert.equal(composeAnswer("orders", single, "ta-IN"), "உங்களிடம் 1 ஆர்டர் நிலுவையில் உள்ளது, ₹8,500. அதை உறுதி செய்ய வேண்டும்.");
  assert.equal(composeAnswer("orders", single, "hi-IN"), "आपका 1 ऑर्डर खुला है, ₹8,500 का। इसे पक्का करना है।");
  const mixed = { ...facts, openOrders: { total: 3, toConfirm: 2, toShip: 0, worth: 18000 } };
  assert.equal(composeAnswer("orders", mixed, "en-IN"), "You have 3 open orders worth ₹18,000: 2 to confirm and 1 on the way.");
  for (const lang of ["en-IN", "hi-IN", "ta-IN"]) {
    const a = composeAnswer("orders", mixed, lang);
    assert.ok(!/(^|\D)0 /.test(a), `no zero counts in: ${a}`);
  }
});

test("'asked' for questions, 'said' for statements (respectful forms)", () => {
  assert.equal(isQuestion("इसकी कीमत क्या है?"), true);
  assert.equal(isQuestion("क्या यह असली ज़री है"), true);
  assert.equal(isQuestion("ठीक है, मैं ऑर्डर कर रही हूँ।"), false);
  const said = { ...facts, lastMessage: { from: "Priya", text: "ठीक है, मैं ऑर्डर कर रही हूँ।" } };
  assert.equal(composeAnswer("last_message_from", said, "hi-IN"), "प्रिया ने कहा: “ठीक है, मैं ऑर्डर कर रही हूँ।”");
  assert.equal(composeAnswer("last_message_from", said, "ta-IN"), "பிரியா சொன்னார்: “ठीक है, मैं ऑर्डर कर रही हूँ।”");
  const asked = { ...facts, lastMessage: { from: "Priya", text: "Is this real zari?" } };
  assert.equal(composeAnswer("last_message_from", asked, "en-IN"), "Priya asked: “Is this real zari?”");
  assert.equal(composeAnswer("last_message_from", asked, "hi-IN"), "प्रिया ने पूछा: “Is this real zari?”");
});
