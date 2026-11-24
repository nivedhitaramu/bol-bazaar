"use client";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { getBrowserSupabase } from "@/lib/supabase/client";
import type { Message, Order } from "@/lib/types";

export type PeerState = "idle" | "listening" | "translating" | "speaking";
export type StatusPayload = { side: "buyer" | "seller"; state: PeerState; panel: string };

type Handlers = {
  onMessage?: (m: Message, kind: "INSERT" | "UPDATE") => void;
  onStatus?: (s: StatusPayload) => void;
  onConnection?: (live: boolean) => void;
};

type Entry = {
  channel: RealtimeChannel | null;
  handlers: Set<Handlers>;
  live: boolean;
  poll: ReturnType<typeof setInterval> | null;
  seen: Set<string>;
};

const registry = new Map<string, Entry>();

async function pollOnce(conversationId: string, e: Entry) {
  try {
    const r = await fetch(`/api/conversations/${conversationId}?messagesOnly=1`, { cache: "no-store" });
    if (!r.ok) return;
    const { messages } = (await r.json()) as { messages: Message[] };
    for (const m of messages) {
      if (e.seen.has(m.id)) continue;
      e.seen.add(m.id);
      e.handlers.forEach((h) => h.onMessage?.(m, "INSERT"));
    }
  } catch {}
}

function startPolling(conversationId: string, e: Entry) {
  if (e.poll) return;
  e.poll = setInterval(() => pollOnce(conversationId, e), 2500);
}

/**
 * One shared channel per conversation (so two panels in the same tab — the /demo page — share it).
 * Falls back to polling if Realtime isn't configured or fails to connect.
 */
export function subscribeConversation(conversationId: string, handlers: Handlers, knownIds: string[] = []) {
  let e = registry.get(conversationId);
  if (!e) {
    e = { channel: null, handlers: new Set(), live: false, poll: null, seen: new Set(knownIds) };
    registry.set(conversationId, e);
    const entry = e;
    const sb = getBrowserSupabase();
    if (!sb) {
      startPolling(conversationId, entry);
    } else {
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
      // If it hasn't connected in 6 s, poll in the meantime.
      setTimeout(() => {
        if (!entry.live && registry.get(conversationId) === entry) startPolling(conversationId, entry);
      }, 6000);
    }
  } else {
    knownIds.forEach((id) => e!.seen.add(id));
  }
  e.handlers.add(handlers);
  handlers.onConnection?.(e.live);

  const entry = e;
  return {
    markSeen(id: string) {
      entry.seen.add(id);
    },
    sendStatus(s: StatusPayload) {
      if (entry.channel && entry.live) {
        entry.channel.send({ type: "broadcast", event: "status", payload: s }).catch(() => {});
      }
    },
    unsubscribe() {
      entry.handlers.delete(handlers);
      if (entry.handlers.size === 0) {
        if (entry.poll) clearInterval(entry.poll);
        if (entry.channel) getBrowserSupabase()?.removeChannel(entry.channel);
        registry.delete(conversationId);
      }
    },
  };
}

/** Subscribe to order changes (seller dashboard / buyer chat). */
export function subscribeOrders(onChange: (o: Order) => void) {
  const sb = getBrowserSupabase();
  if (!sb) return () => {};
  const ch = sb
    .channel(`orders-${Math.random().toString(36).slice(2)}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, (p) => {
      if ((p.new as Order)?.id) onChange(p.new as Order);
    })
    .subscribe();
  return () => {
    sb.removeChannel(ch);
  };
}

/** Subscribe to all new messages (seller dashboard unread badges). */
export function subscribeAllMessages(onInsert: (m: Message) => void) {
  const sb = getBrowserSupabase();
  if (!sb) return () => {};
  const ch = sb
    .channel(`msgs-${Math.random().toString(36).slice(2)}`)
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, (p) => onInsert(p.new as Message))
    .subscribe();
  return () => {
    sb.removeChannel(ch);
  };
}
