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
