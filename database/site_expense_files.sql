-- Site Expense: private storage bucket for related documents and Actual receipts (Dew, 20 Nov 2026).
-- Only the SSM Work server (service role) reads and writes it, through /api/site-expense/file. Safe to run more than once.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('site-expense', 'site-expense', false, 5242880, array['image/jpeg', 'application/pdf'])
on conflict (id) do nothing;
