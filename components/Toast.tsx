"use client";
import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Info, X } from "lucide-react";

type Kind = "info" | "error" | "success";
type ToastItem = { id: number; text: string; kind: Kind };
type Ctx = { toast: (text: string, kind?: Kind) => void };

const ToastCtx = createContext<Ctx>({ toast: () => {} });
let nextId = 1;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: number) => setItems((xs) => xs.filter((x) => x.id !== id)), []);

  const toast = useCallback(
    (text: string, kind: Kind = "info") => {
      const id = nextId++;
      setItems((xs) => {
        if (xs.some((x) => x.text === text)) return xs; // de-dupe
        return [...xs.slice(-2), { id, text, kind }];
      });
      setTimeout(() => dismiss(id), kind === "error" ? 6000 : 3500);
    },
    [dismiss]
  );

  const value = useMemo(() => ({ toast }), [toast]);

  return (
    <ToastCtx.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 z-[100] flex flex-col items-center gap-2 px-4"
        style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 16px)" }}
      >
        {items.map((it) => (
          <div
            key={it.id}
            role="status"
            className={`toast-in pointer-events-auto flex max-w-md items-center gap-2 rounded-2xl px-4 py-3 text-sm font-medium shadow-lg ${
              it.kind === "error"
                ? "bg-maroon text-white"
                : it.kind === "success"
                  ? "bg-leaf text-white"
                  : "bg-ink text-cream"
            }`}
          >
            {it.kind === "error" ? (
              <AlertTriangle className="size-4 shrink-0" aria-hidden />
            ) : it.kind === "success" ? (
              <CheckCircle2 className="size-4 shrink-0" aria-hidden />
            ) : (
              <Info className="size-4 shrink-0" aria-hidden />
            )}
            <span>{it.text}</span>
            <button
              onClick={() => dismiss(it.id)}
              aria-label="Dismiss"
              className="-mr-1 ml-1 rounded-full p-1 opacity-70 hover:opacity-100"
            >
              <X className="size-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export function useToast() {
  return useContext(ToastCtx);
}
