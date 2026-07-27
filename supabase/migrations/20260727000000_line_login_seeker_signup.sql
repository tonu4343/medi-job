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
