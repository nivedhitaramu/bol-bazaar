import "server-only";
import { isSupabaseConfigured } from "../env";
import { MemoryStore } from "./memory";
import { SupabaseStore } from "./supabase";
import type { Store } from "./types";

export type { Store } from "./types";

let supabase: SupabaseStore | null = null;
let memory: MemoryStore | null = null;

/**
 * Supabase when NEXT_PUBLIC_SUPABASE_URL + secret key are set; otherwise the seeded
 * in-memory demo store. Decided per call (at runtime, never at build/import time).
 */
export function getStore(): Store {
  if (isSupabaseConfigured()) return (supabase ??= new SupabaseStore());
  return (memory ??= new MemoryStore());
}

export function storeMode(): Store["mode"] {
  return isSupabaseConfigured() ? "supabase" : "memory";
}
