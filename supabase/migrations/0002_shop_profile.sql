-- Bol Bazaar — "Speak your shop online" storefront profile.
-- Run after 0001_init.sql in the Supabase SQL Editor. Safe to re-run.
alter table public.sellers add column if not exists shop jsonb;
