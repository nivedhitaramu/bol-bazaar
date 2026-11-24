import { Database } from "lucide-react";

/** Shown when Supabase env vars are missing, instead of crashing. */
export function SetupNotice({ detail }: { detail?: string }) {
  return (
    <div className="mx-auto max-w-lg px-4 py-16">
      <div className="card p-6 text-center">
        <Database className="mx-auto mb-3 size-10 text-saffron" />
        <h1 className="font-display text-xl font-bold text-maroon">Database not connected yet</h1>
        <p className="mt-2 text-sm text-muted">
          Set <code>NEXT_PUBLIC_SUPABASE_URL</code>, <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> and{" "}
          <code>SUPABASE_SERVICE_ROLE_KEY</code>, run the migration in <code>supabase/migrations</code>, then{" "}
          <code>npm run seed</code>. Check <a className="font-semibold text-maroon underline" href="/api/health">/api/health</a>.
        </p>
        {detail && <p className="mt-3 break-words rounded-lg bg-sand p-2 text-left font-mono text-xs">{detail}</p>}
      </div>
    </div>
  );
}
