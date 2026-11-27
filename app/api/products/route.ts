import { NextRequest } from "next/server";
import { z } from "zod";
import { ApiError, fail, ok } from "@/lib/api";
import { DraftSchema } from "@/lib/llm";
import { getStore } from "@/lib/store";

const Body = z.object({
  sellerId: z.string().uuid(),
  draft: DraftSchema,
  listing: z.record(z.string(), z.object({ title: z.string(), description: z.string(), tags: z.array(z.string()) })),
  photoUrl: z.string().nullable().optional(),
  status: z.enum(["draft", "published"]),
  productId: z.string().uuid().optional(),
});

/** Create (or update, if productId given) a product from a voice draft. */
export async function POST(req: NextRequest) {
  try {
    const b = Body.parse(await req.json());
    const d = b.draft;
    if (b.status === "published" && (!d.product_name || d.price == null))
      throw new ApiError(400, "incomplete", "Name and price are required to publish");
    const row = {
      seller_id: b.sellerId,
      name: d.product_name || b.listing.en?.title || "Untitled product",
      category: d.category,
      material: d.material,
      craft_story: d.craft_story,
      price: d.price,
      quantity: d.quantity,
      size_options: d.size_options ?? [],
      photo_url: b.photoUrl ?? null,
      listing: b.listing,
      status: b.status,
    } as const;
    const id = await getStore().saveProduct(row, b.productId);
    return ok({ id });
  } catch (e) {
    return fail(e);
  }
}
