create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  role text not null check (role in ('seeker', 'employer')),
  name text not null,
  email text not null,
  phone text,
  memo text,
  source_path text,
  created_at timestamptz not null default now()
);

create table if not exists public.job_searches (
  id uuid primary key default gen_random_uuid(),
  profession jsonb,
  location jsonb,
  work_date text,
  employment_type text,
  source_path text,
  created_at timestamptz not null default now()
);

create table if not exists public.seeker_profiles (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  birth_date date,
  phone text,
  license text,
  experience_years text,
  preferred_area text,
  preferred_style text,
  skills jsonb,
  pr text,
  source_path text,
  created_at timestamptz not null default now()
);

create table if not exists public.employer_profiles (
  id uuid primary key default gen_random_uuid(),
  contact_name text not null,
  position text,
  facility_name text not null,
  facility_type text,
  staff_need text,
  phone text,
  email text not null,
  address text,
  recruit_styles jsonb,
  note text,
  source_path text,
  created_at timestamptz not null default now()
);

alter table public.leads enable row level security;
alter table public.job_searches enable row level security;
alter table public.seeker_profiles enable row level security;
alter table public.employer_profiles enable row level security;

drop policy if exists "Allow anonymous lead inserts" on public.leads;
drop policy if exists "Allow anonymous search inserts" on public.job_searches;

create policy "Allow anonymous lead inserts"
on public.leads
for insert
to anon
with check (true);

create policy "Allow anonymous search inserts"
on public.job_searches
for insert
to anon
with check (true);

alter table public.seeker_profiles add column if not exists user_id uuid;

-- Administrative account state and audit timestamp used by admin-seekers.html.
alter table public.seeker_profiles
  add column if not exists account_status text not null default 'active'
  check (account_status in ('active', 'suspended', 'withdrawn'));

alter table public.seeker_profiles
  add column if not exists updated_at timestamptz not null default now();

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists seeker_profiles_set_updated_at on public.seeker_profiles;
create trigger seeker_profiles_set_updated_at
before update on public.seeker_profiles
for each row execute function public.set_updated_at();

drop policy if exists "Allow anonymous seeker profile inserts" on public.seeker_profiles;
drop policy if exists "Allow seeker profile anonymous inserts" on public.seeker_profiles;
drop policy if exists "Allow seeker profile own inserts" on public.seeker_profiles;
drop policy if exists "Allow seeker profile own reads" on public.seeker_profiles;
drop policy if exists "Allow seeker profile own updates" on public.seeker_profiles;

create policy "Allow seeker profile anonymous inserts"
on public.seeker_profiles
for insert
to anon
with check (true);

create policy "Allow seeker profile own inserts"
on public.seeker_profiles
for insert
to authenticated
with check (auth.uid() = user_id);

create policy "Allow seeker profile own reads"
on public.seeker_profiles
for select
to authenticated
using (auth.uid() = user_id);

create policy "Allow seeker profile own updates"
on public.seeker_profiles
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

alter table public.employer_profiles add column if not exists user_id uuid;

-- Administrative account state and profile metadata used by admin-employers.html.
alter table public.employer_profiles
  add column if not exists account_status text not null default 'active'
  check (account_status in ('active', 'suspended', 'withdrawn'));

alter table public.employer_profiles
  add column if not exists postal_code text;

alter table public.employer_profiles
  add column if not exists updated_at timestamptz not null default now();

drop trigger if exists employer_profiles_set_updated_at on public.employer_profiles;
create trigger employer_profiles_set_updated_at
before update on public.employer_profiles
for each row execute function public.set_updated_at();

drop policy if exists "Allow anonymous employer profile inserts" on public.employer_profiles;
drop policy if exists "Allow employer profile anonymous inserts" on public.employer_profiles;
drop policy if exists "Allow employer profile own inserts" on public.employer_profiles;
drop policy if exists "Allow employer profile own reads" on public.employer_profiles;
drop policy if exists "Allow employer profile own updates" on public.employer_profiles;

create policy "Allow employer profile anonymous inserts"
on public.employer_profiles
for insert
to anon
with check (true);

create policy "Allow employer profile own inserts"
on public.employer_profiles
for insert
to authenticated
with check (auth.uid() = user_id);

create policy "Allow employer profile own reads"
on public.employer_profiles
for select
to authenticated
using (auth.uid() = user_id);

create policy "Allow employer profile own updates"
on public.employer_profiles
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);



-- Seeker registration + post-registration job matching (register-seeker.html / seeker-home.html)
create table if not exists public.seekers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade unique,
  full_name text,
  email text,
  phone text,
  birthdate date,
  job_type text,
  experience text,
  location text,
  work_type text,
  skills text,
  pr_text text,
  role text default 'seeker',
  created_at timestamptz not null default now()
);

alter table public.seekers enable row level security;

drop policy if exists "Seekers manage own row" on public.seekers;

create policy "Seekers manage own row"
on public.seekers
for all
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create table if not exists public.jobs (
  id uuid primary key default gen_random_uuid(),
  employer_id uuid,
  facility_name text,
  title text not null,
  category text,
  type text,
  salary text,
  location text,
  work_date text,
  description text,
  requirements text,
  status text default 'open',
  created_at timestamptz not null default now()
);

alter table public.jobs enable row level security;

drop policy if exists "Jobs public read" on public.jobs;
drop policy if exists "Employers read own jobs" on public.jobs;
drop policy if exists "Employers create own jobs" on public.jobs;
drop policy if exists "Employers update own jobs" on public.jobs;

create policy "Jobs public read"
on public.jobs
for select
to anon, authenticated
using (status = 'open');

create policy "Employers read own jobs"
on public.jobs
for select
to authenticated
using (auth.uid() = employer_id);

