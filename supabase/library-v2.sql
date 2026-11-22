-- Atlas shared library v2: profiles, spaces (mini communities), roles, invites, join requests,
-- an inbox, and thumbs-up/down reactions. Applies on top of library.sql and moves its data into a
-- first space called "Atlas Friends".

-- Profiles: how people find each other. Email stays in auth.users and is only matched exactly.
create table public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  username text not null unique check (username ~ '^[a-z0-9_]{3,24}$'),
  display_name text not null check (char_length(display_name) between 1 and 60),
  avatar_color text not null default 'blue',
  created_at timestamptz not null default now()
);

insert into public.profiles (user_id, username, display_name)
select m.user_id,
  left(coalesce(nullif(regexp_replace(lower(m.display_name), '[^a-z0-9]', '', 'g'), ''), 'student'), 18)
    || '_' || substr(md5(m.user_id::text), 1, 4),
  m.display_name
from public.members m;

create table public.spaces (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null references public.profiles (user_id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  description text not null default '' check (char_length(description) <= 500),
  icon text not null default 'book-open' check (char_length(icon) <= 40),
  color text not null default 'blue' check (char_length(color) <= 20),
  banner text not null default 'sky' check (char_length(banner) <= 20),
  visibility text not null default 'private' check (visibility in ('private', 'public')),
  require_approval boolean not null default true,
  default_role text not null default 'viewer' check (default_role in ('viewer', 'editor')),
  join_code text not null unique check (join_code ~ '^[A-Z2-9]{8}$'),
  created_at timestamptz not null default now()
);

create table public.space_members (
  space_id uuid not null references public.spaces (id) on delete cascade,
  user_id uuid not null references public.profiles (user_id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'editor', 'viewer')),
  joined_at timestamptz not null default now(),
  primary key (space_id, user_id)
);
create index space_members_user on public.space_members (user_id);

create table public.invites (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces (id) on delete cascade,
  inviter uuid not null references public.profiles (user_id) on delete cascade,
  invitee uuid not null references public.profiles (user_id) on delete cascade,
  role text not null check (role in ('admin', 'editor', 'viewer')),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz not null default now()
);
create unique index invites_one_pending on public.invites (space_id, invitee) where status = 'pending';

create table public.join_requests (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces (id) on delete cascade,
  user_id uuid not null references public.profiles (user_id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'approved', 'declined')),
  decided_by uuid references public.profiles (user_id) on delete set null,
  created_at timestamptz not null default now()
);
create unique index join_requests_one_pending on public.join_requests (space_id, user_id) where status = 'pending';

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (user_id) on delete cascade,
  kind text not null check (kind in ('invite', 'join_request', 'request_approved', 'request_declined', 'invite_accepted', 'role_changed')),
  space_id uuid references public.spaces (id) on delete cascade,
  actor uuid references public.profiles (user_id) on delete set null,
  ref_id uuid,
  read boolean not null default false,
  created_at timestamptz not null default now()
);
create index notifications_user on public.notifications (user_id, created_at desc);

-- A random 8-character code from 32 unambiguous symbols: about 1.1 trillion combinations.
create function public.new_join_code() returns text
language plpgsql volatile set search_path = ''
as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  code text;
  bytes bytea;
begin
  loop
    bytes := extensions.gen_random_bytes(8);
    code := '';
    for i in 0..7 loop
      code := code || substr(alphabet, (get_byte(bytes, i) % 32) + 1, 1);
    end loop;
    exit when not exists (select 1 from public.spaces where join_code = code);
  end loop;
  return code;
end $$;

-- Move v1 data into a first space.
do $$
declare first_owner uuid; space uuid;
begin
  select user_id into first_owner from public.members order by joined_at limit 1;
  alter table public.items add column space_id uuid references public.spaces (id) on delete cascade;
  if first_owner is not null then
    insert into public.spaces (owner, name, description, icon, color, banner, join_code)
    values (first_owner, 'Atlas Friends', 'The first shared space.', 'users', 'blue', 'sky', public.new_join_code())
    returning id into space;
    insert into public.space_members (space_id, user_id, role)
    select space, m.user_id, case when m.user_id = first_owner then 'owner' else 'editor' end
    from public.members m;
    update public.items set space_id = space;
  end if;
end $$;

-- Drop v1 rules, views and helpers that the new model replaces.
drop view public.item_cards;
drop policy "members read items" on public.items;
drop policy "members add own items" on public.items;
drop policy "owners edit items" on public.items;
drop policy "owners delete items" on public.items;
drop policy "members read library files" on storage.objects;
drop policy "members upload to own folder" on storage.objects;
drop policy "members update own files" on storage.objects;
drop policy "members delete own files" on storage.objects;

