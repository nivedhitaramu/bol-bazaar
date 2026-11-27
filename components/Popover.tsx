"use client";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { Portal } from "./Portal";

const DESKTOP_MIN = 640; // Tailwind `sm`
const MARGIN = 12;

/**
 * Responsive overlay:
 *  - phones (< 640 px): bottom sheet over a dimmed backdrop
 *  - desktop: dropdown anchored under its trigger, clamped inside the viewport
 * Always rendered in a portal; closes on Escape, outside click and the ✕ button; traps nothing,
 * but moves focus in on open and back to the trigger on close.
 */
export function Popover({
  open,
  onClose,
  anchorRef,
  title,
  icon,
  width = 380,
  children,
}: {
  open: boolean;
  onClose: () => void;
  anchorRef: React.RefObject<HTMLElement | null>;
  title: string;
  icon?: React.ReactNode;
  width?: number;
  children: React.ReactNode;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const [desktop, setDesktop] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; maxHeight: number } | null>(null);

  const place = useCallback(() => {
    const isDesktop = window.innerWidth >= DESKTOP_MIN;
    setDesktop(isDesktop);
    const a = anchorRef.current?.getBoundingClientRect();
    if (!isDesktop || !a) return setPos(null);
    const w = Math.min(width, window.innerWidth - MARGIN * 2);
    // Right-align with the trigger, then clamp horizontally into the viewport.
    const left = Math.min(Math.max(MARGIN, a.right - w), window.innerWidth - w - MARGIN);
    let top = a.bottom + 8;
    const maxHeight = Math.max(240, window.innerHeight - top - MARGIN);
    // Not enough room below (trigger low on the page) → open above instead.
    if (window.innerHeight - top < 320 && a.top > window.innerHeight / 2) top = Math.max(MARGIN, a.top - 8 - Math.min(maxHeight, 480));
    setPos({ top, left, maxHeight: Math.min(maxHeight, window.innerHeight - top - MARGIN) });
  }, [anchorRef, width]);

  useLayoutEffect(() => {
    if (open) place();
  }, [open, place]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    const trigger = anchorRef.current;
    const t = setTimeout(() => panel.current?.querySelector<HTMLElement>("[aria-checked='true'], button, [href], input")?.focus(), 30);
    return () => {
      clearTimeout(t);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
      trigger?.focus();
    };
  }, [open, onClose, place, anchorRef]);

  if (!open) return null;

  const header = (
    <div className="mb-4 flex items-center justify-between gap-3">
      <h2 className="flex items-center gap-2 font-display text-xl font-bold text-maroon">
        {icon} {title}
      </h2>
      <button onClick={onClose} className="grid size-14 shrink-0 place-items-center rounded-full hover:bg-sand" aria-label="Close">
        <X className="size-5" />
      </button>
    </div>
  );

  return (
    <Portal>
      {desktop && pos ? (
        <div className="fixed inset-0 z-[80]" onMouseDown={onClose}>
          <div
            ref={panel}
            role="dialog"
            aria-modal="true"
            aria-label={title}
            onMouseDown={(e) => e.stopPropagation()}
            className="toast-in fixed overflow-y-auto rounded-3xl border border-sand bg-cream p-5 shadow-2xl"
            style={{ top: pos.top, left: pos.left, width: Math.min(width, window.innerWidth - MARGIN * 2), maxHeight: pos.maxHeight }}
          >
            {header}
            {children}
          </div>
        </div>
      ) : (
        <div className="fixed inset-0 z-[80] flex items-end justify-center bg-ink/50" onMouseDown={onClose}>
          <div
            ref={panel}
            role="dialog"
            aria-modal="true"
            aria-label={title}
            onMouseDown={(e) => e.stopPropagation()}
            className="toast-in w-full max-w-md overflow-y-auto rounded-t-3xl bg-cream p-5 shadow-2xl"
            style={{
              maxHeight: "calc(100dvh - env(safe-area-inset-top, 0px) - 24px)",
              paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 20px)",
            }}
          >
            <div className="mx-auto -mt-2 mb-3 h-1.5 w-12 rounded-full bg-sand" aria-hidden />
            {header}
            {children}
          </div>
        </div>
      )}
    </Portal>
  );
}
