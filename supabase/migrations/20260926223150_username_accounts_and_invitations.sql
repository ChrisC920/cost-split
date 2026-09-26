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
