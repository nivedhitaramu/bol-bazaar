import Link from "next/link";
import { Home, SearchX } from "lucide-react";

export default function NotFound() {
  return (
    <main className="grid min-h-dvh place-items-center px-4">
      <div className="card max-w-sm p-8 text-center">
        <SearchX className="mx-auto mb-3 size-12 text-saffron" />
        <h1 className="font-display text-2xl font-bold text-maroon">404</h1>
        <Link href="/" className="btn btn-primary mt-5 w-full">
          <Home className="size-5" /> Bol Bazaar
        </Link>
      </div>
    </main>
  );
}
