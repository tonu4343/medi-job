-- Admin-facing log of every email the app has attempted to send via
-- Resend. Resend has its own send log, but it's outside this app and
-- not something an admin here can see - this table is what backs
-- admin-email-logs.html. Every api/send-*.js function inserts one row
-- per attempt (success or failure) using the service role key, so no
-- insert policy is needed; only admins can read it back.
create table if not exists public.email_delivery_logs (
  id uuid primary key default gen_random_uuid(),
  email_type text not null,
  recipient_email text not null,
  subject text not null,
  status text not null check (status in ('sent', 'failed', 'skipped')),
  error_message text,
  related_id uuid,
  created_at timestamptz not null default now()
);

create index if not exists email_delivery_logs_created_at_idx on public.email_delivery_logs(created_at desc);
create index if not exists email_delivery_logs_email_type_idx on public.email_delivery_logs(email_type);

alter table public.email_delivery_logs enable row level security;

drop policy if exists "Admins read email delivery logs" on public.email_delivery_logs;
create policy "Admins read email delivery logs"
on public.email_delivery_logs
for select
to authenticated
using (public.is_admin());

-- First real email trigger tied to the hiring moment specifically
-- (separate from the general application_status push/email, which
-- covers every status transition, not just this one) - the seeker
-- gets a dedicated congratulatory email when their status becomes
-- 'hired', matching the "Hiring notification" checklist item.
