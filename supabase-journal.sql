-- Run this in Supabase SQL Editor

create table if not exists journal_entries (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid references auth.users not null,
  date         date not null,
  gratitude    text,
  insight      text,
  stress_action text,
  created_at   timestamp with time zone default now(),
  constraint journal_entries_user_date unique (user_id, date)
);

alter table journal_entries enable row level security;

create policy "Users can view own journal entries"
  on journal_entries for select
  using (auth.uid() = user_id);

create policy "Users can insert own journal entries"
  on journal_entries for insert
  with check (auth.uid() = user_id);

create policy "Users can update own journal entries"
  on journal_entries for update
  using (auth.uid() = user_id);

create policy "Users can delete own journal entries"
  on journal_entries for delete
  using (auth.uid() = user_id);