alter table public.items alter column space_id set not null;
alter table public.items drop constraint items_owner_fkey;
alter table public.items add constraint items_owner_fkey foreign key (owner) references public.profiles (user_id) on delete cascade;
create index items_space on public.items (space_id, created_at desc);

create table public.reactions (
  item_id uuid not null references public.items (id) on delete cascade,
  user_id uuid not null references public.profiles (user_id) on delete cascade,
  value smallint not null check (value in (-1, 1)),
  created_at timestamptz not null default now(),
  primary key (item_id, user_id)
);
create index reactions_user on public.reactions (user_id);
insert into public.reactions (item_id, user_id, value) select item_id, user_id, 1 from public.likes;
drop table public.likes;

drop table public.library_settings;
drop table public.members;
drop function public.count_download(uuid);
drop function public.join_library(text, text);
drop function public.set_library_code(text);
drop function public.is_member();

-- Access helpers --------------------------------------------------------------

create function public.space_role(space uuid) returns text
language sql stable security definer set search_path = ''
as $$ select role from public.space_members where space_id = space and user_id = (select auth.uid()) $$;

create function public.can_write(space uuid) returns boolean
language sql stable security definer set search_path = ''
as $$ select coalesce(public.space_role(space) in ('owner', 'admin', 'editor'), false) $$;

create function public.can_manage(space uuid) returns boolean
language sql stable security definer set search_path = ''
as $$ select coalesce(public.space_role(space) in ('owner', 'admin'), false) $$;

create function public.notify(target uuid, what text, space uuid, ref uuid) returns void
language sql security definer set search_path = ''
as $$ insert into public.notifications (user_id, kind, space_id, actor, ref_id)
      values (target, what, space, (select auth.uid()), ref) $$;
revoke all on function public.notify(uuid, text, uuid, uuid) from public, anon, authenticated;

-- Spaces ----------------------------------------------------------------------

