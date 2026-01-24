-- Security + reliability hygiene.
-- Fixes function search_path issues and makes service-only tables explicit under RLS.

-- Trigger helper: deterministic search_path.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Trigger helper: deterministic search_path.
create or replace function public.enforce_community_invite_use()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  invite_row public.community_invites%rowtype;
  usage_count integer;
begin
  select * into invite_row
  from public.community_invites
  where id = new.invite_id
  for update;

  if not found then
    raise exception 'invite not found';
  end if;

  if invite_row.revoked_at is not null then
    raise exception 'invite revoked';
  end if;

  if invite_row.expires_at is not null and invite_row.expires_at <= now() then
    raise exception 'invite expired';
  end if;

  if invite_row.max_uses is not null then
    select count(*) into usage_count
    from public.community_invite_uses
    where invite_id = new.invite_id;

    if usage_count >= invite_row.max_uses then
      raise exception 'invite max uses reached';
    end if;
  end if;

  return new;
end;
$$;

-- Deterministic claim-token hashing (do not depend on caller search_path).
create or replace function public.hash_purchase_claim_token(token text)
returns bytea
language sql
immutable
set search_path = public, extensions
as $$
  select extensions.digest(token, 'sha256');
$$;

-- RLS: service-only internal tables.
drop policy if exists purchase_claims_service_role_all on public.purchase_claims;
create policy purchase_claims_service_role_all
on public.purchase_claims
for all
to service_role
using (true)
with check (true);

drop policy if exists payment_provider_events_service_role_all on public.payment_provider_events;
create policy payment_provider_events_service_role_all
on public.payment_provider_events
for all
to service_role
using (true)
with check (true);

