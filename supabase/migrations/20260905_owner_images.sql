-- Optional owner image for WhoOwnsTheDot.
-- Run this in the Supabase SQL Editor. Safe to re-run (all statements are idempotent).
-- Does NOT touch existing data.

-- 1. Optional image reference (Supabase Storage path, e.g. "staged/<uuid>.webp").
--    We store a server-generated storage PATH, never an untrusted arbitrary URL.
alter table public.dot_state
  add column if not exists image_url text;

alter table public.dot_history
  add column if not exists image_url text;

-- 2. Dedicated private-write / public-read bucket for owner images.
insert into storage.buckets (id, name, public)
  values ('dot-images', 'dot-images', true)
  on conflict (id) do nothing;

-- 3. Public read access (the dot image is displayed to every visitor).
--    No insert/update/delete policies for anon/authenticated, so all writes
--    must go through the service_role key (server routes only). Service_role
--    bypasses RLS, so no write policy is needed for the server.
drop policy if exists "public read dot images" on storage.objects;
create policy "public read dot images"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'dot-images');

-- 4. Staged-upload cleanup (run manually or on a schedule; NOT automatic).
--    Deletes staged images older than 7 days that were never promoted to an
--    owner (i.e. the payment failed / was cancelled / expired). Promoted
--    images are referenced by dot_state.image_url / dot_history.image_url and
--    are never touched by this statement.
--    delete from storage.objects
--      where bucket_id = 'dot-images'
--        and name like 'staged/%'
--        and created_at < now() - interval '7 days'
--        and name not in (select image_url from public.dot_state where image_url is not null)
--        and name not in (select image_url from public.dot_history where image_url is not null);
