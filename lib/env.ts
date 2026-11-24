/**
 * Central env access. Supports both the new Supabase key names
 * (sb_publishable_... / sb_secret_...) and the legacy anon / service_role names.
 */
/** Project URL only — strips accidental paths like "/rest/v1/" copied from the dashboard. */
export function normalizeSupabaseUrl(raw: string | undefined): string | undefined {
  if (!raw?.trim()) return undefined;
  try {
    return new URL(raw.trim()).origin;
  } catch {
    return raw.trim().replace(/\/+$/, "");
  }
}

export function supabaseUrl(): string | undefined {
  return normalizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
}

export function supabasePublishableKey(): string | undefined {
  return (
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    undefined
  );
}

/** Server-only. Never import from client components. */
export function supabaseSecretKey(): string | undefined {
  return process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || undefined;
}

/** Server-only. */
export function sarvamKey(): string | undefined {
  const k = process.env.SARVAM_API_KEY?.trim();
  return k ? k : undefined;
}

export function isSupabaseConfigured(): boolean {
  return Boolean(supabaseUrl() && supabaseSecretKey());
}

export function siteUrl(reqOrigin?: string): string {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, "");
  if (reqOrigin) return reqOrigin;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}
