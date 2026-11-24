export const LANGUAGES = [
  { code: "ta-IN", short: "ta", name: "Tamil", native: "தமிழ்", flagChar: "த" },
  { code: "hi-IN", short: "hi", name: "Hindi", native: "हिन्दी", flagChar: "हि" },
  { code: "en-IN", short: "en", name: "English", native: "English", flagChar: "En" },
  { code: "te-IN", short: "te", name: "Telugu", native: "తెలుగు", flagChar: "తె" },
  { code: "kn-IN", short: "kn", name: "Kannada", native: "ಕನ್ನಡ", flagChar: "ಕ" },
  { code: "ml-IN", short: "ml", name: "Malayalam", native: "മലയാളം", flagChar: "മ" },
  { code: "bn-IN", short: "bn", name: "Bengali", native: "বাংলা", flagChar: "বা" },
  { code: "mr-IN", short: "mr", name: "Marathi", native: "मराठी", flagChar: "म" },
  { code: "gu-IN", short: "gu", name: "Gujarati", native: "ગુજરાતી", flagChar: "ગુ" },
] as const;

export type LangCode = (typeof LANGUAGES)[number]["code"];
export type LangShort = (typeof LANGUAGES)[number]["short"];

export const LANG_CODES = LANGUAGES.map((l) => l.code) as LangCode[];
export const DEFAULT_LANG: LangCode = "en-IN";
export const LANG_COOKIE = "bb_lang";

export function isLangCode(x: unknown): x is LangCode {
  return typeof x === "string" && (LANG_CODES as string[]).includes(x);
}

export function normalizeLang(x: unknown, fallback: LangCode = DEFAULT_LANG): LangCode {
  if (isLangCode(x)) return x;
  if (typeof x === "string") {
    const hit = LANGUAGES.find((l) => l.short === x || l.code.toLowerCase() === x.toLowerCase());
    if (hit) return hit.code;
  }
  return fallback;
}

export function shortOf(code: LangCode): LangShort {
  return code.split("-")[0] as LangShort;
}

export function langInfo(code: string) {
  return LANGUAGES.find((l) => l.code === code) ?? LANGUAGES[2];
}

export const INDIAN_STATES = [
  "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh", "Delhi", "Goa", "Gujarat",
  "Haryana", "Himachal Pradesh", "Jammu & Kashmir", "Jharkhand", "Karnataka", "Kerala", "Ladakh",
  "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya", "Mizoram", "Nagaland", "Odisha",
  "Puducherry", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana", "Tripura",
  "Uttar Pradesh", "Uttarakhand", "West Bengal",
];

export const CATEGORIES = [
  "Sarees & Textiles",
  "Pottery & Clay",
  "Food & Pickles",
  "Home Linen",
  "Jewellery",
  "Woodwork",
  "Art & Paintings",
  "Other",
] as const;
