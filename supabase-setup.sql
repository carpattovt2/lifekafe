-- Run this in Supabase SQL Editor

-- Weight entries table
create table if not exists weight_entries (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references auth.users not null,
  date       date not null,
  weight_kg  decimal(5,2) not null,
  created_at timestamp with time zone default now()
);

-- Events table
create table if not exists events (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users not null,
  title       text not null,
  category    text not null,
  event_date  date not null,
  start_time  time,
  end_time    time,
  is_all_day  boolean default false,
  recurring   text default 'none',
  created_at  timestamp with time zone default now()
);

-- Enable RLS
alter table weight_entries enable row level security;
alter table events enable row level security;

-- Weight entries policies
create policy "Users can view own weight entries"
  on weight_entries for select
  using (auth.uid() = user_id);

create policy "Users can insert own weight entries"
  on weight_entries for insert
  with check (auth.uid() = user_id);

create policy "Users can delete own weight entries"
  on weight_entries for delete
  using (auth.uid() = user_id);

-- Events policies
create policy "Users can view own events"
  on events for select
  using (auth.uid() = user_id);

create policy "Users can insert own events"
  on events for insert
  with check (auth.uid() = user_id);

create policy "Users can delete own events"
  on events for delete
  using (auth.uid() = user_id);
