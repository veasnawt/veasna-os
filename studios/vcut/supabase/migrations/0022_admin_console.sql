-- Apply before deploying /admin. All privileges and mutations are server-only.
begin;
create table public.vcut_admin_audit (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null,
  action text not null,
  target_id text not null,
  reason text not null check (length(reason) between 5 and 1000),
  details jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index vcut_admin_audit_recent on public.vcut_admin_audit(created_at desc);
create table public.vcut_admin_user_controls (
  user_id uuid primary key references auth.users(id) on delete cascade,
  suspended boolean not null default false,
  deletion_reviewed_at timestamptz,
  updated_at timestamptz not null default now()
);
create table public.vcut_admin_project_controls (
  project_id text primary key references public.projects_index(id) on delete cascade,
  restricted boolean not null default false,
  updated_at timestamptz not null default now()
);
create table public.vcut_admin_template_controls (
  template_id text primary key references public.templates(id) on delete cascade,
  restricted boolean not null default false,
  updated_at timestamptz not null default now()
);
alter table public.vcut_admin_template_controls enable row level security;
revoke all on public.vcut_admin_template_controls from public,anon,authenticated;
grant all on public.vcut_admin_template_controls to service_role;
create function public.vcut_enforce_template_moderation() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if new.is_public and exists(select 1 from vcut_admin_template_controls where template_id=new.id and restricted) then
  raise exception 'This template is restricted by moderation';
 end if;
 return new;
end;
$$;
create trigger vcut_template_moderation before insert or update of is_public on public.templates
for each row execute function public.vcut_enforce_template_moderation();
revoke all on function public.vcut_enforce_template_moderation() from public,anon,authenticated;
alter table public.vcut_admin_audit enable row level security;
alter table public.vcut_admin_user_controls enable row level security;
alter table public.vcut_admin_project_controls enable row level security;
revoke all on public.vcut_admin_audit, public.vcut_admin_user_controls, public.vcut_admin_project_controls from public, anon, authenticated;
grant all on public.vcut_admin_audit, public.vcut_admin_user_controls, public.vcut_admin_project_controls to service_role;
create index if not exists vcut_export_jobs_created_idx on public.vcut_export_jobs(created_at desc);

-- Auth users are returned through an explicit projection, never raw metadata, tokens or identities.
create function public.vcut_admin_users(p_search text default '', p_offset int default 0, p_limit int default 25, p_deletions boolean default false)
returns jsonb language sql security definer set search_path = public, pg_temp as $$
 with users as (
  select u.id, u.email, u.created_at, u.last_sign_in_at, p.display_name, p.username,
    coalesce(p.plan, 'free') as plan, coalesce(p.credits_remaining, 0) as credits_remaining,
    coalesce(c.suspended, false) as suspended,
    u.raw_user_meta_data->>'deletion_requested_at' as deletion_requested_at,
    left(u.raw_user_meta_data->>'deletion_reason', 2000) as deletion_reason,
    c.deletion_reviewed_at,
    (select count(*) from projects_index x where x.owner_id = u.id) as project_count,
    (select coalesce(sum(size_bytes),0) from user_media m where m.owner_id = u.id) as media_bytes
  from auth.users u left join profiles p on p.id = u.id left join vcut_admin_user_controls c on c.user_id = u.id
  where (p_search = '' or position(lower(p_search) in lower(concat_ws(' ', u.id::text,u.email,p.display_name,p.username))) > 0)
    and (not p_deletions or u.raw_user_meta_data->>'deletion_requested_at' is not null)
 )
 select jsonb_build_object('count', (select count(*) from users), 'rows', coalesce((select jsonb_agg(to_jsonb(r)) from
   (select * from users order by created_at desc, id limit greatest(1,least(p_limit,50)) offset greatest(0,p_offset)) r), '[]'::jsonb));
$$;

create function public.vcut_admin_overview(p_days int default 30)
returns jsonb language sql security definer set search_path = public, pg_temp as $$
 with jobs as (select * from vcut_export_jobs where p_days = 0 or created_at >= now() - make_interval(days => p_days)),
 daily as (
  select d::date as day,
   count(j.id) filter (where j.status = 'completed') as completed,
   count(j.id) filter (where j.status = 'failed') as failed
  from generate_series((now() at time zone 'UTC')::date - (case when p_days = 0 then 29 else p_days - 1 end), (now() at time zone 'UTC')::date, interval '1 day') d
  left join jobs j on (j.created_at at time zone 'UTC')::date = d::date group by d order by d
 )
 select jsonb_build_object(
  'users', (select count(*) from auth.users), 'projects', (select count(*) from projects_index),
  'libraryBytes', (select coalesce(sum(size_bytes),0) from user_media),
  'pendingFeedback', (select count(*) from user_feedback where status in ('pending','reviewing')),
  'pendingReports', (select count(*) from content_reports where status in ('pending','reviewing')),
  'pendingDeletions', (select count(*) from auth.users u left join vcut_admin_user_controls c on c.user_id=u.id where u.raw_user_meta_data->>'deletion_requested_at' is not null and (c.deletion_reviewed_at is null or u.raw_user_meta_data->>'deletion_requested_at' > to_char(c.deletion_reviewed_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))),
  'subscriptions', (select count(*) from subscriptions where status in ('active','trialing','in_grace_period')),
  'exports', (select jsonb_build_object(
    'total',count(*), 'completed',count(*) filter(where status='completed'), 'failed',count(*) filter(where status='failed'),
    'cancelled',count(*) filter(where status='cancelled'),
    'successfulProjects',count(distinct project_id) filter(where status='completed'),
    'failedProjects',count(distinct project_id) filter(where status='failed'),
    'averageSeconds',avg(extract(epoch from completed_at-started_at)) filter(where status='completed')) from jobs),
  'queue', (select jsonb_build_object('queued',count(*) filter(where status='queued'), 'processing',count(*) filter(where status='processing'),
    'stalled',count(*) filter(where status='processing' and (heartbeat_at is null or heartbeat_at < now()-interval '90 seconds'))) from vcut_export_jobs),
  'daily', (select jsonb_agg(to_jsonb(daily)) from daily)
 );
$$;

create function public.vcut_admin_project_outcomes(p_ids text[])
returns table(project_id text,completed bigint,failed bigint,active bigint)
language sql security definer set search_path=public,pg_temp as $$
 select project_id,count(*) filter(where status='completed'),count(*) filter(where status='failed'),count(*) filter(where status in ('queued','processing'))
 from vcut_export_jobs where project_id=any(p_ids) group by project_id;
$$;
revoke all on function public.vcut_admin_project_outcomes(text[]) from public,anon,authenticated;
grant execute on function public.vcut_admin_project_outcomes(text[]) to service_role;

-- One transaction updates the resource and records why. Failure to audit rolls back the change.
create function public.vcut_admin_action(p_actor_id uuid, p_action text, p_target text, p_value jsonb, p_reason text, p_request_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare n int; old_balance int; new_balance int; amount int; details jsonb := jsonb_build_object('input',p_value); prior vcut_admin_audit%rowtype;
begin
 if p_request_id is null then raise exception 'Request ID required'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_request_id::text,0));
 select * into prior from vcut_admin_audit where id=p_request_id;
 if found then
  if prior.actor_id<>p_actor_id or prior.action<>p_action or prior.target_id<>p_target or prior.details->'input' is distinct from p_value then raise exception 'Request ID already used'; end if;
  return jsonb_build_object('ok',true,'details',prior.details,'replayed',true);
 end if;
 if length(trim(p_reason)) < 5 or length(p_reason) > 1000 then raise exception 'A reason is required'; end if;
 if not exists(select 1 from auth.users where id=p_actor_id) then raise exception 'Invalid actor'; end if;
 case p_action
 when 'user_suspend', 'user_restore', 'deletion_acknowledge' then
  if not exists(select 1 from auth.users where id=p_target::uuid) then raise exception 'User not found'; end if;
  if p_action='user_suspend' and p_target::uuid=p_actor_id then raise exception 'Cannot suspend yourself'; end if;
  insert into vcut_admin_user_controls(user_id) values(p_target::uuid) on conflict do nothing;
  if p_action='deletion_acknowledge' then
   update vcut_admin_user_controls set deletion_reviewed_at=now(),updated_at=now() where user_id=p_target::uuid;
  else
   update vcut_admin_user_controls set suspended=(p_action='user_suspend'),updated_at=now() where user_id=p_target::uuid;
  end if;
 when 'credits_adjust' then
  amount := (p_value->>'amount')::int;
  if amount is null or amount=0 or abs(amount)>10000 then raise exception 'Invalid credit adjustment'; end if;
  if not exists(select 1 from auth.users where id=p_target::uuid) then raise exception 'User not found'; end if;
  insert into profiles(id) values(p_target::uuid) on conflict do nothing;
  select credits_remaining into old_balance from profiles where id=p_target::uuid for update;
  new_balance := old_balance + amount;
  if new_balance < 0 or new_balance > 1000000 then raise exception 'Credit balance would be out of range'; end if;
  update profiles set credits_remaining=new_balance,updated_at=now() where id=p_target::uuid;
  details := details || jsonb_build_object('before',old_balance,'after',new_balance,'amount',amount);
  insert into credit_transactions(user_id,provider,provider_transaction_id,credits_amount,type,status,raw_data)
  values(p_target::uuid,'system','admin:'||gen_random_uuid()::text,amount,'bonus','completed',jsonb_build_object('actor_id',p_actor_id,'reason',p_reason));
 when 'project_restrict', 'project_restore' then
  if not exists(select 1 from projects_index where id=p_target) then raise exception 'Project not found'; end if;
  insert into vcut_admin_project_controls(project_id,restricted) values(p_target,p_action='project_restrict')
  on conflict(project_id) do update set restricted=excluded.restricted,updated_at=now();
 when 'export_cancel' then
  update vcut_export_jobs set cancellation_requested=true,
    status=case when status='queued' then 'cancelled' else status end,
    completed_at=case when status='queued' then now() else completed_at end
  where id=p_target::uuid and status in ('queued','processing');
  get diagnostics n = row_count; if n=0 then raise exception 'Export is no longer active'; end if;
 when 'feedback_status' then
  if not coalesce(p_value->>'status' in ('pending','reviewing','resolved'),false) then raise exception 'Invalid feedback status'; end if;
  update user_feedback set status=p_value->>'status',reviewed_at=now() where id=p_target::uuid;
  get diagnostics n = row_count; if n=0 then raise exception 'Feedback not found'; end if;
 when 'report_status' then
  if not coalesce(p_value->>'status' in ('pending','reviewing','resolved','dismissed'),false) then raise exception 'Invalid report status'; end if;
  update content_reports set status=p_value->>'status',reviewed_at=now() where id=p_target::uuid;
  get diagnostics n = row_count; if n=0 then raise exception 'Report not found'; end if;
 when 'template_unpublish' then
  insert into vcut_admin_template_controls(template_id,restricted) values(p_target,true) on conflict(template_id) do update set restricted=true,updated_at=now();
  update templates set is_public=false,updated_at=now() where id=p_target;
  get diagnostics n = row_count; if n=0 then raise exception 'Template not found'; end if;
 when 'template_restore' then
  update vcut_admin_template_controls set restricted=false,updated_at=now() where template_id=p_target;
  get diagnostics n = row_count; if n=0 then raise exception 'Template restriction not found'; end if;
 when 'comment_remove' then
  delete from template_comments where id=p_target returning jsonb_build_object('template_id',template_id,'user_id',user_id) into details;
  if details is null then raise exception 'Comment not found'; end if;
 when 'media_hide', 'media_restore' then
  update user_media set hidden=(p_action='media_hide') where id=p_target;
  get diagnostics n = row_count; if n=0 then raise exception 'Media not found'; end if;
 else raise exception 'Unknown admin action';
 end case;
 insert into vcut_admin_audit(id,actor_id,action,target_id,reason,details) values(p_request_id,p_actor_id,p_action,p_target,trim(p_reason),details || jsonb_build_object('input',p_value));
 return jsonb_build_object('ok',true,'details',details);
end;
$$;
revoke all on function public.vcut_admin_users(text,int,int,boolean), public.vcut_admin_overview(int), public.vcut_admin_action(uuid,text,text,jsonb,text,uuid) from public,anon,authenticated;
grant execute on function public.vcut_admin_users(text,int,int,boolean), public.vcut_admin_overview(int), public.vcut_admin_action(uuid,text,text,jsonb,text,uuid) to service_role;
commit;
