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
