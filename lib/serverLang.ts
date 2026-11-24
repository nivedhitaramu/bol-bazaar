import "server-only";
import { cookies } from "next/headers";
import { type LangCode, LANG_COOKIE, normalizeLang } from "./languages";

export async function getServerLang(): Promise<LangCode> {
  const c = await cookies();
  return normalizeLang(c.get(LANG_COOKIE)?.value);
}
