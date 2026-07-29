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
