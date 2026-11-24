-- Bol Bazaar — initial schema
-- Run in Supabase SQL Editor (or `supabase db push`). Safe to re-run.

create extension if not exists pgcrypto;

-- ───────────────────────── Tables ─────────────────────────
create table if not exists public.sellers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  language text not null default 'en-IN',
  city text,
  state text,
  craft text,
  gender text not null default 'female' check (gender in ('female', 'male')),
  voice_intro_url text,
  voice_intro_transcript text,
  created_at timestamptz not null default now()
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.sellers(id) on delete cascade,
  name text not null,
  category text,
  material text,
  craft_story text,
  price integer check (price is null or price >= 0),
  quantity integer check (quantity is null or quantity >= 0),
  size_options text[] not null default '{}',
  photo_url text,
  listing jsonb not null default '{}'::jsonb,
  status text not null default 'draft' check (status in ('draft', 'published')),
  created_at timestamptz not null default now()
);
create index if not exists products_seller_idx on public.products (seller_id);
create index if not exists products_status_idx on public.products (status, created_at desc);

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references public.products(id) on delete cascade,
  seller_id uuid not null references public.sellers(id) on delete cascade,
  buyer_name text not null,
  buyer_language text not null default 'hi-IN',
  created_at timestamptz not null default now()
);
create index if not exists conversations_seller_idx on public.conversations (seller_id, created_at desc);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender text not null check (sender in ('buyer', 'seller')),
  original_text text not null,
  original_language text not null,
  translated_text text,
  translated_language text,
  audio_url text,
  created_at timestamptz not null default now()
);
create index if not exists messages_conv_idx on public.messages (conversation_id, created_at);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  conversation_id uuid references public.conversations(id) on delete set null,
  buyer_name text not null,
  quantity integer not null default 1 check (quantity > 0),
  status text not null default 'placed' check (status in ('placed', 'confirmed', 'shipped', 'delivered')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists orders_product_idx on public.orders (product_id, created_at desc);

create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists orders_touch on public.orders;
create trigger orders_touch before update on public.orders
  for each row execute function public.touch_updated_at();

-- ───────────────────────── RLS ─────────────────────────
-- Public hackathon demo: anyone may READ; all WRITES go through Next.js
-- server routes using the secret/service-role key (which bypasses RLS).
alter table public.sellers enable row level security;
alter table public.products enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.orders enable row level security;

drop policy if exists "public read sellers" on public.sellers;
create policy "public read sellers" on public.sellers for select using (true);

drop policy if exists "public read published products" on public.products;
create policy "public read published products" on public.products for select using (status = 'published');

drop policy if exists "public read conversations" on public.conversations;
create policy "public read conversations" on public.conversations for select using (true);

drop policy if exists "public read messages" on public.messages;
create policy "public read messages" on public.messages for select using (true);

drop policy if exists "public read orders" on public.orders;
create policy "public read orders" on public.orders for select using (true);

grant usage on schema public to anon, authenticated;
grant select on public.sellers, public.products, public.conversations, public.messages, public.orders
  to anon, authenticated;
grant all on public.sellers, public.products, public.conversations, public.messages, public.orders
  to service_role;

-- ───────────────────────── Realtime ─────────────────────────
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'messages'
  ) then
    alter publication supabase_realtime add table public.messages;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'orders'
  ) then
    alter publication supabase_realtime add table public.orders;
  end if;
end $$;

-- ───────────────────────── Storage ─────────────────────────
insert into storage.buckets (id, name, public)
values
  ('product-photos', 'product-photos', true),
  ('voice-intros', 'voice-intros', true),
  ('chat-audio', 'chat-audio', true)
on conflict (id) do update set public = excluded.public;
