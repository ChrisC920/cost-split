-- Applied to the Cost Split Supabase project on 2026-09-26 via MCP.
-- This is the reproducible schema for a fresh project, not a pending migration.
create schema if not exists private;
revoke all on function public.rls_auto_enable() from public, anon, authenticated;

create table public.cost_groups (
  id text primary key,
  owner_uid uuid not null references auth.users(id),
  invite_code uuid not null unique default gen_random_uuid(),
  data jsonb not null,
  version bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cost_groups_has_member check (jsonb_array_length(data->'members') > 0)
);

create table public.cost_group_users (
  group_id text not null references public.cost_groups(id) on delete cascade,
  user_uid uuid not null references auth.users(id) on delete cascade,
  member_id text not null,
  joined_at timestamptz not null default now(),
  primary key (group_id, user_uid),
  unique (group_id, member_id)
);

create table public.cost_receipt_claims (
  group_id text not null references public.cost_groups(id) on delete cascade,
  entry_id text not null,
  item_id text not null,
  user_uid uuid not null references auth.users(id) on delete cascade,
  member_id text not null,
  selected boolean not null,
  updated_at timestamptz not null default now(),
  primary key (group_id, entry_id, item_id, user_uid)
);

create index cost_receipt_claims_group_idx on public.cost_receipt_claims(group_id);
create index cost_group_users_user_idx on public.cost_group_users(user_uid);

alter table public.cost_groups enable row level security;
alter table public.cost_group_users enable row level security;
alter table public.cost_receipt_claims enable row level security;

revoke all on public.cost_groups, public.cost_group_users, public.cost_receipt_claims from anon, authenticated;
grant select, insert, delete on public.cost_groups to authenticated;
grant update(data, version, updated_at) on public.cost_groups to authenticated;
grant select on public.cost_group_users to authenticated;
grant select, insert, update, delete on public.cost_receipt_claims to authenticated;

create policy cost_groups_read on public.cost_groups for select to authenticated
  using (exists (select 1 from public.cost_group_users u where u.group_id = id and u.user_uid = (select auth.uid())));
create policy cost_groups_insert on public.cost_groups for insert to authenticated
  with check (owner_uid = (select auth.uid()));
create policy cost_groups_update on public.cost_groups for update to authenticated
  using (exists (select 1 from public.cost_group_users u where u.group_id = id and u.user_uid = (select auth.uid())))
  with check (exists (select 1 from public.cost_group_users u where u.group_id = id and u.user_uid = (select auth.uid())));
create policy cost_groups_delete on public.cost_groups for delete to authenticated
  using (owner_uid = (select auth.uid()));

create policy cost_group_users_read on public.cost_group_users for select to authenticated
  using (user_uid = (select auth.uid()));

create policy cost_claims_read on public.cost_receipt_claims for select to authenticated
  using (exists (select 1 from public.cost_group_users u where u.group_id = cost_receipt_claims.group_id and u.user_uid = (select auth.uid())));
create policy cost_claims_insert on public.cost_receipt_claims for insert to authenticated
  with check (user_uid = (select auth.uid()) and exists (
    select 1 from public.cost_group_users u where u.group_id = cost_receipt_claims.group_id
      and u.user_uid = (select auth.uid()) and u.member_id = cost_receipt_claims.member_id
  ));
create policy cost_claims_update on public.cost_receipt_claims for update to authenticated
  using (user_uid = (select auth.uid()))
  with check (user_uid = (select auth.uid()) and exists (
    select 1 from public.cost_group_users u where u.group_id = cost_receipt_claims.group_id
      and u.user_uid = (select auth.uid()) and u.member_id = cost_receipt_claims.member_id
  ));
create policy cost_claims_delete on public.cost_receipt_claims for delete to authenticated
  using (user_uid = (select auth.uid()));

create function private.cost_group_created() returns trigger language plpgsql security definer
set search_path = '' as $$
begin
  insert into public.cost_group_users(group_id, user_uid, member_id)
  values (new.id, new.owner_uid, new.data->'members'->0->>'id');
  return new;
