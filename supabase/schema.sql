create extension if not exists pgcrypto;

create table if not exists public.dot_state (
  id uuid primary key default gen_random_uuid(),
  owner_name text not null,
  owner_url text,
  amount_cents integer not null default 0 check (amount_cents >= 0),
  dodo_payment_id text unique,
  dodo_checkout_session_id text unique,
  image_url text,
  updated_at timestamptz not null default now()
);

create table if not exists public.dot_history (
  id uuid primary key default gen_random_uuid(),
  owner_name text not null,
  owner_url text,
  amount_cents integer not null check (amount_cents > 0),
  dodo_payment_id text unique not null,
  dodo_checkout_session_id text unique,
  image_url text,
  created_at timestamptz not null default now()
);

alter table public.dot_state add column if not exists dodo_payment_id text;
alter table public.dot_state add column if not exists dodo_checkout_session_id text;
alter table public.dot_history add column if not exists dodo_payment_id text;
alter table public.dot_history add column if not exists dodo_checkout_session_id text;
create unique index if not exists dot_state_dodo_payment_id_idx on public.dot_state(dodo_payment_id) where dodo_payment_id is not null;
create unique index if not exists dot_state_dodo_checkout_session_id_idx on public.dot_state(dodo_checkout_session_id) where dodo_checkout_session_id is not null;
create unique index if not exists dot_history_dodo_payment_id_idx on public.dot_history(dodo_payment_id) where dodo_payment_id is not null;
create unique index if not exists dot_history_dodo_checkout_session_id_idx on public.dot_history(dodo_checkout_session_id) where dodo_checkout_session_id is not null;

insert into public.dot_state (id, owner_name, owner_url, amount_cents)
select gen_random_uuid(), 'nobody', null, 0
where not exists (select 1 from public.dot_state);

-- Keep exactly one state row. This constraint is enforced by the RPC below plus the seed above.
create or replace function public.claim_dot(
  p_owner_name text,
  p_owner_url text,
  p_amount_cents integer,
  p_dodo_payment_id text,
  p_dodo_checkout_session_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  state_id uuid;
  current_amount integer;
  existing_history_id uuid;
  claimed boolean := false;
begin
  if p_amount_cents <= 0 then
    return jsonb_build_object('claimed', false, 'reason', 'invalid_amount');
  end if;

  if p_dodo_payment_id is null or length(trim(p_dodo_payment_id)) = 0 then
    return jsonb_build_object('claimed', false, 'reason', 'missing_payment_id');
  end if;

  select id into existing_history_id
    from public.dot_history
    where dodo_payment_id = p_dodo_payment_id
    limit 1;

  if existing_history_id is not null then
    return jsonb_build_object('claimed', true, 'idempotent', true);
  end if;

  -- Serialize all ownership claims so concurrent webhooks cannot lower the price.
  -- Lock the single canonical state row by id (FOR UPDATE) so concurrent
  -- transactions queue here instead of racing.
  select id, amount_cents
    into state_id, current_amount
    from public.dot_state
    order by updated_at desc
    limit 1
    for update;

  if state_id is null then
    insert into public.dot_state (owner_name, owner_url, amount_cents, dodo_payment_id, dodo_checkout_session_id)
      values (p_owner_name, p_owner_url, p_amount_cents, p_dodo_payment_id, p_dodo_checkout_session_id)
      returning id, amount_cents into state_id, current_amount;

    insert into public.dot_history (owner_name, owner_url, amount_cents, dodo_payment_id, dodo_checkout_session_id)
      values (p_owner_name, p_owner_url, p_amount_cents, p_dodo_payment_id, p_dodo_checkout_session_id)
      on conflict (dodo_payment_id) do nothing;

    return jsonb_build_object('claimed', true, 'current_amount_cents', current_amount);
  end if;

  if p_amount_cents > current_amount then
    -- WHERE clause is required (Supabase safeupdate blocks unqualified UPDATEs)
    -- and pins the write to the exact row we locked above.
    update public.dot_state
      set owner_name = p_owner_name,
          owner_url = p_owner_url,
          amount_cents = p_amount_cents,
          dodo_payment_id = p_dodo_payment_id,
          dodo_checkout_session_id = p_dodo_checkout_session_id,
          updated_at = now()
      where id = state_id;

    insert into public.dot_history (owner_name, owner_url, amount_cents, dodo_payment_id, dodo_checkout_session_id)
      values (p_owner_name, p_owner_url, p_amount_cents, p_dodo_payment_id, p_dodo_checkout_session_id)
      on conflict (dodo_payment_id) do nothing;

    claimed := true;
    current_amount := p_amount_cents;
  end if;

  return jsonb_build_object(
    'claimed', claimed,
    'current_amount_cents', current_amount
  );
end;
$$;

revoke all on function public.claim_dot(text, text, integer, text, text) from public;
revoke all on function public.claim_dot(text, text, integer, text, text) from anon;
revoke all on function public.claim_dot(text, text, integer, text, text) from authenticated;
grant execute on function public.claim_dot(text, text, integer, text, text) to service_role;

alter table public.dot_state enable row level security;
alter table public.dot_history enable row level security;

alter table public.dot_state add column if not exists image_url text;
alter table public.dot_history add column if not exists image_url text;

-- Owner images live in Supabase Storage (binary never touches Postgres).
-- Bucket is public-read; writes go through the service_role key only
-- (server routes), so no anon/authenticated write policy is created.
insert into storage.buckets (id, name, public)
  values ('dot-images', 'dot-images', true)
  on conflict (id) do nothing;

drop policy if exists "public read dot images" on storage.objects;
create policy "public read dot images"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'dot-images');

