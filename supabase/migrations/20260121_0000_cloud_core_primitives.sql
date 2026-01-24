-- Core cloud primitives (communities + access + monetization).
-- These are the minimal tables needed for a reproducible, cloud-canonical MVP schema.

-- Communities
create table if not exists public.communities (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  owner_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  description text,
  avatar_url text,
  visibility text not null default 'private' check (visibility in ('public', 'unlisted', 'private')),
  updated_at timestamptz not null default now(),
  banner_url text
);

-- Community memberships (roles)
create table if not exists public.community_memberships (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null,
  created_at timestamptz not null default now(),
  unique (community_id, user_id)
);

create index if not exists community_memberships_community_id_idx on public.community_memberships(community_id);
create index if not exists community_memberships_user_id_idx on public.community_memberships(user_id);

-- Entitlements (canonical access)
create table if not exists public.entitlements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  community_id uuid not null references public.communities(id) on delete cascade,
  role text not null,
  tier_id text,
  source text not null,
  source_ref text,
  status text not null,
  starts_at timestamptz not null default now(),
  ends_at timestamptz
);

create index if not exists entitlements_user_id_idx on public.entitlements(user_id);
create index if not exists entitlements_community_id_idx on public.entitlements(community_id);
create unique index if not exists uq_entitlements_one_active_per_user_community
  on public.entitlements(user_id, community_id)
  where status = 'active';