end;
$$;
create trigger cost_group_created after insert on public.cost_groups
for each row execute function private.cost_group_created();

create function private.cost_group_members_valid() returns trigger language plpgsql security definer
set search_path = '' as $$
begin
  if exists (select 1 from public.cost_group_users u where u.group_id = new.id and not exists (
    select 1 from jsonb_array_elements(new.data->'members') m where m->>'id' = u.member_id
  )) then
    raise exception 'A joined person cannot be removed from the group';
  end if;
  return new;
end;
$$;
create trigger cost_group_members_valid before update of data on public.cost_groups
for each row execute function private.cost_group_members_valid();

create function private.preview_cost_invite(p_code uuid) returns jsonb language plpgsql security definer
set search_path = '' as $$
declare result jsonb;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  select jsonb_build_object('id', g.id, 'name', g.data->>'name', 'members', g.data->'members',
    'claimed', coalesce((select jsonb_agg(u.member_id) from public.cost_group_users u where u.group_id = g.id), '[]'::jsonb))
  into result from public.cost_groups g where g.invite_code = p_code;
  return result;
end;
$$;

create function private.join_cost_group(p_code uuid, p_member_id text) returns text language plpgsql security definer
set search_path = '' as $$
declare target_id text; result_member text;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  select g.id into target_id from public.cost_groups g where g.invite_code = p_code for update;
  if target_id is null then raise exception 'Invite not found'; end if;
  select m->>'id' into result_member from public.cost_groups g,
    jsonb_array_elements(g.data->'members') m
    where g.id = target_id and m->>'id' = p_member_id;
  if result_member is null then raise exception 'Person not found'; end if;
  insert into public.cost_group_users(group_id, user_uid, member_id)
  values (target_id, auth.uid(), p_member_id)
  on conflict (group_id, user_uid) do nothing;
  if not exists (select 1 from public.cost_group_users u where u.group_id = target_id
    and u.user_uid = auth.uid() and u.member_id = p_member_id) then
    raise exception 'This person is already taken, or you joined as someone else';
  end if;
  return target_id;
end;
$$;

create function public.preview_cost_invite(p_code uuid) returns jsonb language sql security invoker
set search_path = '' as $$ select private.preview_cost_invite(p_code); $$;
create function public.join_cost_group(p_code uuid, p_member_id text) returns text language sql security invoker
set search_path = '' as $$ select private.join_cost_group(p_code, p_member_id); $$;

revoke all on function private.cost_group_created(), private.cost_group_members_valid(), private.preview_cost_invite(uuid), private.join_cost_group(uuid,text) from public, anon, authenticated;
grant usage on schema private to authenticated;
grant execute on function private.preview_cost_invite(uuid), private.join_cost_group(uuid,text) to authenticated;
revoke all on function public.preview_cost_invite(uuid), public.join_cost_group(uuid,text) from public, anon;
grant execute on function public.preview_cost_invite(uuid), public.join_cost_group(uuid,text) to authenticated;

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('cost-receipts', 'cost-receipts', false, 8000000, array['image/jpeg', 'image/png', 'image/webp']);

create policy cost_receipts_read on storage.objects for select to authenticated
  using (bucket_id = 'cost-receipts' and exists (
    select 1 from public.cost_group_users u where u.group_id = (storage.foldername(name))[1]
      and u.user_uid = (select auth.uid())
  ));
create policy cost_receipts_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'cost-receipts' and exists (
    select 1 from public.cost_group_users u where u.group_id = (storage.foldername(name))[1]
      and u.user_uid = (select auth.uid())
  ));
create policy cost_receipts_delete on storage.objects for delete to authenticated
  using (bucket_id = 'cost-receipts' and exists (
    select 1 from public.cost_group_users u where u.group_id = (storage.foldername(name))[1]
      and u.user_uid = (select auth.uid())
  ));