grant select on public.dot_state to anon, authenticated, service_role;
grant select on public.dot_history to anon, authenticated, service_role;

create policy "public can read dot state"
on public.dot_state for select
to anon, authenticated
using (true);

create policy "public can read dot history"
on public.dot_history for select
to anon, authenticated
using (true);


create or replace function public.dot_stats()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'total_raised_cents', coalesce(sum(amount_cents), 0),
    'owner_count', count(*)
  ) from public.dot_history;
$$;

revoke all on function public.dot_stats() from public;
grant execute on function public.dot_stats() to service_role;

-- Visitor presence + lifetime visitor count.
-- Anonymous IDs are server-issued (set in a cookie) so they never reach the client JS.

create table if not exists public.dot_presence (
  visitor_id uuid primary key,
  last_seen_at timestamptz not null default now()
);
create index if not exists dot_presence_last_seen_at_idx on public.dot_presence (last_seen_at);

create table if not exists public.dot_visitors (
  visitor_id uuid primary key,
  first_seen_at timestamptz not null default now()
);

alter table public.dot_presence enable row level security;
alter table public.dot_visitors enable row level security;

-- These tables are server-only. No anon/authenticated policies -> RLS denies them by default.
revoke all on public.dot_presence from anon, authenticated;
revoke all on public.dot_visitors from anon, authenticated;

-- Single round-trip: upsert presence, register visitor on first sight, return counts.
-- expire_seconds defaults to 45 so a caller can tune it.
create or replace function public.heartbeat(
  p_visitor_id uuid,
  p_expire_seconds integer default 45
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  watching_count integer;
  lifetime_count integer;
  expire_interval interval := make_interval(secs => greatest(p_expire_seconds, 5));
begin
  insert into public.dot_presence (visitor_id, last_seen_at)
    values (p_visitor_id, now())
    on conflict (visitor_id) do update set last_seen_at = excluded.last_seen_at;

  insert into public.dot_visitors (visitor_id)
    values (p_visitor_id)
    on conflict (visitor_id) do nothing;

  delete from public.dot_presence
    where last_seen_at < now() - expire_interval;

  select count(*) into watching_count from public.dot_presence;
  select count(*) into lifetime_count from public.dot_visitors;

  return jsonb_build_object(
    'watching', watching_count,
    'visitors_since_launch', lifetime_count
  );
end;
$$;

revoke all on function public.heartbeat(uuid, integer) from public;
grant execute on function public.heartbeat(uuid, integer) to service_role;
