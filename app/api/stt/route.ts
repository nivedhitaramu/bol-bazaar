import { NextRequest } from "next/server";
import { fail, ok, voiceInput } from "@/lib/api";

export const maxDuration = 30;

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const lang = String(form.get("language") || "unknown");
    const r = await voiceInput(form, lang);
    return ok({ transcript: r.transcript, language: r.detectedLanguage });
  } catch (e) {
    return fail(e);
  }
}
