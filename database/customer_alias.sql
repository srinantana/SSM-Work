-- SSM Work · customer name aliases
-- Run once in the Supabase project used by ssmwork.vercel.app (Dashboard → SQL Editor → New query → Run).
-- Admin page → "เทียบชื่อลูกค้ากับ Master" saves every confirmed mapping (old name → RAK_Master_Customer_List.Customer_name_short)
-- here, so names in the Google Sheet ใบขอคน — which the website cannot edit — are shown with the master short name too.
-- alias_key = the old name lower-cased with spaces and punctuation removed.
-- Only the hub middleware (service key) reads and writes this table: RLS is on and there are no policies.

create table if not exists public.customer_alias (
  alias_key   text primary key,
  alias       text not null,
  short       text not null,
  updated_by  text,
  updated_at  timestamptz not null default now()
);

alter table public.customer_alias enable row level security;
