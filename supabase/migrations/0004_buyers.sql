-- Bol Bazaar — lightweight buyer identity (no login, no PIN). Run after 0003. Safe to re-run.
-- A buyer is just a name + language + a private "Save my chats" link (only its hash is stored).
create table if not exists public.buyers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  language text not null default 'hi-IN',
  key_hash text unique,          -- SHA-256 of the private link key (the key itself is never stored)
  created_at timestamptz not null default now()
);

alter table public.buyers enable row level security;
-- No policies on purpose: only the server (secret / service-role key) can read or write.
revoke all on public.buyers from anon, authenticated;
grant all on public.buyers to service_role;

-- Which buyer a conversation (and its orders) belongs to.
alter table public.conversations add column if not exists buyer_id uuid references public.buyers(id) on delete set null;
create index if not exists conversations_buyer_idx on public.conversations (buyer_id, created_at desc);