create policy cost_receipts_update on storage.objects for update to authenticated
  using (bucket_id = 'cost-receipts' and exists (
    select 1 from public.cost_group_users u where u.group_id = (storage.foldername(name))[1]
      and u.user_uid = (select auth.uid())
  ))
  with check (bucket_id = 'cost-receipts' and exists (
    select 1 from public.cost_group_users u where u.group_id = (storage.foldername(name))[1]
      and u.user_uid = (select auth.uid())
  ));

alter publication supabase_realtime add table public.cost_groups, public.cost_receipt_claims;
-- Usernames are backed by Supabase email/password identities using a reserved,
-- non-deliverable domain. No email is sent or used for account recovery.
create table public.cost_profiles (
  user_uid uuid primary key references auth.users(id) on delete cascade,
  username text not null unique,
  constraint cost_profiles_username_format check (username ~ '^[a-z][a-z0-9_]{2,23}$')
);
alter table public.cost_profiles enable row level security;
revoke all on public.cost_profiles from anon, authenticated;
grant select on public.cost_profiles to authenticated;
create policy cost_profiles_own on public.cost_profiles for select to authenticated
  using (user_uid = (select auth.uid()));

create function private.cost_profile_from_auth() returns trigger language plpgsql security definer
set search_path = '' as $$
declare handle text;
begin
  if new.email is null or new.email not like '%@costsplit.invalid' then return new; end if;
  handle := lower(split_part(new.email, '@', 1));
  if handle !~ '^[a-z][a-z0-9_]{2,23}$' then raise exception 'Invalid username'; end if;
  insert into public.cost_profiles(user_uid, username) values (new.id, handle)
  on conflict (user_uid) do update set username = excluded.username;
  return new;
end;
$$;
create trigger cost_profile_from_auth after insert or update of email on auth.users
for each row execute function private.cost_profile_from_auth();

create table public.cost_group_invitations (
  group_id text not null references public.cost_groups(id) on delete cascade,
  invited_uid uuid not null references auth.users(id) on delete cascade,
  member_id text not null,
  group_name text not null,
  invited_at timestamptz not null default now(),
  primary key (group_id, invited_uid),
  unique (group_id, member_id)
);
alter table public.cost_group_invitations enable row level security;
revoke all on public.cost_group_invitations from anon, authenticated;
grant select on public.cost_group_invitations to authenticated;
create policy cost_invitations_own on public.cost_group_invitations for select to authenticated
  using (invited_uid = (select auth.uid()));

create function private.invite_cost_username(p_group_id text, p_username text) returns void
language plpgsql security definer set search_path = '' as $$
declare target_uid uuid; target_member text; group_row public.cost_groups%rowtype;
begin
  if not exists (select 1 from public.cost_profiles where user_uid = auth.uid()) then
    raise exception 'Sign in with a username first';
  end if;
  select * into group_row from public.cost_groups where id = p_group_id for update;
  if group_row.id is null then raise exception 'Group not found'; end if;
  if group_row.owner_uid <> auth.uid() then raise exception 'Only the group owner can invite people'; end if;
  select user_uid into target_uid from public.cost_profiles where username = lower(trim(p_username));
  if target_uid is null then raise exception 'Username not found'; end if;
  if exists (select 1 from public.cost_group_users where group_id = p_group_id and user_uid = target_uid) then
    raise exception 'This user is already in the group';
  end if;
  if exists (select 1 from public.cost_group_invitations where group_id = p_group_id and invited_uid = target_uid) then
    raise exception 'This user has already been invited';
  end if;
  target_member := replace(gen_random_uuid()::text, '-', '');
  update public.cost_groups set data = jsonb_set(data, '{members}', (data->'members') ||
    jsonb_build_array(jsonb_build_object('id', target_member, 'name', lower(trim(p_username)),
      'colorIndex', jsonb_array_length(data->'members')))),
    version = version + 1, updated_at = now() where id = p_group_id;
  insert into public.cost_group_invitations(group_id, invited_uid, member_id, group_name)
    values (p_group_id, target_uid, target_member, group_row.data->>'name');
