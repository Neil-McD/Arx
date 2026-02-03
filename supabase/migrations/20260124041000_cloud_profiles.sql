-- User profiles (cloud-canonical identity surface).
-- Kept minimal for MVP; used to render human-friendly member lists across web + desktop.

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_url text,
  bio text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Keep updated_at current.
drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row
execute function public.set_updated_at();

-- Create profiles automatically on signup.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  insert into public.profiles(user_id, display_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', new.email),
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- Backfill profiles for existing users.
insert into public.profiles(user_id, display_name, avatar_url)
select u.id,
       coalesce(u.raw_user_meta_data->>'name', u.email),
       u.raw_user_meta_data->>'avatar_url'
from auth.users u
left join public.profiles p on p.user_id = u.id
where p.user_id is null;

alter table public.profiles enable row level security;

-- Profiles are visible to signed-in users (community product; can tighten later if needed).
drop policy if exists profiles_select_authenticated on public.profiles;
create policy profiles_select_authenticated
on public.profiles
for select
to authenticated
using (true);

drop policy if exists profiles_insert_own on public.profiles;
create policy profiles_insert_own
on public.profiles
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own
on public.profiles
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists profiles_service_role_all on public.profiles;
create policy profiles_service_role_all
on public.profiles
for all
to service_role
using (true)
with check (true);

