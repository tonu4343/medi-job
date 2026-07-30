-- Backs the ♡ (お気に入り) button on seeker-jobs.html and seeker-dashboard.html,
-- which previously had no persistence at all - seeker-jobs.html's heart had no
-- click handler, and seeker-dashboard.html's only toggled a CSS class that
-- reset on every reload. One row per (seeker, job) they've saved.
create table if not exists public.seeker_favorites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  job_id uuid not null references public.jobs(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, job_id)
);

alter table public.seeker_favorites enable row level security;

drop policy if exists "Seekers manage own favorites" on public.seeker_favorites;

create policy "Seekers manage own favorites"
on public.seeker_favorites
for all
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
