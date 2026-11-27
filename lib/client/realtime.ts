"use client";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { getBrowserSupabase } from "@/lib/supabase/client";
import type { Message, Order } from "@/lib/types";

export type PeerState = "idle" | "listening" | "translating" | "speaking";
export type StatusPayload = { side: "buyer" | "seller"; state: PeerState; panel: string };

type Handlers = {
  onMessage?: (m: Message, kind: "INSERT" | "UPDATE") => void;
  onStatus?: (s: StatusPayload) => void;
  onOrder?: (o: Order) => void;
  onConnection?: (live: boolean) => void;
  /** A message was taken back ("illa, thappu"). */
  onDelete?: (id: string) => void;
};

type Entry = {
  channel: RealtimeChannel | null;
  handlers: Set<Handlers>;
  live: boolean;
  poll: ReturnType<typeof setInterval> | null;
  seen: Set<string>;
  /** id → translated_text|audio_url, to notice a retried translation in polling mode. */
  sig: Map<string, string>;
  /** ids in the last poll, to notice deletions in polling mode. */
  lastIds: Set<string> | null;
  orderStamp: Map<string, string>;
  closed: boolean;
};

const registry = new Map<string, Entry>();
const POLL_MS = 1500;

let modeP: Promise<boolean> | null = null;
/**
 * True only if the browser has Supabase keys AND the server stores data in Supabase.
 * (In keyless demo mode the server uses an in-memory store, so we must poll it instead.)
 */
export function realtimeAvailable(): Promise<boolean> {
  if (!modeP) {
    modeP = (async () => {
      if (!getBrowserSupabase()) return false;
      try {
        const r = await fetch("/api/health?quick=1", { cache: "no-store" });
        const j = await r.json();
        return Boolean(j?.config?.supabase);
      } catch {
        return false;
      }
    })();
  }
  return modeP;
}

async function pollOnce(conversationId: string, e: Entry) {
  try {
    const r = await fetch(`/api/conversations/${conversationId}?messagesOnly=1`, { cache: "no-store" });
    if (!r.ok || e.closed) return;
    const j = (await r.json()) as {
      messages: Message[];
      orders?: Order[];
      presence?: Record<"buyer" | "seller", PeerState>;
    };
    const ids = new Set<string>();
    for (const m of j.messages) {
      ids.add(m.id);
      const sig = `${m.translated_text ?? ""}|${m.audio_url ?? ""}`;
      if (!e.seen.has(m.id)) {
        e.seen.add(m.id);
        e.sig.set(m.id, sig);
        e.handlers.forEach((h) => h.onMessage?.(m, "INSERT"));
      } else if (e.sig.has(m.id) && e.sig.get(m.id) !== sig) {
        e.sig.set(m.id, sig);
        e.handlers.forEach((h) => h.onMessage?.(m, "UPDATE")); // translation filled in later
      } else e.sig.set(m.id, sig);
    }
    if (e.lastIds) for (const id of e.lastIds) if (!ids.has(id)) e.handlers.forEach((h) => h.onDelete?.(id));
    e.lastIds = ids;
    for (const o of j.orders ?? []) {
      const stamp = `${o.status}|${o.updated_at}`;
      if (e.orderStamp.get(o.id) === stamp) continue;
      e.orderStamp.set(o.id, stamp);
      e.handlers.forEach((h) => h.onOrder?.(o));
    }
    if (!e.live && j.presence) {
      for (const side of ["buyer", "seller"] as const) {
        e.handlers.forEach((h) => h.onStatus?.({ side, state: j.presence![side], panel: "remote" }));
      }
    }
  } catch {}
}

function startPolling(conversationId: string, e: Entry) {
  if (e.poll || e.closed) return;
  pollOnce(conversationId, e);
  e.poll = setInterval(() => pollOnce(conversationId, e), POLL_MS);
}