-- Plans (provider-agnostic)
create table if not exists public.plans (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities(id) on delete cascade,
  name text not null,
  description text,
  amount_base_units numeric not null check (amount_base_units > 0),
  currency text not null check (length(currency) between 3 and 16),
  currency_decimals smallint not null check (currency_decimals between 0 and 36),
  billing_period text not null check (billing_period in ('one_time', 'monthly', 'yearly')),
  visibility text not null default 'public' check (visibility in ('public', 'unlisted', 'private')),
  is_active boolean not null default true,
  role text not null default 'member' check (role in ('member', 'mod', 'admin', 'owner')),
  tier_id text,
  stripe_price_id text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_plans_community_id on public.plans(community_id);
create index if not exists idx_plans_visibility_active on public.plans(visibility, is_active);
create unique index if not exists uq_plans_stripe_price_id
  on public.plans(stripe_price_id)
  where stripe_price_id is not null;

-- Invites (optional; used for free joins / tracking)
create table if not exists public.community_invites (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities(id) on delete cascade,
  code text not null unique,
  role text not null default 'member',
  tier_id text,
  max_uses integer,
  expires_at timestamptz,
  created_by uuid not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  plan_id uuid references public.plans(id)
);

create index if not exists community_invites_community_id_idx on public.community_invites(community_id);
create index if not exists community_invites_code_idx on public.community_invites(code);

create table if not exists public.community_invite_uses (
  id uuid primary key default gen_random_uuid(),
  invite_id uuid not null references public.community_invites(id) on delete cascade,
  user_id uuid not null,
  used_at timestamptz not null default now(),
  unique (invite_id, user_id)
);

create index if not exists community_invite_uses_invite_id_idx on public.community_invite_uses(invite_id);
create index if not exists community_invite_uses_used_at_idx on public.community_invite_uses(used_at);

-- Community resources (curated memory)
create table if not exists public.community_resources (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities(id) on delete cascade,
  type text not null,
  title text not null,
  body_md text,
  url text,
  file_key text,
  pinned boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists community_resources_community_id_idx on public.community_resources(community_id);

-- Payments primitives (provider-agnostic)
create table if not exists public.payment_intents (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities(id) on delete cascade,
  plan_id uuid not null references public.plans(id) on delete restrict,
  user_id uuid,
  provider text not null default 'stripe',
  status text not null default 'created' check (status in ('created','pending','succeeded','failed','cancelled')),
  amount_base_units numeric not null check (amount_base_units > 0),
  currency text not null check (length(currency) between 3 and 16),
  currency_decimals smallint not null check (currency_decimals between 0 and 36),
  provider_session_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_payment_intents_community_created_at on public.payment_intents(community_id, created_at desc);
create index if not exists idx_payment_intents_user_created_at on public.payment_intents(user_id, created_at desc);
create unique index if not exists uq_payment_intents_provider_session
  on public.payment_intents(provider, provider_session_id)
  where provider_session_id is not null;

create table if not exists public.payment_receipts (
  id uuid primary key default gen_random_uuid(),
  payment_intent_id uuid not null references public.payment_intents(id) on delete cascade,
  provider text not null,
  provider_session_id text not null,
  provider_payment_intent_id text,
  provider_subscription_id text,
  provider_customer_id text,
  checkout_email text,
  amount_base_units numeric not null check (amount_base_units > 0),
  currency text not null check (length(currency) between 3 and 16),
  currency_decimals smallint not null check (currency_decimals between 0 and 36),
  status text not null default 'pending' check (status in ('pending','confirmed','failed')),
  paid_at timestamptz,
  raw_json jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_payment_receipts_intent_created_at on public.payment_receipts(payment_intent_id, created_at desc);
create unique index if not exists uq_payment_receipts_provider_session on public.payment_receipts(provider, provider_session_id);
create unique index if not exists uq_payment_receipts_provider_subscription
  on public.payment_receipts(provider, provider_subscription_id)
  where provider_subscription_id is not null;

create table if not exists public.provider_subscriptions (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'stripe',
  provider_subscription_id text not null,
  provider_customer_id text,
  payment_intent_id uuid references public.payment_intents(id) on delete set null,
  community_id uuid not null references public.communities(id) on delete cascade,
  plan_id uuid not null references public.plans(id) on delete restrict,
  user_id uuid,
  status text not null,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean,
  raw_json jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, provider_subscription_id)
);

create index if not exists idx_provider_subscriptions_community on public.provider_subscriptions(community_id, updated_at desc);
create index if not exists idx_provider_subscriptions_user on public.provider_subscriptions(user_id, updated_at desc);

create table if not exists public.purchase_claims (
  id uuid primary key default gen_random_uuid(),
  payment_intent_id uuid not null references public.payment_intents(id) on delete cascade,
  token_hash bytea not null unique,
  token_prefix text not null,
  status text not null default 'issued' check (status in ('issued','redeemed','expired','revoked')),
  expires_at timestamptz not null,
  issued_to_email text,
  redeemed_by_user_id uuid,
  redeemed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_purchase_claims_status_expires on public.purchase_claims(status, expires_at);
create unique index if not exists uq_purchase_claims_one_issued_per_intent
  on public.purchase_claims(payment_intent_id)
  where status = 'issued';

create table if not exists public.payment_provider_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  provider_event_id text not null,
  event_type text,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  raw_json jsonb not null,
  unique (provider, provider_event_id)
);

create index if not exists idx_payment_provider_events_received_at on public.payment_provider_events(received_at desc);

-- Helper functions (entitlements are canonical access control).
create or replace function public.has_active_entitlement(p_community_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.entitlements e
    where e.community_id = p_community_id
      and e.user_id = auth.uid()
      and e.status = 'active'
      and e.starts_at <= now()
      and (e.ends_at is null or e.ends_at > now())
  );
$$;

create or replace function public.has_active_entitlement_role(p_community_id uuid, p_roles text[])
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.entitlements e
    where e.community_id = p_community_id
      and e.user_id = auth.uid()
      and e.role = any (p_roles)
      and e.status = 'active'
      and e.starts_at <= now()
      and (e.ends_at is null or e.ends_at > now())
  );
$$;

create or replace function public.is_community_member(p_community_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select public.has_active_entitlement(p_community_id);
$$;

create or replace function public.is_community_owner(p_community_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists(
    select 1
    from public.communities c
    where c.id = p_community_id
      and c.owner_id = auth.uid()
  );
$$;

-- RLS
alter table public.communities enable row level security;
alter table public.community_memberships enable row level security;
alter table public.entitlements enable row level security;
alter table public.plans enable row level security;
alter table public.community_invites enable row level security;
alter table public.community_invite_uses enable row level security;
alter table public.community_resources enable row level security;
alter table public.payment_intents enable row level security;
alter table public.payment_receipts enable row level security;
alter table public.provider_subscriptions enable row level security;
alter table public.purchase_claims enable row level security;
alter table public.payment_provider_events enable row level security;

-- Communities policies
drop policy if exists communities_select_public on public.communities;
create policy communities_select_public
on public.communities
for select
to authenticated
using (visibility = 'public');

drop policy if exists communities_select_owner on public.communities;
create policy communities_select_owner
on public.communities
for select
to authenticated
using (owner_id = auth.uid());

drop policy if exists communities_select_member on public.communities;
create policy communities_select_member
on public.communities
for select
to authenticated
using (is_community_member(id));

drop policy if exists communities_insert_owner on public.communities;
create policy communities_insert_owner
on public.communities
for insert
to authenticated
with check (owner_id = auth.uid());

drop policy if exists communities_update_owner on public.communities;
create policy communities_update_owner
on public.communities
for update
to authenticated
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

drop policy if exists communities_delete_owner on public.communities;
create policy communities_delete_owner
on public.communities
for delete
to authenticated
using (owner_id = auth.uid());

-- Memberships policies (owners manage membership)
drop policy if exists memberships_select_self_or_owner on public.community_memberships;
create policy memberships_select_self_or_owner
on public.community_memberships
for select
to authenticated
using ((user_id = auth.uid()) or is_community_owner(community_id));

drop policy if exists memberships_insert_owner on public.community_memberships;
create policy memberships_insert_owner
on public.community_memberships
for insert
to authenticated
with check (is_community_owner(community_id));

drop policy if exists memberships_update_owner on public.community_memberships;
create policy memberships_update_owner
on public.community_memberships
for update
to authenticated
using (is_community_owner(community_id))
with check (is_community_owner(community_id));

drop policy if exists memberships_delete_owner on public.community_memberships;
create policy memberships_delete_owner
on public.community_memberships
for delete
to authenticated
using (is_community_owner(community_id));

-- Entitlements policies
drop policy if exists entitlements_select_self_or_owner on public.entitlements;
create policy entitlements_select_self_or_owner
on public.entitlements
for select
to authenticated
using (
  (user_id = auth.uid())
  or exists (
    select 1
    from public.communities c
    where c.id = entitlements.community_id
      and c.owner_id = auth.uid()
  )
);

drop policy if exists entitlements_write_owner on public.entitlements;
create policy entitlements_write_owner
on public.entitlements
for insert
to authenticated
with check (
  exists (
    select 1
    from public.communities c
    where c.id = entitlements.community_id
      and c.owner_id = auth.uid()
  )
);

drop policy if exists entitlements_update_owner on public.entitlements;
create policy entitlements_update_owner
on public.entitlements
for update
to authenticated
using (
  exists (
    select 1
    from public.communities c
    where c.id = entitlements.community_id
      and c.owner_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.communities c
    where c.id = entitlements.community_id
      and c.owner_id = auth.uid()
  )
);

drop policy if exists entitlements_delete_owner on public.entitlements;
create policy entitlements_delete_owner
on public.entitlements
for delete
to authenticated
using (
  exists (
    select 1
    from public.communities c
    where c.id = entitlements.community_id
      and c.owner_id = auth.uid()
  )
);

-- Plans policies
drop policy if exists plans_select_public on public.plans;
create policy plans_select_public
on public.plans
for select
to authenticated
using (visibility = 'public' and is_active = true);

drop policy if exists plans_select_owner on public.plans;
create policy plans_select_owner
on public.plans
for select
to authenticated
using (is_community_owner(community_id));

drop policy if exists plans_write_owner on public.plans;
create policy plans_write_owner
on public.plans
for insert
to authenticated
with check (is_community_owner(community_id));

drop policy if exists plans_update_owner on public.plans;
create policy plans_update_owner
on public.plans
for update
to authenticated
using (is_community_owner(community_id))
with check (is_community_owner(community_id));

drop policy if exists plans_delete_owner on public.plans;
create policy plans_delete_owner
on public.plans
for delete
to authenticated
using (is_community_owner(community_id));

-- Community resources policies (entitlements-gated; role-aware)
drop policy if exists community_resources_select_member on public.community_resources;
create policy community_resources_select_member
on public.community_resources
for select
to authenticated
using (public.has_active_entitlement(community_id));

drop policy if exists community_resources_write_admin on public.community_resources;
create policy community_resources_write_admin
on public.community_resources
for insert
to authenticated
with check (
  public.has_active_entitlement_role(community_id, array['owner','admin','mod'])
);

drop policy if exists community_resources_update_admin on public.community_resources;
create policy community_resources_update_admin
on public.community_resources
for update
to authenticated
using (
  public.has_active_entitlement_role(community_id, array['owner','admin','mod'])
)
with check (
  public.has_active_entitlement_role(community_id, array['owner','admin','mod'])
);

drop policy if exists community_resources_delete_admin on public.community_resources;
create policy community_resources_delete_admin
on public.community_resources
for delete
to authenticated
using (
  public.has_active_entitlement_role(community_id, array['owner','admin','mod'])
);

-- Invites policies (owner-only)
drop policy if exists community_invites_select_owner on public.community_invites;
create policy community_invites_select_owner
on public.community_invites
for select
to authenticated
using (
  exists (
    select 1
    from public.communities c
    where c.id = community_invites.community_id
      and c.owner_id = auth.uid()
  )
);

drop policy if exists community_invites_insert_owner on public.community_invites;
create policy community_invites_insert_owner
on public.community_invites
for insert
to authenticated
with check (
  exists (
    select 1
    from public.communities c
    where c.id = community_invites.community_id
      and c.owner_id = auth.uid()
  )
);

drop policy if exists community_invites_update_owner on public.community_invites;
create policy community_invites_update_owner
on public.community_invites
for update
to authenticated
using (
  exists (
    select 1
    from public.communities c
    where c.id = community_invites.community_id
      and c.owner_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.communities c
    where c.id = community_invites.community_id
      and c.owner_id = auth.uid()
  )
);

drop policy if exists community_invites_delete_owner on public.community_invites;
create policy community_invites_delete_owner
on public.community_invites
for delete
to authenticated
using (
  exists (
    select 1
    from public.communities c
    where c.id = community_invites.community_id
      and c.owner_id = auth.uid()
  )
);

-- Invite uses are readable by the community owner (writes happen via server-side redemption).
drop policy if exists community_invite_uses_select_owner on public.community_invite_uses;
create policy community_invite_uses_select_owner
on public.community_invite_uses
for select
to authenticated
using (
  exists (
    select 1
    from public.community_invites i
    join public.communities c on c.id = i.community_id
    where i.id = community_invite_uses.invite_id
      and c.owner_id = auth.uid()
  )
);

-- Payments: user can read their own intents/receipts/subscriptions.
drop policy if exists payment_intents_select_self on public.payment_intents;
create policy payment_intents_select_self
on public.payment_intents
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists payment_receipts_select_self on public.payment_receipts;
create policy payment_receipts_select_self
on public.payment_receipts
for select
to authenticated
using (
  exists (
    select 1
    from public.payment_intents pi
    where pi.id = payment_receipts.payment_intent_id
      and pi.user_id = auth.uid()
  )
);

drop policy if exists provider_subscriptions_select_self on public.provider_subscriptions;
create policy provider_subscriptions_select_self
on public.provider_subscriptions
for select
to authenticated
using (user_id = auth.uid());
