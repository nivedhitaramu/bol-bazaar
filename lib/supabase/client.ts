"use client";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { normalizeSupabaseUrl } from "@/lib/env";

let browserClient: SupabaseClient | null = null;

/** Browser client (publishable key). Used only for Realtime subscriptions + public reads. */
export function getBrowserSupabase(): SupabaseClient | null {
  if (browserClient) return browserClient;
  const url = normalizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  browserClient = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    realtime: { params: { eventsPerSecond: 20 } },
  });
  return browserClient;
}
