# Arx Foundations Audit (MVP Gate)

This is a lightweight, repeatable checklist to prevent **security drift** and **primitive drift** as Arx evolves.

Run these SQL snippets in the Supabase SQL Editor (or via `psql`) against the target database.

## 1) RLS + Policy Sanity

### 1.1 Confirm RLS is enabled on core tables

```sql
select
  n.nspname as schema,
  c.relname as table,
  c.relrowsecurity as rls_enabled,
  c.relforcerowsecurity as rls_forced
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
  and c.relname in (
    'communities',
    'community_memberships',
    'entitlements',
    'threads',
    'messages',
    'community_resources',
    'plans',
    'payment_intents',
    'payment_receipts',
    'provider_subscriptions',
    'purchase_claims',
    'payment_provider_events',
    'payment_ledger_entries',
    'personal_memory_items',
    'user_memory_settings',
    'user_model_settings',
    'user_ai_history_usage'
  )
order by c.relname asc;
```

### 1.2 List policies for the most sensitive tables

```sql
select
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
from pg_policies
where schemaname = 'public'
  and tablename in (
    'communities',
    'community_memberships',
    'entitlements',
    'threads',
    'messages',
    'community_resources',
    'payment_intents',
    'payment_receipts',
    'provider_subscriptions',
    'purchase_claims',
    'payment_provider_events',
    'payment_ledger_entries',
    'personal_memory_items'
  )
order by tablename, policyname;
```

## 2) SECURITY DEFINER + “Row Security Off” Drift

Any function that is `SECURITY DEFINER` and/or sets `row_security = off` is effectively part of your auth system. Audit them routinely.

### 2.1 List all SECURITY DEFINER functions in `public`

```sql
select
  n.nspname as schema,
  p.proname as function,
  pg_get_function_identity_arguments(p.oid) as args,
  p.prosecdef as security_definer,
  r.rolname as owner_role
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
join pg_roles r on r.oid = p.proowner
where n.nspname = 'public'
  and p.prosecdef is true
order by p.proname, args;
```

### 2.2 Inspect grants on SECURITY DEFINER functions (look for `anon`/`public`)

```sql
select
  routine_schema,
  routine_name,
  specific_name,
  privilege_type,
  grantee
from information_schema.routine_privileges
where routine_schema = 'public'
  and privilege_type = 'EXECUTE'
order by routine_name, grantee;
```

**Gate:** no sensitive functions should be executable by `anon`, and “server-only” RPCs should be executable only by `service_role`.

### 2.3 Gate: SECURITY DEFINER functions executable by `anon` (should be zero rows)

```sql
select
  p.proname as function,
  pg_get_function_identity_arguments(p.oid) as args
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.prosecdef is true
  and has_function_privilege('anon', p.oid, 'EXECUTE')
order by p.proname, args;
```

### 2.4 Grep for “row_security = off” in function definitions

```sql
select
  n.nspname as schema,
  p.proname as function,
  pg_get_function_identity_arguments(p.oid) as args,
  position('row_security' in lower(pg_get_functiondef(p.oid))) > 0 as mentions_row_security
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
order by p.proname, args;
```

Then open any flagged function definitions and confirm they:
- validate `auth.uid()` when user-scoped
- validate entitlement + role for community-scoped admin actions
- fail closed on missing/invalid inputs

## 3) Canonical Access Invariants (Entitlements)

### 3.1 Ensure one entitlement row per (user, community)

```sql
select
  user_id,
  community_id,
  count(*) as rows
from public.entitlements
group by 1, 2
having count(*) > 1
order by rows desc;
```

### 3.2 Show “currently entitled” definition matches application semantics

```sql
select
  count(*) as entitled_rows
from public.entitlements e
where e.starts_at <= now()
  and (e.ends_at is null or e.ends_at > now());
```

## 4) Pay‑First Join: “No paid but can’t access”

### 4.1 Succeeded payment intents without an issued (or redeemed) claim

```sql
select
  pi.id as payment_intent_id,
  pi.community_id,
  pi.user_id,
  pi.status,
  pi.created_at
from public.payment_intents pi
left join public.purchase_claims pc
  on pc.payment_intent_id = pi.id
where pi.status = 'succeeded'
group by pi.id
having count(pc.id) = 0
order by pi.created_at desc
limit 50;
```

### 4.2 Issued claims nearing expiration (operational watchlist)

```sql
select
  pc.id,
  pc.payment_intent_id,
  pc.status,
  pc.expires_at,
  pc.issued_to_email,
  pi.community_id
from public.purchase_claims pc
join public.payment_intents pi on pi.id = pc.payment_intent_id
where pc.status = 'issued'
  and pc.expires_at < now() + interval '7 days'
order by pc.expires_at asc
limit 200;
```

## 5) Subscription Delinquency + Grace

### 5.1 Subscriptions in grace with mismatched entitlement ends_at (should match grace_ends_at for subscription-backed access)

```sql
select
  ps.provider_subscription_id,
  ps.user_id,
  ps.community_id,
  ps.delinquent_at,
  ps.grace_ends_at,
  e.ends_at as entitlement_ends_at,
  e.source_ref
from public.provider_subscriptions ps
join public.entitlements e
  on e.user_id = ps.user_id
 and e.community_id = ps.community_id
where ps.delinquent_at is not null
  and ps.grace_ends_at is not null
  and e.source_ref = ps.provider_subscription_id
  and e.ends_at is distinct from ps.grace_ends_at
order by ps.updated_at desc
limit 200;
```

## 6) Analytics Truth Sources (Ledger)

### 6.1 Detect multi-currency communities (MVP assumes single currency per community)

```sql
select
  community_id,
  count(distinct currency) as currency_count
from public.payment_ledger_entries
group by 1
having count(distinct currency) > 1
order by currency_count desc;
```

### 6.2 Simple net revenue check (ledger-summed)

```sql
select
  community_id,
  sum(amount_base_units) as net_amount_base_units
from public.payment_ledger_entries
group by 1
order by net_amount_base_units desc
limit 50;
```

## 7) Deletion Semantics

### 7.1 Ensure community delete cleanup trigger exists (community chat thread keyed by community id)

```sql
select
  tgname as trigger_name,
  relname as table_name,
  pg_get_triggerdef(t.oid) as trigger_def
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname = 'communities'
  and tgname ilike '%delete%cleanup%';
```
