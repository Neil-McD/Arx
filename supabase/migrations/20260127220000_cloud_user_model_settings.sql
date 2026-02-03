-- Cloud-canonical user model settings (preferences).
-- Currently stores a global system prompt applied to OpenRouter turns.

create table if not exists public.user_model_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  system_prompt text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists user_model_settings_set_updated_at on public.user_model_settings;
create trigger user_model_settings_set_updated_at
before update on public.user_model_settings
for each row
execute function public.set_updated_at();

alter table public.user_model_settings enable row level security;

drop policy if exists user_model_settings_select_own on public.user_model_settings;
create policy user_model_settings_select_own
on public.user_model_settings
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists user_model_settings_insert_own on public.user_model_settings;
create policy user_model_settings_insert_own
on public.user_model_settings
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists user_model_settings_update_own on public.user_model_settings;
create policy user_model_settings_update_own
on public.user_model_settings
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists user_model_settings_delete_own on public.user_model_settings;
create policy user_model_settings_delete_own
on public.user_model_settings
for delete
to authenticated
using (user_id = auth.uid());

