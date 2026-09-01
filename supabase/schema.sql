create extension if not exists pgcrypto;

create table if not exists public.dot_state (
  id uuid primary key default gen_random_uuid(),
  owner_name text not null,
  owner_url text,
  amount_cents integer not null default 0 check (amount_cents >= 0),
  dodo_payment_id text unique,
  dodo_checkout_session_id text unique,
  updated_at timestamptz not null default now()
);

create table if not exists public.dot_history (
  id uuid primary key default gen_random_uuid(),
  owner_name text not null,
  owner_url text,
  amount_cents integer not null check (amount_cents > 0),
  dodo_payment_id text unique not null,
  dodo_checkout_session_id text unique,
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
  select amount_cents
    into current_amount
    from public.dot_state
    order by updated_at desc
    limit 1
    for update;

  if p_amount_cents > current_amount then
    update public.dot_state
      set owner_name = p_owner_name,
          owner_url = p_owner_url,
          amount_cents = p_amount_cents,
          dodo_payment_id = p_dodo_payment_id,
          dodo_checkout_session_id = p_dodo_checkout_session_id,
          updated_at = now();

    insert into public.dot_history (owner_name, owner_url, amount_cents, dodo_payment_id, dodo_checkout_session_id)
      values (p_owner_name, p_owner_url, p_amount_cents, p_dodo_payment_id, p_dodo_checkout_session_id)
      on conflict (dodo_payment_id) do nothing;

    claimed := true;
  end if;

  return jsonb_build_object(
    'claimed', claimed,
    'current_amount_cents', (select amount_cents from public.dot_state limit 1)
  );
end;
$$;

revoke all on function public.claim_dot(text, text, integer, text, text) from public;
revoke all on function public.claim_dot(text, text, integer, text, text) from anon;
revoke all on function public.claim_dot(text, text, integer, text, text) from authenticated;
grant execute on function public.claim_dot(text, text, integer, text, text) to service_role;

alter table public.dot_state enable row level security;
alter table public.dot_history enable row level security;

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
