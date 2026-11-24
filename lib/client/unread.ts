"use client";
const key = (id: string) => `bb_seen_${id}`;

export function lastSeen(conversationId: string): string {
  try {
    return localStorage.getItem(key(conversationId)) ?? "1970-01-01T00:00:00Z";
  } catch {
    return "1970-01-01T00:00:00Z";
  }
}

export function markRead(conversationId: string) {
  try {
    localStorage.setItem(key(conversationId), new Date().toISOString());
  } catch {}
}
