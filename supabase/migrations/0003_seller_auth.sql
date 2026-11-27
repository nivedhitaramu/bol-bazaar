-- Bol Bazaar — prototype seller login (private link + 4-digit PIN). Run after 0002. Safe to re-run.
-- Secrets live in their own table: `sellers` is publicly readable (storefronts), this one is not.
create table if not exists public.seller_auth (
  seller_id uuid primary key references public.sellers(id) on delete cascade,
  key_hash text unique,          -- SHA-256 of the private link key (the key itself is never stored)
  pin_hash text,                 -- scrypt "salt:hash" of the 4-digit PIN
  failed integer not null default 0,
  locked_until timestamptz,      -- 5 wrong PINs → locked for 5 minutes
  updated_at timestamptz not null default now()
);

alter table public.seller_auth enable row level security;
-- No policies on purpose: only the server (secret / service-role key) can read or write.
revoke all on public.seller_auth from anon, authenticated;
grant all on public.seller_auth to service_role;
