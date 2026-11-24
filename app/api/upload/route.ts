import { NextRequest } from "next/server";
import { ApiError, fail, ok, rid, uploadPublic } from "@/lib/api";

export const maxDuration = 30;

const BUCKETS = new Set(["product-photos", "voice-intros"]);
const EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/gif": "gif",
  "audio/wav": "wav",
  "audio/webm": "webm",
  "audio/mp4": "m4a",
  "audio/ogg": "ogg",
  "audio/mpeg": "mp3",
};

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get("file");
    const bucket = String(form.get("bucket") || "");
    if (!BUCKETS.has(bucket)) throw new ApiError(400, "bad_bucket", "Unknown bucket");
    if (!(file instanceof Blob) || !file.size) throw new ApiError(400, "no_file", "No file");
    if (file.size > 4_200_000) throw new ApiError(413, "too_large", "File too large (max 4 MB)");
    const type = (file.type || "application/octet-stream").split(";")[0];
    const allowed = bucket === "product-photos" ? type.startsWith("image/") && type !== "image/svg+xml" : type.startsWith("audio/");
    if (!allowed) throw new ApiError(415, "bad_type", "Unsupported file type");
    const url = await uploadPublic(bucket, `${rid()}.${EXT[type] ?? "bin"}`, file, type);
    return ok({ url });
  } catch (e) {
    return fail(e);
  }
}
