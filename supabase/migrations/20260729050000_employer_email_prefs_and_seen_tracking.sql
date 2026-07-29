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
