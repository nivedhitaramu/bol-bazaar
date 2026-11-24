"use client";
import { LanguageGrid } from "./LanguagePicker";
import { useLang } from "./LangProvider";

export function LandingLanguages() {
  const { lang, setLang } = useLang();
  return <LanguageGrid value={lang} onChange={setLang} />;
}
