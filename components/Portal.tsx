"use client";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

/**
 * Render children into <body>. Overlays MUST use this: an ancestor with `backdrop-filter`,
 * `transform` or `filter` (e.g. the sticky blurred header) becomes the containing block for
 * `position: fixed`, which squeezes a "full-screen" modal into that ancestor's box.
 */
export function Portal({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted ? createPortal(children, document.body) : null;
}
