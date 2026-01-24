-- User-scoped provider API keys (BYO) stored in cloud for cross-device sync.
-- MVP: stored as plaintext in Postgres (protected by RLS + only accessed via Edge Functions).
-- Future: migrate api_key -> ciphertext for E2EE / vault integration.

create table if not exists public.user_provider_keys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null,
  api_key text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, provider)
);

create index if not exists user_provider_keys_user_id_idx on public.user_provider_keys(user_id);

alter table public.user_provider_keys enable row level security;

-- No policies: deny direct client access. Edge Functions use the service role key.

drop trigger if exists trg_user_provider_keys_set_updated_at on public.user_provider_keys;
create trigger trg_user_provider_keys_set_updated_at
before update on public.user_provider_keys
for each row execute function public.set_updated_at();

