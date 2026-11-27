import { NextRequest } from "next/server";
import { z } from "zod";
import { ApiError, fail, ok } from "@/lib/api";
import { getSeller } from "@/lib/data";
import { getStore } from "@/lib/store";
import { isLangCode } from "@/lib/languages";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const s = await getSeller(id);
    if (!s) throw new ApiError(404, "not_found", "Seller not found");
    return ok(s);
  } catch (e) {
    return fail(e);
  }
}

const Patch = z.object({ language: z.string().refine(isLangCode, "unsupported language") });

/** PATCH { language } — the seller's speaking language. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const b = Patch.parse(await req.json());
    return ok(await getStore().updateSellerLanguage(id, b.language));
  } catch (e) {
    return fail(e);
  }
}
