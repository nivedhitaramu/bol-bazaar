import "server-only";

/**
 * Live "Listening… / Translating…" status for polling mode (no Supabase Realtime).
 * Process memory is fine: it's ephemeral UI state, and demo mode is a single server.
 */
export type PeerState = "idle" | "listening" | "translating" | "speaking";
type Entry = { state: PeerState; at: number };

const g = globalThis as unknown as { __bolBazaarPresence?: Map<string, Entry> };
const map = (g.__bolBazaarPresence ??= new Map());
const TTL_MS = 30_000;

export function setPresence(conversationId: string, side: "buyer" | "seller", state: PeerState) {
  map.set(`${conversationId}:${side}`, { state, at: Date.now() });
}

export function getPresence(conversationId: string) {
  const read = (side: "buyer" | "seller"): PeerState => {
    const e = map.get(`${conversationId}:${side}`);
    return e && Date.now() - e.at < TTL_MS ? e.state : "idle";
  };
  return { buyer: read("buyer"), seller: read("seller") };
}