function connectRealtime(conversationId: string, entry: Entry) {
  const sb = getBrowserSupabase();
  if (!sb) return startPolling(conversationId, entry);
  const ch = sb
    .channel(`conv-${conversationId}`, { config: { broadcast: { self: true } } })
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "messages", filter: `conversation_id=eq.${conversationId}` },
      (payload) => {
        const m = payload.new as Message;
        if (!m?.id) return;
        const kind = payload.eventType === "UPDATE" ? "UPDATE" : "INSERT";
        if (kind === "INSERT") {
          if (entry.seen.has(m.id)) return;
          entry.seen.add(m.id);
        }
        entry.handlers.forEach((h) => h.onMessage?.(m, kind));
      }
    )
    // DELETE events can't be filtered by column in Supabase Realtime — listen unfiltered; the
    // payload only carries the id, and panels ignore ids they don't have.
    .on("postgres_changes", { event: "DELETE", schema: "public", table: "messages" }, (payload) => {
      const id = (payload.old as { id?: string })?.id;
      if (id) entry.handlers.forEach((h) => h.onDelete?.(id));
    })
    .on("broadcast", { event: "status" }, ({ payload }) => {
      entry.handlers.forEach((h) => h.onStatus?.(payload as StatusPayload));
    })
    .subscribe((status) => {
      const live = status === "SUBSCRIBED";
      entry.live = live;
      entry.handlers.forEach((h) => h.onConnection?.(live));
      if (live) {
        if (entry.poll) {
          clearInterval(entry.poll);
          entry.poll = null;
        }
        pollOnce(conversationId, entry); // catch anything missed while connecting
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
        startPolling(conversationId, entry);
      }
    });
  entry.channel = ch;
  setTimeout(() => {
    if (!entry.live) startPolling(conversationId, entry);
  }, 6000);
}

/**
 * One shared subscription per conversation (two panels in the same tab — /demo — share it).
 * Supabase Realtime when available; otherwise polls the local API every 1.5 s.
 */
export function subscribeConversation(conversationId: string, handlers: Handlers, knownIds: string[] = []) {
  let e = registry.get(conversationId);
  if (!e) {
    const entry: Entry = {
      channel: null,
      handlers: new Set(),
      live: false,
      poll: null,
      seen: new Set(knownIds),
      sig: new Map(),
      lastIds: null,
      orderStamp: new Map(),
      closed: false,
    };
    e = entry;
    registry.set(conversationId, entry);
    realtimeAvailable().then((rt) => {
      if (entry.closed) return;
      if (rt) connectRealtime(conversationId, entry);
      else startPolling(conversationId, entry);
    });
  } else {
    knownIds.forEach((id) => e!.seen.add(id));
  }
  e.handlers.add(handlers);
  handlers.onConnection?.(e.live);

  const entry = e;
  return {
    sendStatus(s: StatusPayload) {
      // Other panels in this tab (the /demo split screen) get it instantly…
      entry.handlers.forEach((h) => h !== handlers && h.onStatus?.(s));
      // …and other devices via Realtime broadcast, or via the server in polling mode.
      if (entry.channel && entry.live) {
        entry.channel.send({ type: "broadcast", event: "status", payload: s }).catch(() => {});
      } else {
        fetch(`/api/conversations/${conversationId}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ side: s.side, state: s.state }),
        }).catch(() => {});
      }
    },
    unsubscribe() {
      entry.handlers.delete(handlers);
      if (entry.handlers.size === 0) {
        entry.closed = true;
        if (entry.poll) clearInterval(entry.poll);
        if (entry.channel) getBrowserSupabase()?.removeChannel(entry.channel);
        registry.delete(conversationId);
      }
    },
  };
}

/** Subscribe to order changes (Realtime only; polling mode delivers orders via subscribeConversation). */
export function subscribeOrders(onChange: (o: Order) => void) {
  let off = () => {};
  let cancelled = false;
  realtimeAvailable().then((rt) => {
    const sb = getBrowserSupabase();
    if (!rt || !sb || cancelled) return;
    const ch = sb
      .channel(`orders-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, (p) => {
        if ((p.new as Order)?.id) onChange(p.new as Order);
      })
      .subscribe();
    off = () => sb.removeChannel(ch);
  });
  return () => {
    cancelled = true;
    off();
  };
}

/** Subscribe to all new messages (seller dashboard unread badges). Realtime only. */
export function subscribeAllMessages(onInsert: (m: Message) => void) {
  let off = () => {};
  let cancelled = false;
  realtimeAvailable().then((rt) => {
    const sb = getBrowserSupabase();
    if (!rt || !sb || cancelled) return;
    const ch = sb
      .channel(`msgs-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, (p) => onInsert(p.new as Message))
      .subscribe();
    off = () => sb.removeChannel(ch);
  });
  return () => {
    cancelled = true;
    off();
  };
}