create policy "Employers create own jobs"
on public.jobs
for insert
to authenticated
with check (auth.uid() = employer_id);

create policy "Employers update own jobs"
on public.jobs
for update
to authenticated
using (auth.uid() = employer_id)
with check (auth.uid() = employer_id);

-- Seeker resume / work history (seeker-resume.html)
create table if not exists public.seeker_resumes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade unique,
  seeker_profile_id uuid references public.seeker_profiles(id) on delete cascade,
  education jsonb default '[]'::jsonb,
  licenses jsonb default '[]'::jsonb,
  wishes text,
  work_summary text,
  work_history jsonb default '[]'::jsonb,
  skills_text text,
  pr text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.seeker_resumes enable row level security;

drop policy if exists "Allow seeker resume own inserts" on public.seeker_resumes;
drop policy if exists "Allow seeker resume own reads" on public.seeker_resumes;
drop policy if exists "Allow seeker resume own updates" on public.seeker_resumes;

create policy "Allow seeker resume own inserts"
on public.seeker_resumes
for insert
to authenticated
with check (auth.uid() = user_id);

create policy "Allow seeker resume own reads"
on public.seeker_resumes
for select
to authenticated
using (auth.uid() = user_id);

create policy "Allow seeker resume own updates"
on public.seeker_resumes
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

-- Seeker job applications (job-detail.html / seeker-applications.html)
create table if not exists public.seeker_applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  employer_id uuid references auth.users(id) on delete cascade,
  job_id uuid,
  job_title text,
  facility_name text,
  seeker_name text,
  seeker_email text,
  seeker_profession text,
  status text not null default '応募済み',
  message text,
  created_at timestamptz not null default now()
);

alter table public.jobs add column if not exists facility_name text;

alter table public.seeker_applications add column if not exists employer_id uuid references auth.users(id) on delete cascade;
alter table public.seeker_applications add column if not exists seeker_name text;
alter table public.seeker_applications add column if not exists seeker_email text;
alter table public.seeker_applications add column if not exists seeker_profession text;

update public.seeker_applications a
set employer_id = j.employer_id,
    facility_name = coalesce(a.facility_name, j.facility_name)
from public.jobs j
where a.job_id = j.id
  and a.employer_id is null;

update public.seeker_applications a
set seeker_name = coalesce(a.seeker_name, p.name),
    seeker_email = coalesce(a.seeker_email, p.email),
    seeker_profession = coalesce(a.seeker_profession, p.license)
from public.seeker_profiles p
where a.user_id = p.user_id
  and (a.seeker_name is null or a.seeker_email is null or a.seeker_profession is null);

-- Prevent a seeker from applying to the same job twice (keep the earliest row if duplicates already exist)
delete from public.seeker_applications a
using public.seeker_applications b
where a.user_id = b.user_id
  and a.job_id = b.job_id
  and a.job_id is not null
  and a.user_id is not null
  and (a.created_at, a.id) > (b.created_at, b.id);

create unique index if not exists seeker_applications_user_job_unique
on public.seeker_applications (user_id, job_id)
where user_id is not null and job_id is not null;

alter table public.seeker_applications enable row level security;

drop policy if exists "Allow seeker application own inserts" on public.seeker_applications;
drop policy if exists "Allow seeker application own reads" on public.seeker_applications;
drop policy if exists "Allow seeker application own updates" on public.seeker_applications;
drop policy if exists "Allow employer application reads" on public.seeker_applications;
drop policy if exists "Allow employer application updates" on public.seeker_applications;

create policy "Allow seeker application own inserts"
on public.seeker_applications
for insert
to authenticated
with check (
  auth.uid() = user_id
  and exists (
    select 1 from public.jobs j
    where j.id = job_id
      and j.employer_id = employer_id
      and j.status = 'open'
  )
);

create policy "Allow seeker application own reads"
on public.seeker_applications
for select
to authenticated
using (auth.uid() = user_id);

create policy "Allow employer application reads"
on public.seeker_applications
for select
to authenticated
using (auth.uid() = employer_id);

create policy "Allow employer application updates"
on public.seeker_applications
for update
to authenticated
using (auth.uid() = employer_id)
with check (auth.uid() = employer_id);

-- ♡ (お気に入り) on seeker-jobs.html / seeker-dashboard.html
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

