import { NextRequest } from "next/server";
import { z } from "zod";
import { fail, ok, ttsSafe, voiceInput, ApiError } from "@/lib/api";
import { applyEdit, DraftSchema, extractProduct, generateListing, missingFields, readbackText } from "@/lib/llm";
import { normalizeLang } from "@/lib/languages";
import { getSeller } from "@/lib/data";
import { isSupabaseConfigured } from "@/lib/env";
import type { Listing, ProductDraft } from "@/lib/types";

export const maxDuration = 60;

const ListingSchema = z.record(z.string(), z.object({ title: z.string(), description: z.string(), tags: z.array(z.string()) }));

/**
 * POST multipart
 *   mode: "create" | "edit" | "regenerate"
 *   language: seller language (xx-IN)
 *   sellerId?: for maker name/city in the listing
 *   audio | text: the spoken description / edit instruction
 *   draft?, listing?: JSON (edit / regenerate)
 */
export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const mode = String(form.get("mode") || "create");
    const lang = normalizeLang(form.get("language"));
    const sellerId = form.get("sellerId") ? String(form.get("sellerId")) : null;
    const gender = form.get("gender") === "male" ? "male" : "female";

    const sellerP = sellerId && isSupabaseConfigured() ? getSeller(sellerId).catch(() => null) : Promise.resolve(null);

    let transcript: string | undefined;
    let draft: ProductDraft;
    let change: string | undefined;
    let listing: Listing | null = null;
    const sources: Record<string, string> = {};

    const prevDraft = form.get("draft") ? DraftSchema.parse(JSON.parse(String(form.get("draft")))) : null;
    const prevListing = form.get("listing") ? ListingSchema.safeParse(JSON.parse(String(form.get("listing")))) : null;

    if (mode === "create") {
      transcript = (await voiceInput(form, lang)).transcript;
      const r = await extractProduct(transcript, lang);
      draft = r.draft;
      sources.extract = r.source;
    } else if (mode === "edit") {
      if (!prevDraft) throw new ApiError(400, "no_draft", "Missing draft");
      transcript = (await voiceInput(form, lang)).transcript;
      const r = await applyEdit(prevDraft, transcript, lang);
      draft = r.draft;
      change = r.change;
      sources.edit = r.source;
      // Price/quantity aren't in the listing text — reuse it to save a round trip.
      const changed = (Object.keys(draft) as (keyof ProductDraft)[]).filter(
        (k) => JSON.stringify(draft[k]) !== JSON.stringify(prevDraft[k])
      );
      if (prevListing?.success && changed.every((k) => k === "price" || k === "quantity")) listing = prevListing.data;
    } else if (mode === "regenerate") {
      if (!prevDraft) throw new ApiError(400, "no_draft", "Missing draft");
      draft = prevDraft;
    } else throw new ApiError(400, "bad_mode", "Unknown mode");

    if (!listing) {
      const seller = await sellerP;
      const r = await generateListing(draft, lang, seller ?? undefined);
      listing = r.listing;
      sources.listing = r.source;
    }

    const readback = readbackText(listing, draft, lang);
    const audio = await ttsSafe(readback, lang, gender);

    return ok({
      transcript,
      draft,
      missing: missingFields(draft),
      listing,
      readback,
      change,
      audio: audio?.base64 ?? null,
      mime: audio?.mime ?? null,
      sources,
    });
  } catch (e) {
    return fail(e);
  }
}
