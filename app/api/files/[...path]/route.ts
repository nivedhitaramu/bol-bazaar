import { NextRequest, NextResponse } from "next/server";
import { readMemoryFile } from "@/lib/store/memory";

export const dynamic = "force-dynamic";

/** Serves uploads (photos, voice intros, chat audio) held by the in-memory demo store. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const file = readMemoryFile(path.map(decodeURIComponent).join("/"));
  if (!file) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return new NextResponse(new Uint8Array(file.data), {
    headers: { "Content-Type": file.type, "Cache-Control": "public, max-age=3600", "Content-Length": String(file.data.length) },
  });
}