-- Private application chat (application-chat.html)
create table if not exists public.application_messages (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.seeker_applications(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create index if not exists application_messages_application_created_idx on public.application_messages(application_id, created_at);
alter table public.application_messages enable row level security;

drop policy if exists "Participants read application messages" on public.application_messages;
drop policy if exists "Participants send application messages" on public.application_messages;

create policy "Participants read application messages"
on public.application_messages
for select
to authenticated
using (exists (
  select 1 from public.seeker_applications a
  where a.id = application_id
    and (a.user_id = auth.uid() or a.employer_id = auth.uid())
));

create policy "Participants send application messages"
on public.application_messages
for insert
to authenticated
with check (
  sender_id = auth.uid()
  and exists (
    select 1 from public.seeker_applications a
    where a.id = application_id
      and a.status in ('選考中', '採用決定')
      and (a.user_id = auth.uid() or a.employer_id = auth.uid())
  )
);

-- Extend the hire lifecycle past 採用決定 with 勤務開始 (work started) and
-- 完了 (completed), set by the employer from application-chat.html. Keep
-- chat open through both new stages instead of locking it at 採用決定.
drop policy if exists "Participants send application messages" on public.application_messages;

create policy "Participants send application messages"
on public.application_messages
for insert
to authenticated
with check (
  sender_id = auth.uid()
  and exists (
    select 1 from public.seeker_applications a
    where a.id = application_id
      and a.status in ('選考中', '採用決定', '勤務開始', '完了')
      and (a.user_id = auth.uid() or a.employer_id = auth.uid())
  )
);

drop policy if exists "Participants mark messages read" on public.application_messages;

create policy "Participants mark messages read"
on public.application_messages
for update
to authenticated
using (
  sender_id <> auth.uid()
  and exists (
    select 1 from public.seeker_applications a
    where a.id = application_id
      and (a.user_id = auth.uid() or a.employer_id = auth.uid())
  )
)
with check (
  sender_id <> auth.uid()
  and exists (
    select 1 from public.seeker_applications a
    where a.id = application_id
      and (a.user_id = auth.uid() or a.employer_id = auth.uid())
  )
);

-- Let an employer view the seeker_profiles / seeker_resumes rows of applicants
-- who applied to a job posted by that employer, without exposing unrelated seekers.

drop policy if exists "Employers view applicant seeker profiles" on public.seeker_profiles;

create policy "Employers view applicant seeker profiles"
on public.seeker_profiles
for select
to authenticated
using (
  exists (
    select 1 from public.seeker_applications a
    where a.user_id = seeker_profiles.user_id
      and a.employer_id = auth.uid()
  )
);

drop policy if exists "Employers view applicant seeker resumes" on public.seeker_resumes;

create policy "Employers view applicant seeker resumes"
on public.seeker_resumes
for select
to authenticated
using (
  exists (
    select 1 from public.seeker_applications a
    where a.user_id = seeker_resumes.user_id
      and a.employer_id = auth.uid()
  )
);

-- Operational administrator role: a boolean flag on employer_profiles,
-- manually granted, with read-all access to seeker/employer profiles.

alter table public.employer_profiles add column if not exists is_admin boolean not null default false;

create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.employer_profiles
    where user_id = auth.uid() and is_admin = true
  );
$$;

create or replace function public.prevent_self_admin_escalation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.is_admin is distinct from old.is_admin
     and auth.uid() is not null then
    if not public.is_admin()
       or (auth.uid() = old.user_id and old.is_admin = true and new.is_admin = false) then
      new.is_admin := old.is_admin;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists employer_profiles_guard_is_admin on public.employer_profiles;
create trigger employer_profiles_guard_is_admin
before update on public.employer_profiles
for each row execute function public.prevent_self_admin_escalation();

drop policy if exists "Admins read all seeker profiles" on public.seeker_profiles;
create policy "Admins read all seeker profiles"
on public.seeker_profiles for select to authenticated
using (public.is_admin());

drop policy if exists "Admins update seeker profiles" on public.seeker_profiles;
create policy "Admins update seeker profiles"
on public.seeker_profiles for update to authenticated
using (public.is_admin())
with check (public.is_admin());

create or replace function public.protect_seeker_account_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.account_status is distinct from old.account_status
     and auth.uid() is not null
     and not public.is_admin() then
    new.account_status := old.account_status;
  end if;
  return new;
end;
$$;

drop trigger if exists seeker_profiles_protect_account_status on public.seeker_profiles;
create trigger seeker_profiles_protect_account_status
before update on public.seeker_profiles
for each row execute function public.protect_seeker_account_status();

drop policy if exists "Admins read all employer profiles" on public.employer_profiles;
create policy "Admins read all employer profiles"
on public.employer_profiles for select to authenticated
using (public.is_admin());

drop policy if exists "Admins update employer profiles" on public.employer_profiles;
create policy "Admins update employer profiles"
on public.employer_profiles for update to authenticated
using (public.is_admin())
with check (public.is_admin());

create or replace function public.protect_employer_account_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.account_status is distinct from old.account_status
     and auth.uid() is not null
     and (auth.uid() = old.user_id or not public.is_admin()) then
    new.account_status := old.account_status;
  end if;
  return new;
end;
$$;

drop trigger if exists employer_profiles_protect_account_status on public.employer_profiles;
create trigger employer_profiles_protect_account_status
before update on public.employer_profiles
for each row execute function public.protect_employer_account_status();

-- Extend admin read access to jobs and applications, plus a bounded
-- moderation ability (open/close any job posting).

drop policy if exists "Admins read all jobs" on public.jobs;
create policy "Admins read all jobs"
on public.jobs for select to authenticated
using (public.is_admin());

drop policy if exists "Admins update all jobs" on public.jobs;
create policy "Admins update all jobs"
on public.jobs for update to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Admins read all applications" on public.seeker_applications;
create policy "Admins read all applications"
on public.seeker_applications for select to authenticated
using (public.is_admin());

-- Success-fee billing: one invoice per confirmed hire (application-chat.html's
-- hireApplicant() sets seeker_applications.status = '採用決定'). ¥3,300 tax
-- included per hire, created automatically and exactly once per application.

create table if not exists public.hire_invoices (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null unique references public.seeker_applications(id) on delete cascade,
  employer_id uuid not null references auth.users(id) on delete cascade,
  job_id uuid,
  job_title text,
  facility_name text,
  seeker_name text,
  unit_price_amount integer not null default 3300,
  total_amount integer not null default 3300,
  payment_status text not null default '未払い'
    check (payment_status in ('未払い', '決済処理中', '支払い済み', '決済エラー', '返金済み')),
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists hire_invoices_employer_id_idx on public.hire_invoices(employer_id);
create index if not exists hire_invoices_payment_status_idx on public.hire_invoices(payment_status);

drop trigger if exists hire_invoices_set_updated_at on public.hire_invoices;
create trigger hire_invoices_set_updated_at
before update on public.hire_invoices
for each row execute function public.set_updated_at();

-- Create the invoice the moment a hire is confirmed (and only then), and never
-- more than once per application even if this fires twice (double-click, retry).
create or replace function public.create_hire_invoice()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = '採用決定' and old.status is distinct from '採用決定' then
    insert into public.hire_invoices (application_id, employer_id, job_id, job_title, facility_name, seeker_name)
    values (new.id, new.employer_id, new.job_id, new.job_title, new.facility_name, new.seeker_name)
    on conflict (application_id) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists seeker_applications_create_hire_invoice on public.seeker_applications;
create trigger seeker_applications_create_hire_invoice
after update on public.seeker_applications
for each row execute function public.create_hire_invoice();

alter table public.hire_invoices enable row level security;

drop policy if exists "Employers read own hire invoices" on public.hire_invoices;
create policy "Employers read own hire invoices"
on public.hire_invoices for select to authenticated
using (auth.uid() = employer_id);

drop policy if exists "Admins read all hire invoices" on public.hire_invoices;
create policy "Admins read all hire invoices"
on public.hire_invoices for select to authenticated
using (public.is_admin());

drop policy if exists "Admins update hire invoices" on public.hire_invoices;
create policy "Admins update hire invoices"
on public.hire_invoices for update to authenticated
using (public.is_admin())
with check (public.is_admin());

-- Record the pay.jp charge id on the invoice it paid, so an admin can look
-- up/refund the actual charge in the pay.jp dashboard from admin-payments.html.
alter table public.hire_invoices add column if not exists payjp_charge_id text;

-- Fields commonly asked on Japanese healthcare job-matching platforms that
-- were missing from the seeker profile: nearest station, commute method,
-- and current employment status (used by seeker-profile.html).
alter table public.seeker_profiles add column if not exists nearest_station text;
alter table public.seeker_profiles add column if not exists commute_method text;
alter table public.seeker_profiles add column if not exists employment_status text;

-- Replace the 5-value 応募済み/選考中/採用決定/勤務開始/完了 pipeline with a
-- richer 12-stage, English-keyed pipeline:
-- applied -> screening -> interview_scheduling -> interview_scheduled ->
-- offer_pending -> hired -> work_scheduled -> working -> completed
-- (with rejected / withdrawn / cancelled as branch exits).

alter table public.seeker_applications add column if not exists interview_at timestamptz;
alter table public.seeker_applications add column if not exists work_start_at date;

-- Map existing rows onto the new pipeline's values. Old 勤務開始 meant
-- "currently working" (there was no separate "scheduled but not started"
-- concept), so it maps to 'working', not the new 'work_scheduled' stage.
update public.seeker_applications set status = 'applied' where status = '応募済み';
update public.seeker_applications set status = 'screening' where status = '選考中';
update public.seeker_applications set status = 'hired' where status = '採用決定';
update public.seeker_applications set status = 'working' where status = '勤務開始';
update public.seeker_applications set status = 'completed' where status = '完了';

alter table public.seeker_applications alter column status set default 'applied';

-- Invoice creation now fires on the transition into 'hired' (was '採用決定').
create or replace function public.create_hire_invoice()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'hired' and old.status is distinct from 'hired' then
    insert into public.hire_invoices (application_id, employer_id, job_id, job_title, facility_name, seeker_name)
    values (new.id, new.employer_id, new.job_id, new.job_title, new.facility_name, new.seeker_name)
    on conflict (application_id) do nothing;
  end if;
  return new;
end;
$$;

-- Chat is closed before screening starts and after any terminal exit
-- (rejected/withdrawn/cancelled), open at every stage in between. A
-- blocklist here (vs. the old 4-value allowlist) means future pipeline
-- stages don't silently lose chat access.
drop policy if exists "Participants send application messages" on public.application_messages;

create policy "Participants send application messages"
on public.application_messages
for insert
to authenticated
with check (
  sender_id = auth.uid()
  and exists (
    select 1 from public.seeker_applications a
    where a.id = application_id
      and a.status not in ('applied', 'rejected', 'withdrawn', 'cancelled')
      and (a.user_id = auth.uid() or a.employer_id = auth.uid())
  )
);

-- account_status ('suspended') was only ever checked by the admin UI that
-- sets it. Login didn't check it, and the policies above only checked
-- ownership (auth.uid() = ...), so a suspended seeker or employer with a
-- still-valid session could keep posting jobs, applying, and messaging.
-- Add active-status gates to the write-path policies so suspension is
-- enforced at the database layer regardless of client code or an
-- already-open session.

create or replace function public.is_seeker_active(uid uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(
    (select account_status = 'active' from public.seeker_profiles where user_id = uid),
    false
  );
$$;

create or replace function public.is_employer_active(uid uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(
    (select account_status = 'active' from public.employer_profiles where user_id = uid),
    false
  );
$$;

drop policy if exists "Employers create own jobs" on public.jobs;
create policy "Employers create own jobs"
on public.jobs
for insert
to authenticated
with check (auth.uid() = employer_id and public.is_employer_active(auth.uid()));

drop policy if exists "Employers update own jobs" on public.jobs;
create policy "Employers update own jobs"
on public.jobs
for update
to authenticated
using (auth.uid() = employer_id)
with check (auth.uid() = employer_id and public.is_employer_active(auth.uid()));

drop policy if exists "Allow seeker application own inserts" on public.seeker_applications;
create policy "Allow seeker application own inserts"
on public.seeker_applications
for insert
to authenticated
with check (
  auth.uid() = user_id
  and public.is_seeker_active(auth.uid())
  and exists (
    select 1 from public.jobs j
    where j.id = job_id
      and j.employer_id = employer_id
      and j.status = 'open'
  )
);

drop policy if exists "Allow employer application updates" on public.seeker_applications;
create policy "Allow employer application updates"
on public.seeker_applications
for update
to authenticated
using (auth.uid() = employer_id)
with check (auth.uid() = employer_id and public.is_employer_active(auth.uid()));

drop policy if exists "Participants send application messages" on public.application_messages;
create policy "Participants send application messages"
on public.application_messages
for insert
to authenticated
with check (
  sender_id = auth.uid()
  and (public.is_seeker_active(auth.uid()) or public.is_employer_active(auth.uid()))
  and exists (
    select 1 from public.seeker_applications a
    where a.id = application_id
      and a.status not in ('applied', 'rejected', 'withdrawn', 'cancelled')
      and (a.user_id = auth.uid() or a.employer_id = auth.uid())
  )
);

-- "Participants mark messages read" only restricted which ROWS a
-- non-sender participant could update (via USING/WITH CHECK), not which
-- COLUMNS. Nothing stopped a recipient from calling
-- .update({ body: '...' }) on someone else's message and rewriting the
-- chat log, since RLS has no per-column granularity. The only real
-- caller (application-chat.html) only ever sets read_at. Replace the
-- open UPDATE policy with a locked-down function that touches read_at
-- only, and drop client-side UPDATE access to the table entirely.

drop policy if exists "Participants mark messages read" on public.application_messages;

create or replace function public.mark_messages_read(p_application_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.seeker_applications a
    where a.id = p_application_id
      and (a.user_id = auth.uid() or a.employer_id = auth.uid())
  ) then
    return;
  end if;

  update public.application_messages
  set read_at = now()
  where application_id = p_application_id
    and sender_id <> auth.uid()
    and read_at is null;
end;
$$;

grant execute on function public.mark_messages_read(uuid) to authenticated;

-- "Allow employer application updates" only restricted which ROW an
-- employer could update (their own, while active); WITH CHECK re-checks
-- the same row-ownership condition, not which columns changed. Nothing
-- stopped an employer from calling .update({ seeker_name: '...',
-- seeker_email: '...', message: '...', job_title: '...' }) and rewriting
-- applicant-authored fields on their own application row. The only real
-- callers (application-chat.html, employer-applications.html,
-- employer-applicant.html) only ever set status, interview_at, and
-- work_start_at. Replace the open UPDATE policy with a locked-down
-- function that only ever touches those three columns, and drop
-- client-side UPDATE access to the table for employers entirely.

drop policy if exists "Allow employer application updates" on public.seeker_applications;

create or replace function public.employer_update_application_status(
  p_application_id uuid,
  p_status text,
  p_interview_at timestamptz default null,
  p_work_start_at date default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.seeker_applications
    where id = p_application_id
      and employer_id = auth.uid()
  ) then
    return;
  end if;

  if not public.is_employer_active(auth.uid()) then
    return;
  end if;

  if p_status not in (
    'applied', 'screening', 'interview_scheduling', 'interview_scheduled',
    'offer_pending', 'hired', 'work_scheduled', 'working', 'completed',
    'rejected', 'cancelled'
  ) then
    raise exception 'invalid status value: %', p_status;
  end if;

  update public.seeker_applications
  set status = p_status,
      interview_at = coalesce(p_interview_at, interview_at),
      work_start_at = coalesce(p_work_start_at, work_start_at)
  where id = p_application_id;
end;
$$;

grant execute on function public.employer_update_application_status(uuid, text, timestamptz, date) to authenticated;

-- Make account + profile creation atomic. Previously the client called
-- auth.signUp() and then, separately, .insert()'d the profile row - if
-- that second call failed, the auth account was left stranded with no
-- profile and no way to retry (the email was already "taken"). A
-- trigger on auth.users runs inside the SAME transaction Supabase Auth
-- uses to create the user: if it raises, the whole signUp() fails and
-- no auth.users row is left behind either, so registration can simply
-- be retried. This mirrors the existing create_hire_invoice() trigger
-- pattern already used in this project.

create or replace function public.handle_new_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  role_value text := new.raw_user_meta_data ->> 'role';
begin
  if role_value = 'seeker' then
    insert into public.seeker_profiles (
      user_id, name, email, birth_date, phone, license, experience_years,
      preferred_area, preferred_style, skills, pr, source_path
    ) values (
      new.id,
      coalesce(new.raw_user_meta_data ->> 'name', ''),
      new.email,
      nullif(new.raw_user_meta_data ->> 'birth_date', '')::date,
      new.raw_user_meta_data ->> 'phone',
      new.raw_user_meta_data ->> 'license',
      new.raw_user_meta_data ->> 'experience_years',
      new.raw_user_meta_data ->> 'preferred_area',
      new.raw_user_meta_data ->> 'preferred_style',
      coalesce(new.raw_user_meta_data -> 'skills', '[]'::jsonb),
      new.raw_user_meta_data ->> 'pr',
      new.raw_user_meta_data ->> 'source_path'
    );
  elsif role_value = 'employer' then
    insert into public.employer_profiles (
      user_id, contact_name, position, facility_name, facility_type,
      staff_need, phone, email, address, recruit_styles, note, source_path
    ) values (
      new.id,
      coalesce(new.raw_user_meta_data ->> 'contact_name', ''),
      new.raw_user_meta_data ->> 'position',
      coalesce(new.raw_user_meta_data ->> 'facility_name', ''),
      new.raw_user_meta_data ->> 'facility_type',
      new.raw_user_meta_data ->> 'staff_need',
      new.raw_user_meta_data ->> 'phone',
      new.email,
      new.raw_user_meta_data ->> 'address',
      coalesce(new.raw_user_meta_data -> 'recruit_styles', '[]'::jsonb),
      new.raw_user_meta_data ->> 'note',
      new.raw_user_meta_data ->> 'source_path'
    );
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_profile();

-- The client no longer inserts profile rows directly after signUp() -
-- the trigger above does it, security definer, regardless of anon/
-- authenticated context. These anon policies (with check (true), i.e.
-- accept any payload from anyone) existed only to let that old
-- pre-confirmation client insert through; remove that write surface.
drop policy if exists "Allow seeker profile anonymous inserts" on public.seeker_profiles;
drop policy if exists "Allow employer profile anonymous inserts" on public.employer_profiles;

-- Backing columns for seeker-settings.html's 通知設定 (notification
-- toggles) and 公開・プライバシー設定 (profile visibility).
alter table public.seeker_profiles
  add column if not exists notification_preferences jsonb not null default
    '{"new_jobs":true,"messages":true,"interviews":true,"application_status":true,"email":true}'::jsonb;

alter table public.seeker_profiles
  add column if not exists profile_visibility text not null default '応募した求人者のみ';

-- 'withdrawn' has been a valid account_status value (and already
-- correctly blocks login with its own message) since the suspension
-- work, but nothing could ever actually reach it: both protection
-- triggers block every non-admin change to account_status, including a
-- user closing their own account. seeker-settings.html's アカウントを削除する
-- needs a genuine self-service path. Carve out exactly one exception in
-- each trigger: the row's own owner may flip their own status from
-- active to withdrawn (and nothing else - not to/from suspended, and
-- not un-withdrawing themselves).
create or replace function public.protect_seeker_account_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.account_status is distinct from old.account_status
     and auth.uid() is not null
     and not public.is_admin()
     and not (auth.uid() = old.user_id and old.account_status = 'active' and new.account_status = 'withdrawn') then
    new.account_status := old.account_status;
  end if;
  return new;
end;
$$;

create or replace function public.protect_employer_account_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.account_status is distinct from old.account_status
     and auth.uid() is not null
     and (auth.uid() = old.user_id or not public.is_admin())
     and not (auth.uid() = old.user_id and old.account_status = 'active' and new.account_status = 'withdrawn') then
    new.account_status := old.account_status;
  end if;
  return new;
end;
$$;

-- お知らせ (announcements): admin-authored, read by seekers (and,
-- schema-wise, employers once an employer-facing page consumes it -
-- only seeker-notices.html exists today). Unread tracking uses a single
-- per-user "last viewed" timestamp on the profile rather than a
-- per-notice read table, matching the scale this needs.

create table if not exists public.notices (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  audience text not null default 'all' check (audience in ('all', 'seeker', 'employer')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists notices_created_at_idx on public.notices(created_at desc);

alter table public.notices enable row level security;

drop policy if exists "Authenticated users read relevant notices" on public.notices;
create policy "Authenticated users read relevant notices"
on public.notices
for select
to authenticated
using (
  audience = 'all'
  or (audience = 'seeker' and exists (select 1 from public.seeker_profiles where user_id = auth.uid()))
  or (audience = 'employer' and exists (select 1 from public.employer_profiles where user_id = auth.uid()))
  or public.is_admin()
);

drop policy if exists "Admins create notices" on public.notices;
create policy "Admins create notices"
on public.notices
for insert
to authenticated
with check (public.is_admin());

drop policy if exists "Admins update notices" on public.notices;
create policy "Admins update notices"
on public.notices
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Admins delete notices" on public.notices;
create policy "Admins delete notices"
on public.notices
for delete
to authenticated
using (public.is_admin());

alter table public.seeker_profiles add column if not exists last_notices_read_at timestamptz;

-- Backing column for employer-settings.html's 通知設定 (notification
-- toggles), mirroring the seeker_profiles.notification_preferences
-- column added for seeker-settings.html.
alter table public.employer_profiles
  add column if not exists notification_preferences jsonb not null default
    '{"new_applications":true,"messages":true,"hires":true,"payments":true,"email":true}'::jsonb;


-- Drop the interview-date-coordination and work-start-date-scheduling
-- sub-steps from the hire pipeline (employer feedback: neither the
-- interview date nor the work start date needs to be tracked in-app).
-- New pipeline: applied -> screening -> offer_pending -> hired ->
-- working -> completed (rejected / withdrawn / cancelled unchanged).

update public.seeker_applications set status = 'screening' where status in ('interview_scheduling', 'interview_scheduled');
update public.seeker_applications set status = 'hired' where status = 'work_scheduled';

alter table public.seeker_applications drop column if exists interview_at;
alter table public.seeker_applications drop column if exists work_start_at;

drop function if exists public.employer_update_application_status(uuid, text, timestamptz, date);

create or replace function public.employer_update_application_status(
  p_application_id uuid,
  p_status text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.seeker_applications
    where id = p_application_id
      and employer_id = auth.uid()
  ) then
    return;
  end if;

  if not public.is_employer_active(auth.uid()) then
    return;
  end if;

  if p_status not in (
    'applied', 'screening', 'offer_pending', 'hired', 'working', 'completed',
    'rejected', 'cancelled'
  ) then
    raise exception 'invalid status value: %', p_status;
  end if;

  update public.seeker_applications
  set status = p_status
  where id = p_application_id;
end;
$$;

grant execute on function public.employer_update_application_status(uuid, text) to authenticated;

-- Employer feedback: payment method is chosen exactly once, at the moment
-- a hire is confirmed (not from a persistent "pay" button on the invoice
-- list later). Two choices: pay by card via pay.jp immediately, or defer
-- to the end-of-month bundled invoice (handled manually by admin from
-- admin-payments.html, same as today).

alter table public.hire_invoices add column if not exists payment_method text not null default 'invoice' check (payment_method in ('card', 'invoice'));

drop function if exists public.employer_update_application_status(uuid, text);

create or replace function public.employer_update_application_status(
  p_application_id uuid,
  p_status text,
  p_payment_method text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.seeker_applications
    where id = p_application_id
      and employer_id = auth.uid()
  ) then
    return;
  end if;

  if not public.is_employer_active(auth.uid()) then
    return;
  end if;

  if p_status not in (
    'applied', 'screening', 'offer_pending', 'hired', 'working', 'completed',
    'rejected', 'cancelled'
  ) then
    raise exception 'invalid status value: %', p_status;
  end if;

  if p_payment_method is not null and p_payment_method not in ('card', 'invoice') then
    raise exception 'invalid payment method: %', p_payment_method;
  end if;

  update public.seeker_applications
  set status = p_status
  where id = p_application_id;

  -- The hire_invoices row (if any) was just created synchronously by the
  -- create_hire_invoice() trigger above, in the same statement.
  if p_status = 'hired' and p_payment_method is not null then
    update public.hire_invoices
    set payment_method = p_payment_method
    where application_id = p_application_id;
  end if;
end;
$$;

grant execute on function public.employer_update_application_status(uuid, text, text) to authenticated;

-- Monthly bundled invoice issuance from admin-payments.html.
alter table public.hire_invoices
  add column if not exists invoice_issued_at timestamptz;

create index if not exists hire_invoices_invoice_issued_at_idx
  on public.hire_invoices(invoice_issued_at);

-- LINE Login is wired up as a Supabase custom OIDC provider (id
-- "custom:line", configured in the dashboard, not in SQL). Unlike
-- email/password signUp(), signInWithOAuth() gives the client no way to
-- pass { role: 'seeker', ... } through to this trigger - Supabase itself
-- stamps the provider used onto raw_app_meta_data.provider, so a
-- LINE-created user is recognized by role metadata being absent *and*
-- that provider tag, instead of an explicit role field. Scoped to
-- 'custom:line' specifically (not any custom:* provider) since this is
-- seeker-only for now; a future employer-side provider would need its
-- own explicit branch here.
create or replace function public.handle_new_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  role_value text := new.raw_user_meta_data ->> 'role';
  provider_value text := new.raw_app_meta_data ->> 'provider';
begin
  if role_value = 'seeker' or (role_value is null and provider_value = 'custom:line') then
    insert into public.seeker_profiles (
      user_id, name, email, birth_date, phone, license, experience_years,
      preferred_area, preferred_style, skills, pr, source_path
    ) values (
      new.id,
      coalesce(new.raw_user_meta_data ->> 'name', new.raw_user_meta_data ->> 'full_name', ''),
      -- LINE only returns an email if the channel has email-scope approval
      -- and the user consents; seeker_profiles.email is not null, so fall
      -- back to a synthetic address rather than fail the whole signup.
      coalesce(new.email, new.id::text || '@line.medi-job.local'),
      nullif(new.raw_user_meta_data ->> 'birth_date', '')::date,
      new.raw_user_meta_data ->> 'phone',
      new.raw_user_meta_data ->> 'license',
      new.raw_user_meta_data ->> 'experience_years',
      new.raw_user_meta_data ->> 'preferred_area',
      new.raw_user_meta_data ->> 'preferred_style',
      coalesce(new.raw_user_meta_data -> 'skills', '[]'::jsonb),
      new.raw_user_meta_data ->> 'pr',
      coalesce(new.raw_user_meta_data ->> 'source_path', provider_value)
    );
  elsif role_value = 'employer' then
    insert into public.employer_profiles (
      user_id, contact_name, position, facility_name, facility_type,
      staff_need, phone, email, address, recruit_styles, note, source_path
    ) values (
      new.id,
      coalesce(new.raw_user_meta_data ->> 'contact_name', ''),
      new.raw_user_meta_data ->> 'position',
      coalesce(new.raw_user_meta_data ->> 'facility_name', ''),
      new.raw_user_meta_data ->> 'facility_type',
      new.raw_user_meta_data ->> 'staff_need',
      new.raw_user_meta_data ->> 'phone',
      new.email,
      new.raw_user_meta_data ->> 'address',
      coalesce(new.raw_user_meta_data -> 'recruit_styles', '[]'::jsonb),
      new.raw_user_meta_data ->> 'note',
      new.raw_user_meta_data ->> 'source_path'
    );
  end if;
  return new;
end;
$$;

-- Switching LINE login from a Supabase Custom OIDC Provider (which
-- turned out to not be enabled/available on this project - "custom
-- provider custom:line not found") to the client's mandated Method A:
-- an Edge Function that exchanges the LINE auth code itself, verifies
-- the ID token, and creates/finds the seeker via the Admin API. That
-- function upserts directly into seeker_profiles (see line-auth Edge
-- Function), so the on_auth_user_created trigger's custom:line branch
-- from the previous migration never fires and is now dead code -
-- reverting it back out rather than leaving an unreachable branch.

create or replace function public.handle_new_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  role_value text := new.raw_user_meta_data ->> 'role';
begin
  if role_value = 'seeker' then
    insert into public.seeker_profiles (
      user_id, name, email, birth_date, phone, license, experience_years,
      preferred_area, preferred_style, skills, pr, source_path
    ) values (
      new.id,
      coalesce(new.raw_user_meta_data ->> 'name', ''),
      new.email,
      nullif(new.raw_user_meta_data ->> 'birth_date', '')::date,
      new.raw_user_meta_data ->> 'phone',
      new.raw_user_meta_data ->> 'license',
      new.raw_user_meta_data ->> 'experience_years',
      new.raw_user_meta_data ->> 'preferred_area',
      new.raw_user_meta_data ->> 'preferred_style',
      coalesce(new.raw_user_meta_data -> 'skills', '[]'::jsonb),
      new.raw_user_meta_data ->> 'pr',
      new.raw_user_meta_data ->> 'source_path'
    );
  elsif role_value = 'employer' then
    insert into public.employer_profiles (
      user_id, contact_name, position, facility_name, facility_type,
      staff_need, phone, email, address, recruit_styles, note, source_path
    ) values (
      new.id,
      coalesce(new.raw_user_meta_data ->> 'contact_name', ''),
      new.raw_user_meta_data ->> 'position',
      coalesce(new.raw_user_meta_data ->> 'facility_name', ''),
      new.raw_user_meta_data ->> 'facility_type',
      new.raw_user_meta_data ->> 'staff_need',
      new.raw_user_meta_data ->> 'phone',
      new.email,
      new.raw_user_meta_data ->> 'address',
      coalesce(new.raw_user_meta_data -> 'recruit_styles', '[]'::jsonb),
      new.raw_user_meta_data ->> 'note',
      new.raw_user_meta_data ->> 'source_path'
    );
  end if;
  return new;
end;
$$;

-- LINE-authenticated seekers are matched by line_user_id (a channel is
-- 1:1 with a LINE "sub" claim per user), separate from the email/
-- password path which has no such identifier.
alter table public.seeker_profiles add column if not exists line_user_id text unique;
create index if not exists seeker_profiles_line_user_id_idx on public.seeker_profiles(line_user_id);

-- The Edge Function runs with the service role key (security definer
-- equivalent - it bypasses RLS entirely via the service key), so no
-- new RLS policy is needed for it to upsert here. Existing "owner can
-- select/update own row" policies already cover the seeker's own later
-- reads/writes through the normal authenticated client.

-- First real notification-delivery channel for this app (nothing sent
-- notifications before this - the toggles in seeker-settings.html's
-- 通知設定 were preferences with no dispatch behind them). Uses a
-- separate LINE Messaging API channel from the LINE Login channel
-- (same LINE Provider, so LINE's unified user ID means the "sub" we
-- already store as seeker_profiles.line_user_id from Login also
-- identifies the same person's Messaging API "follow" events).
--
-- line_messaging_linked_at is set/cleared by the line-webhook Edge
-- Function on LINE's follow/unfollow events. A push to someone who
-- hasn't added the Official Account as a friend simply fails on
-- LINE's side, so this column is what lets us skip that attempt and
-- show real connected/not-connected status in seeker-settings.html.
alter table public.seeker_profiles
  add column if not exists line_messaging_linked_at timestamptz;

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

-- application-detail.html shows job info (location/salary/work_date/
-- description) by querying jobs directly, since seeker_applications
-- only denormalizes job_title/facility_name at application time, not
-- these extra fields. "Jobs public read" only allows status='open',
-- so a seeker would lose access to their own applied job's details
-- the moment it closes/fills - add a policy keyed to having actually
-- applied, independent of the job's current status.
drop policy if exists "Seekers read jobs they applied to" on public.jobs;
create policy "Seekers read jobs they applied to"
on public.jobs
for select
to authenticated
using (
  exists (
    select 1 from public.seeker_applications a
    where a.job_id = jobs.id and a.user_id = auth.uid()
  )
);

-- Tracks whether the seeker has already been shown the "おめでとうご
-- ざいます" hire banner on seeker-dashboard.html, so it stops
-- reappearing on every visit once acknowledged once.
--
-- Seekers have no direct UPDATE policy on seeker_applications (only
-- SELECT - every write already goes through a locked-down function
-- like employer_update_application_status/mark_messages_read, since
-- RLS can't restrict which columns a raw .update() touches). This
-- follows the same pattern: a security-definer function that only
-- ever sets this one column, only on the caller's own row.
alter table public.seeker_applications
  add column if not exists hire_banner_seen_at timestamptz;

create or replace function public.seeker_dismiss_hire_banner(p_application_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.seeker_applications
  set hire_banner_seen_at = now()
  where id = p_application_id
    and user_id = auth.uid()
    and status = 'hired'
    and hire_banner_seen_at is null;
end;
$$;

grant execute on function public.seeker_dismiss_hire_banner(uuid) to authenticated;

-- Captures Resend's own message id per send attempt, so a delivery
-- can be cross-referenced in Resend's dashboard directly from
-- admin-email-logs.html instead of only having our internal log.
alter table public.email_delivery_logs
  add column if not exists resend_message_id text;

-- Collapses the old two-tier "category enabled" + blanket "email
-- channel enabled" toggles (new_applications/messages/hires + email)
-- into one flag per category that directly gates that category's
-- email, matching the simpler structure the employer email settings
-- section now uses. Preserves each existing employer's actual prior
-- choice under the new key names rather than resetting everyone to
-- the default.
update public.employer_profiles
set notification_preferences = coalesce(notification_preferences, '{}'::jsonb) || jsonb_build_object(
  'new_application_email', coalesce((notification_preferences->>'new_applications')::boolean, true),
  'new_message_email', coalesce((notification_preferences->>'messages')::boolean, true),
  'hiring_status_email', coalesce((notification_preferences->>'hires')::boolean, true)
);

alter table public.employer_profiles
  alter column notification_preferences set default
    '{"new_application_email":true,"new_message_email":true,"hiring_status_email":true,"payments":true}'::jsonb;

-- Employer-side "seen" tracking for the new-application dashboard
-- banner (section 6): null until the employer opens that specific
-- applicant's detail page, mirroring the same pattern already used
-- for seeker_applications.hire_banner_seen_at.
alter table public.seeker_applications
  add column if not exists employer_seen_at timestamptz;

create or replace function public.employer_mark_application_seen(p_application_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.seeker_applications
  set employer_seen_at = now()
  where id = p_application_id
    and employer_id = auth.uid()
    and employer_seen_at is null;
end;
$$;

grant execute on function public.employer_mark_application_seen(uuid) to authenticated;
