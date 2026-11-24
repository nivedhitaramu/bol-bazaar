import Link from "next/link";
import { MapPin } from "lucide-react";
import { formatINR, listingFor } from "@/lib/types";
import type { ProductWithSeller } from "@/lib/data";

export function ProductCard({ p, langShort, byLabel }: { p: ProductWithSeller; langShort: string; byLabel: string }) {
  const l = listingFor(p.listing, langShort);
  return (
    <Link href={`/product/${p.id}`} className="card group flex flex-col overflow-hidden transition hover:-translate-y-0.5 hover:shadow-xl">
      <div className="relative aspect-square overflow-hidden bg-sand">
        {p.photo_url && (
          <img src={p.photo_url} alt={l?.title ?? p.name} loading="lazy" className="size-full object-cover transition duration-300 group-hover:scale-105" />
        )}
        <span className="absolute bottom-2 left-2 rounded-full bg-white/95 px-2.5 py-1 text-sm font-extrabold text-maroon shadow">
          {formatINR(p.price)}
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-1 p-3">
        <p className="line-clamp-2 font-bold leading-snug">{l?.title ?? p.name}</p>
        <p className="mt-auto flex items-center gap-1 text-xs text-muted">
          <MapPin className="size-3 shrink-0" />
          <span className="truncate">
            {byLabel} {p.seller.name}
            {p.seller.city ? ` · ${p.seller.city}` : ""}
          </span>
        </p>
      </div>
    </Link>
  );
}