create function public.create_space(
  name text, description text, icon text, color text, banner text,
  visibility text, require_approval boolean, default_role text
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare me uuid := (select auth.uid()); new_space uuid;
begin
  if me is null or not exists (select 1 from public.profiles p where p.user_id = me) then
    raise exception 'Set up your profile first';
  end if;
  insert into public.spaces (owner, name, description, icon, color, banner, visibility, require_approval, default_role, join_code)
  values (me, trim(create_space.name), create_space.description, create_space.icon, create_space.color,
    create_space.banner, create_space.visibility, create_space.require_approval, create_space.default_role,
    public.new_join_code())
  returning id into new_space;
  insert into public.space_members (space_id, user_id, role) values (new_space, me, 'owner');
  return new_space;
end $$;

create function public.regenerate_code(space uuid) returns text
language plpgsql security definer set search_path = ''
as $$
declare new_code text;
begin
  if not public.can_manage(space) then raise exception 'Only owners and admins can do that'; end if;
  new_code := public.new_join_code();
  update public.spaces set join_code = new_code where id = space;
  return new_code;
end $$;

-- Joins straight away, or files a request for the owner and admins to approve.
create function public.join_by_code(code text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare me uuid := (select auth.uid()); s public.spaces; req uuid; admin uuid;
begin
  if me is null or not exists (select 1 from public.profiles p where p.user_id = me) then
    raise exception 'Set up your profile first';
  end if;
  select * into s from public.spaces x where x.join_code = upper(regexp_replace(code, '[^A-Za-z0-9]', '', 'g'));
  if s.id is null then raise exception 'No space has that code'; end if;
  if exists (select 1 from public.space_members m where m.space_id = s.id and m.user_id = me) then
    return jsonb_build_object('status', 'already', 'space_id', s.id, 'name', s.name);
  end if;
  if s.visibility = 'public' or not s.require_approval then
    insert into public.space_members (space_id, user_id, role) values (s.id, me, s.default_role);
    return jsonb_build_object('status', 'joined', 'space_id', s.id, 'name', s.name);
  end if;
  insert into public.join_requests (space_id, user_id) values (s.id, me)
  on conflict (space_id, user_id) where status = 'pending' do nothing
  returning id into req;
  if req is not null then
    for admin in select m.user_id from public.space_members m where m.space_id = s.id and m.role in ('owner', 'admin') loop
      perform public.notify(admin, 'join_request', s.id, req);
    end loop;
  end if;
  return jsonb_build_object('status', 'requested', 'space_id', s.id, 'name', s.name);
end $$;

create function public.decide_request(request uuid, approve boolean, new_role text) returns void
language plpgsql security definer set search_path = ''
as $$
declare r public.join_requests;
begin
  select * into r from public.join_requests where id = request and status = 'pending';
  if r.id is null then raise exception 'That request was already handled'; end if;
  if not public.can_manage(r.space_id) then raise exception 'Only owners and admins can do that'; end if;
  if new_role not in ('admin', 'editor', 'viewer') then raise exception 'Unknown role'; end if;
  update public.join_requests set status = case when approve then 'approved' else 'declined' end,
    decided_by = (select auth.uid()) where id = request;
  if approve then
    insert into public.space_members (space_id, user_id, role) values (r.space_id, r.user_id, new_role)
    on conflict do nothing;
  end if;
  perform public.notify(r.user_id, case when approve then 'request_approved' else 'request_declined' end, r.space_id, request);
  update public.notifications set read = true where ref_id = request and kind = 'join_request';
end $$;

create function public.invite_user(space uuid, target uuid, new_role text) returns void
language plpgsql security definer set search_path = ''
as $$
declare inv uuid;
begin
  if not public.can_manage(space) then raise exception 'Only owners and admins can invite'; end if;
  if new_role not in ('admin', 'editor', 'viewer') then raise exception 'Unknown role'; end if;
  if exists (select 1 from public.space_members m where m.space_id = space and m.user_id = target) then
    raise exception 'They are already in this space';
  end if;
  insert into public.invites (space_id, inviter, invitee, role) values (space, (select auth.uid()), target, new_role)
  on conflict (space_id, invitee) where status = 'pending' do update set role = excluded.role
  returning id into inv;
  perform public.notify(target, 'invite', space, inv);
end $$;

create function public.respond_invite(invite uuid, accept boolean) returns void
language plpgsql security definer set search_path = ''
as $$
declare i public.invites;
begin
  select * into i from public.invites x where x.id = invite and x.invitee = (select auth.uid()) and x.status = 'pending';
  if i.id is null then raise exception 'That invite is no longer open'; end if;
  update public.invites set status = case when accept then 'accepted' else 'declined' end where id = invite;
  if accept then
    insert into public.space_members (space_id, user_id, role) values (i.space_id, i.invitee, i.role)
    on conflict do nothing;
    perform public.notify(i.inviter, 'invite_accepted', i.space_id, invite);
  end if;
  update public.notifications set read = true where ref_id = invite and kind = 'invite';
end $$;

create function public.set_member_role(space uuid, target uuid, new_role text) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.can_manage(space) then raise exception 'Only owners and admins can change roles'; end if;
  if new_role not in ('admin', 'editor', 'viewer') then raise exception 'Unknown role'; end if;
  if exists (select 1 from public.space_members m where m.space_id = space and m.user_id = target and m.role = 'owner') then
    raise exception 'The owner keeps their role';
  end if;
  update public.space_members set role = new_role where space_id = space and user_id = target;
  perform public.notify(target, 'role_changed', space, null);
end $$;

create function public.remove_member(space uuid, target uuid) returns void
language plpgsql security definer set search_path = ''
as $$
declare me uuid := (select auth.uid());
begin
  if exists (select 1 from public.space_members m where m.space_id = space and m.user_id = target and m.role = 'owner') then
    raise exception 'The owner cannot leave; delete the space instead';
  end if;
  if target <> me and not public.can_manage(space) then raise exception 'Only owners and admins can remove people'; end if;
  delete from public.space_members where space_id = space and user_id = target;
end $$;

-- People search: by username or name, or by an exact email address (emails are never listed).
create function public.search_users(q text) returns table (user_id uuid, username text, display_name text, avatar_color text)
language sql stable security definer set search_path = ''
as $$
  select p.user_id, p.username, p.display_name, p.avatar_color
  from public.profiles p
  left join auth.users u on u.id = p.user_id
  where p.user_id <> (select auth.uid())
    and char_length(trim(q)) >= 2
    and (
      p.username like replace(replace(lower(trim(leading '@' from trim(q))), '%', ''), '_', '\_') || '%'
      or p.display_name ilike '%' || replace(replace(trim(q), '%', ''), '_', '\_') || '%'
      or lower(u.email) = lower(trim(q))
    )
  order by p.display_name
  limit 12
$$;

create function public.count_download(item uuid) returns void
language sql security definer set search_path = ''
as $$ update public.items set downloads = downloads + 1
      where id = item and public.space_role(space_id) is not null $$;

-- Views -----------------------------------------------------------------------

create view public.item_cards with (security_invoker = true) as
select
  i.id, i.space_id, i.owner, i.kind, i.title, i.description, i.subject, i.tags, i.file_name,
  i.file_size, i.link_url, i.remix_of, i.downloads, i.created_at, i.updated_at, i.search,
  p.display_name as author,
  (select count(*) from public.reactions r where r.item_id = i.id and r.value = 1)::int as ups,
  (select count(*) from public.reactions r where r.item_id = i.id and r.value = -1)::int as downs,
  coalesce((select r.value from public.reactions r where r.item_id = i.id and r.user_id = auth.uid()), 0)::int as my_reaction,
  (select count(*) from public.items x where x.remix_of = i.id)::int as remixes,
  char_length(i.body) as body_length
from public.items i
join public.profiles p on p.user_id = i.owner;

create view public.my_spaces with (security_invoker = true) as
select s.id, s.owner, s.name, s.description, s.icon, s.color, s.banner, s.visibility,
  s.require_approval, s.default_role, s.created_at, m.role,
  case when m.role in ('owner', 'admin') then s.join_code end as join_code,
  (select count(*) from public.space_members x where x.space_id = s.id)::int as member_count,
  (select count(*) from public.items x where x.space_id = s.id)::int as item_count
from public.spaces s
join public.space_members m on m.space_id = s.id and m.user_id = auth.uid();

-- Grants ----------------------------------------------------------------------

do $$
declare f text;
begin
  foreach f in array array[
    'space_role(uuid)', 'can_write(uuid)', 'can_manage(uuid)',
    'create_space(text, text, text, text, text, text, boolean, text)', 'regenerate_code(uuid)',
    'join_by_code(text)', 'decide_request(uuid, boolean, text)', 'invite_user(uuid, uuid, text)',
    'respond_invite(uuid, boolean)', 'set_member_role(uuid, uuid, text)', 'remove_member(uuid, uuid)',
    'search_users(text)', 'count_download(uuid)'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
  execute 'revoke all on function public.new_join_code() from public, anon, authenticated';
end $$;

-- Row level security ------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.spaces enable row level security;
alter table public.space_members enable row level security;
alter table public.invites enable row level security;
alter table public.join_requests enable row level security;
alter table public.notifications enable row level security;
alter table public.reactions enable row level security;

create policy "signed in see profiles" on public.profiles for select to authenticated using (true);
create policy "create own profile" on public.profiles for insert to authenticated with check (user_id = (select auth.uid()));
create policy "edit own profile" on public.profiles for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "members see spaces" on public.spaces for select to authenticated
  using (public.space_role(id) is not null);
create policy "managers edit spaces" on public.spaces for update to authenticated
  using (public.can_manage(id)) with check (public.can_manage(id));
create policy "owners delete spaces" on public.spaces for delete to authenticated
  using (owner = (select auth.uid()));

create policy "members see members" on public.space_members for select to authenticated
  using (public.space_role(space_id) is not null);

create policy "see own and managed invites" on public.invites for select to authenticated
  using (invitee = (select auth.uid()) or public.can_manage(space_id));
create policy "see own and managed requests" on public.join_requests for select to authenticated
  using (user_id = (select auth.uid()) or public.can_manage(space_id));

create policy "own notifications" on public.notifications for select to authenticated using (user_id = (select auth.uid()));
create policy "mark own notifications" on public.notifications for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "clear own notifications" on public.notifications for delete to authenticated using (user_id = (select auth.uid()));

create policy "members read items" on public.items for select to authenticated
  using (public.space_role(space_id) is not null);
create policy "writers add items" on public.items for insert to authenticated
  with check (owner = (select auth.uid()) and public.can_write(space_id));
create policy "authors and managers edit items" on public.items for update to authenticated
  using (owner = (select auth.uid()) or public.can_manage(space_id))
  with check (public.space_role(space_id) is not null);
create policy "authors and managers delete items" on public.items for delete to authenticated
  using (owner = (select auth.uid()) or public.can_manage(space_id));

create policy "members see reactions" on public.reactions for select to authenticated
  using (exists (select 1 from public.items i where i.id = item_id and public.space_role(i.space_id) is not null));
create policy "members react" on public.reactions for insert to authenticated
  with check (user_id = (select auth.uid()) and exists (select 1 from public.items i where i.id = item_id and public.space_role(i.space_id) is not null));
create policy "change own reaction" on public.reactions for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "remove own reaction" on public.reactions for delete to authenticated using (user_id = (select auth.uid()));

-- Storage: files live under <space id>/<uploader id>/...
create policy "members read space files" on storage.objects for select to authenticated using (
  bucket_id = 'library' and public.space_role(((storage.foldername(name))[1])::uuid) is not null
);
create policy "writers upload to own folder" on storage.objects for insert to authenticated with check (
  bucket_id = 'library' and public.can_write(((storage.foldername(name))[1])::uuid)
  and (storage.foldername(name))[2] = (select auth.uid())::text
);
create policy "writers replace own files" on storage.objects for update to authenticated using (
  bucket_id = 'library' and (storage.foldername(name))[2] = (select auth.uid())::text
);
create policy "uploaders and managers delete files" on storage.objects for delete to authenticated using (
  bucket_id = 'library' and (
    (storage.foldername(name))[2] = (select auth.uid())::text
    or public.can_manage(((storage.foldername(name))[1])::uuid)
  )
);
