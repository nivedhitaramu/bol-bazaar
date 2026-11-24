"use client";
import { browserSttSupported, setVoiceMode } from "./voiceMode";
import type { VoiceResult } from "./useVoiceInput";

export class ClientApiError extends Error {
  constructor(public code: string, message: string, public status: number) {
    super(message);
  }
}

/** Thrown when server STT failed and we switched to browser STT — UI should ask the user to speak again. */
export class SwitchedToBrowserStt extends ClientApiError {
  constructor() {
    super("switched_stt", "Switched to browser speech recognition", 503);
  }
}

async function handle<T>(r: Response): Promise<T> {
  let j: unknown = null;
  try {
    j = await r.json();
  } catch {}
  if (!r.ok) {
    const body = (j ?? {}) as { code?: string; error?: string };
    const code = body.code || "server_error";
    if (code === "stt_unavailable" && browserSttSupported()) {
      setVoiceMode("browser");
      throw new SwitchedToBrowserStt();
    }
    throw new ClientApiError(code, body.error || `HTTP ${r.status}`, r.status);
  }
  return j as T;
}

export async function postJson<T>(url: string, body: unknown, method = "POST"): Promise<T> {
  const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return handle<T>(r);
}

export async function getJson<T>(url: string): Promise<T> {
  const r = await fetch(url, { cache: "no-store" });
  return handle<T>(r);
}

/** Post a voice/text input plus extra fields as multipart. */
export async function postVoice<T>(url: string, input: VoiceResult, fields: Record<string, string | undefined | null>): Promise<T> {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) if (v != null) form.append(k, v);
  if (input.text) form.append("text", input.text);
  if (input.audio) form.append("audio", input.audio, input.audio.type === "audio/wav" ? "speech.wav" : "speech.webm");
  const r = await fetch(url, { method: "POST", body: form });
  return handle<T>(r);
}

export async function uploadFile(file: Blob, bucket: "product-photos" | "voice-intros", name = "file"): Promise<string> {
  const form = new FormData();
  form.append("file", file, name);
  form.append("bucket", bucket);
  const r = await fetch("/api/upload", { method: "POST", body: form });
  return (await handle<{ url: string }>(r)).url;
}

/** Downscale a camera photo to max 1280px JPEG (low-end Android + upload size). */
export async function downscaleImage(file: File, max = 1280): Promise<Blob> {
  if (!file.type.startsWith("image/") || file.type === "image/svg+xml") return file;
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const w = Math.round(bmp.width * scale);
    const h = Math.round(bmp.height * scale);
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    c.getContext("2d")!.drawImage(bmp, 0, 0, w, h);
    const blob = await new Promise<Blob | null>((res) => c.toBlob(res, "image/jpeg", 0.85));
    return blob ?? file;
  } catch {
    return file;
  }
}
