-- Private cross-device storage for The Reading Room.
-- Each signed-in user can access only their own JSON document.
create table if not exists public.reading_room_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  state jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.reading_room_state enable row level security;
grant select, insert, update on public.reading_room_state to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'reading_room_state'
      and policyname = 'Users can read their own reading room'
  ) then
    create policy "Users can read their own reading room"
      on public.reading_room_state for select to authenticated
      using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'reading_room_state'
      and policyname = 'Users can create their own reading room'
  ) then
    create policy "Users can create their own reading room"
      on public.reading_room_state for insert to authenticated
      with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'reading_room_state'
      and policyname = 'Users can update their own reading room'
  ) then
    create policy "Users can update their own reading room"
      on public.reading_room_state for update to authenticated
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;
end
$$;
