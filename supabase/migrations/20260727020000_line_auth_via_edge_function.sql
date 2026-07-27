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
