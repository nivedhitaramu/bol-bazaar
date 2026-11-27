/**
 * Central env access — safe at import time (never throws) and read at RUNTIME.
 *
 * Server code reads variables via a dynamic key (`readEnv("NEXT_PUBLIC_…")`) on purpose:
 * Next.js inlines literal `process.env.NEXT_PUBLIC_*` at BUILD time, which would freeze an
 * empty value into a keyless Docker image. Dynamic access lets keys added at `docker run`
 * time still work on the server.
 *
 * Supports both the new Supabase key names (sb_publishable_… / sb_secret_…) and the legacy
 * anon / service_role names.
 */
export function readEnv(name: string): string | undefined {
  if (typeof process === "undefined" || !process.env) return undefined;
  const v = process.env[name];
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

/** Project URL only — strips accidental paths like "/rest/v1/" copied from the dashboard. */
export function normalizeSupabaseUrl(raw: string | undefined): string | undefined {
  if (!raw?.trim()) return undefined;
  try {
    return new URL(raw.trim()).origin;
  } catch {
    return undefined; // not a URL → treat as unset rather than crash
  }
}

export function supabaseUrl(): string | undefined {
  return normalizeSupabaseUrl(readEnv("NEXT_PUBLIC_SUPABASE_URL"));
}

export function supabasePublishableKey(): string | undefined {
  return readEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY") || readEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");
}

/** Server-only. Never import from client components. */
export function supabaseSecretKey(): string | undefined {
  return readEnv("SUPABASE_SECRET_KEY") || readEnv("SUPABASE_SERVICE_ROLE_KEY");
}

/** Server-only. */
export function sarvamKey(): string | undefined {
  return readEnv("SARVAM_API_KEY");
}

export function isSupabaseConfigured(): boolean {
  return Boolean(supabaseUrl() && supabaseSecretKey());
}

export function siteUrl(reqOrigin?: string): string {
  const explicit = readEnv("NEXT_PUBLIC_SITE_URL");
  if (explicit) return explicit.replace(/\/$/, "");
  if (reqOrigin) return reqOrigin;
  const vercel = readEnv("VERCEL_URL");
  if (vercel) return `https://${vercel}`;
  return "http://localhost:3000";
}