end;
$$;

create function private.accept_cost_invitation(p_group_id text) returns text
language plpgsql security definer set search_path = '' as $$
declare target_member text;
begin
  select member_id into target_member from public.cost_group_invitations
    where group_id = p_group_id and invited_uid = auth.uid() for update;
  if target_member is null then raise exception 'Invitation not found'; end if;
  insert into public.cost_group_users(group_id, user_uid, member_id)
    values (p_group_id, auth.uid(), target_member);
  delete from public.cost_group_invitations
    where group_id = p_group_id and invited_uid = auth.uid();
  return p_group_id;
end;
$$;

create function public.invite_cost_username(p_group_id text, p_username text) returns void
language sql security invoker set search_path = '' as $$
  select private.invite_cost_username(p_group_id, p_username);
$$;
create function public.accept_cost_invitation(p_group_id text) returns text
language sql security invoker set search_path = '' as $$
  select private.accept_cost_invitation(p_group_id);
$$;
revoke all on function private.cost_profile_from_auth(), private.invite_cost_username(text,text),
  private.accept_cost_invitation(text) from public, anon, authenticated;
grant execute on function private.invite_cost_username(text,text), private.accept_cost_invitation(text) to authenticated;
revoke all on function public.invite_cost_username(text,text), public.accept_cost_invitation(text) from public, anon;
grant execute on function public.invite_cost_username(text,text), public.accept_cost_invitation(text) to authenticated;
revoke execute on function public.preview_cost_invite(uuid), public.join_cost_group(uuid,text) from authenticated;
revoke execute on function private.preview_cost_invite(uuid), private.join_cost_group(uuid,text) from authenticated;
create or replace function private.invite_cost_username(p_group_id text, p_username text) returns void
language plpgsql security definer set search_path = '' as $$
declare target_uid uuid; target_member text; group_row public.cost_groups%rowtype;
begin
  if not exists (select 1 from public.cost_profiles where user_uid = auth.uid()) then
    raise exception 'Sign in with a username first';
  end if;
  select * into group_row from public.cost_groups where id = p_group_id for update;
  if group_row.id is null then raise exception 'Group not found'; end if;
  if group_row.owner_uid <> auth.uid() then raise exception 'Only the group owner can invite people'; end if;
  select user_uid into target_uid from public.cost_profiles where username = lower(trim(p_username));
  if target_uid is null then raise exception 'Username not found'; end if;
  if exists (select 1 from public.cost_group_users where group_id = p_group_id and user_uid = target_uid) then
    raise exception 'This user is already in the group';
  end if;
  if exists (select 1 from public.cost_group_invitations where group_id = p_group_id and invited_uid = target_uid) then
    raise exception 'This user has already been invited';
  end if;
  select m->>'id' into target_member from jsonb_array_elements(group_row.data->'members') m
  where lower(m->>'name') = lower(trim(p_username))
    and not exists (select 1 from public.cost_group_users u where u.group_id = p_group_id and u.member_id = m->>'id')
    and not exists (select 1 from public.cost_group_invitations i where i.group_id = p_group_id and i.member_id = m->>'id')
  limit 1;
  if target_member is null then
    target_member := replace(gen_random_uuid()::text, '-', '');
    update public.cost_groups set data = jsonb_set(data, '{members}', (data->'members') ||
      jsonb_build_array(jsonb_build_object('id', target_member, 'name', lower(trim(p_username)),
        'colorIndex', jsonb_array_length(data->'members')))),
      version = version + 1, updated_at = now() where id = p_group_id;
  end if;
  insert into public.cost_group_invitations(group_id, invited_uid, member_id, group_name)
    values (p_group_id, target_uid, target_member, group_row.data->>'name');
end;
$$;
alter publication supabase_realtime add table public.cost_group_invitations;
