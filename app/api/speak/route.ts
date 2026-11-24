import { NextRequest } from "next/server";
import { z } from "zod";
import { fail, ok, translateSafe, ttsSafe } from "@/lib/api";

export const maxDuration = 30;

const Body = z.object({
  text: z.string().min(1).max(2400),
  to: z.string(),
  from: z.string().optional(),
  gender: z.enum(["female", "male"]).optional(),
  audio: z.boolean().optional().default(true),
});

/** Optionally translate `text` from → to, then synthesize speech in `to`. */
export async function POST(req: NextRequest) {
  try {
    const b = Body.parse(await req.json());
    const tr = b.from && b.from !== b.to ? await translateSafe(b.text, b.from, b.to, "formal") : { text: b.text, ok: true };
    const audio = b.audio ? await ttsSafe(tr.text, b.to, b.gender) : null;
    return ok({ text: tr.text, translated: tr.ok, audio: audio?.base64 ?? null, mime: audio?.mime ?? null });
  } catch (e) {
    return fail(e);
  }
}
