-- Atlas shared library: schema, security rules and storage for one Supabase project.
-- Apply once to a fresh project (Supabase SQL editor, or the MCP apply_migration tool).
-- Then set the invite code:  select set_library_code('your-code');   (run as the project owner)

create extension if not exists pgcrypto with schema extensions;

-- People who entered the invite code.
create table public.members (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 60),
  joined_at timestamptz not null default now()
);

-- One row: the hashed invite code. Nobody can read it through the API.
create table public.library_settings (
  id int primary key default 1 check (id = 1),
  invite_hash text
);
insert into public.library_settings (id) values (1);

create table public.items (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null references public.members (user_id) on delete cascade,
  kind text not null check (kind in ('note', 'file', 'deck', 'link')),
  title text not null check (char_length(title) between 1 and 200),
  description text not null default '' check (char_length(description) <= 2000),
  subject text not null default '' check (char_length(subject) <= 80),
  tags text[] not null default '{}',
  -- note: Markdown. deck: JSON array of {front, back}.
  body text not null default '' check (char_length(body) <= 400000),
  file_path text,
  file_name text,
  file_size bigint,
  file_sha256 text,
  link_url text check (link_url is null or link_url ~ '^https://'),
  remix_of uuid references public.items (id) on delete set null,
  downloads int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Filled by a trigger (array_to_string is not immutable, so it cannot be a generated column).
  search tsvector
);
create index items_search on public.items using gin (search);
create index items_created on public.items (created_at desc);
create index items_owner on public.items (owner);
create index items_remix on public.items (remix_of);

create table public.likes (
  item_id uuid not null references public.items (id) on delete cascade,
  user_id uuid not null references public.members (user_id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (item_id, user_id)
);
create index likes_user on public.likes (user_id);

-- Items with author name and like counts, for the browse screen.
create view public.item_cards with (security_invoker = true) as
select
  i.id, i.owner, i.kind, i.title, i.description, i.subject, i.tags, i.file_name, i.file_size,
  i.link_url, i.remix_of, i.downloads, i.created_at, i.updated_at, i.search,
  m.display_name as author,
  (select count(*) from public.likes l where l.item_id = i.id)::int as likes,
  exists (select 1 from public.likes l where l.item_id = i.id and l.user_id = auth.uid()) as liked,
  (select count(*) from public.items r where r.remix_of = i.id)::int as remixes,
  char_length(i.body) as body_length
from public.items i
join public.members m on m.user_id = i.owner;

-- Helpers -------------------------------------------------------------------

create function public.is_member() returns boolean
language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.members where user_id = (select auth.uid())) $$;

create function public.join_library(code text, name text) returns void
language plpgsql security definer set search_path = ''
as $$
declare stored text;
begin
  if (select auth.uid()) is null then raise exception 'Sign in first'; end if;
  select invite_hash into stored from public.library_settings where id = 1;
  if stored is null or extensions.crypt(code, stored) <> stored then
    raise exception 'That library code is not right';
  end if;
  insert into public.members (user_id, display_name)
  values ((select auth.uid()), left(trim(name), 60))
  on conflict (user_id) do update set display_name = excluded.display_name;
end $$;

-- Owner-only: not exposed to the API roles.
create function public.set_library_code(code text) returns void
language sql security definer set search_path = ''
as $$ update public.library_settings set invite_hash = extensions.crypt(code, extensions.gen_salt('bf')) where id = 1 $$;
revoke all on function public.set_library_code(text) from public, anon, authenticated;

create function public.count_download(item uuid) returns void
language sql security definer set search_path = ''
as $$ update public.items set downloads = downloads + 1 where id = item and public.is_member() $$;

create function public.touch_updated_at() returns trigger
language plpgsql set search_path = ''
as $$ begin new.updated_at = now(); return new; end $$;
create trigger items_touch before update on public.items
for each row execute function public.touch_updated_at();

create function public.items_search_vector() returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.search :=
    setweight(to_tsvector('english'::regconfig, coalesce(new.title, '')), 'A') ||
    setweight(to_tsvector('english'::regconfig, coalesce(new.subject, '') || ' ' || array_to_string(new.tags, ' ')), 'B') ||
    setweight(to_tsvector('english'::regconfig, coalesce(new.description, '')), 'C') ||
    setweight(to_tsvector('english'::regconfig, left(coalesce(new.body, ''), 100000)), 'D');
  return new;
end $$;
create trigger items_search before insert or update on public.items
for each row execute function public.items_search_vector();

revoke all on function public.join_library(text, text) from public, anon;
grant execute on function public.join_library(text, text) to authenticated;
revoke all on function public.count_download(uuid) from public, anon;
grant execute on function public.count_download(uuid) to authenticated;
revoke all on function public.is_member() from public, anon;
grant execute on function public.is_member() to authenticated;

-- Row level security --------------------------------------------------------

alter table public.members enable row level security;
alter table public.library_settings enable row level security;
alter table public.items enable row level security;
alter table public.likes enable row level security;

create policy "members see members" on public.members
  for select to authenticated using ((select public.is_member()));
create policy "members rename themselves" on public.members
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "members leave" on public.members
  for delete to authenticated using (user_id = (select auth.uid()));

create policy "members read items" on public.items
  for select to authenticated using ((select public.is_member()));
create policy "members add own items" on public.items
  for insert to authenticated with check (owner = (select auth.uid()) and (select public.is_member()));
create policy "owners edit items" on public.items
  for update to authenticated using (owner = (select auth.uid())) with check (owner = (select auth.uid()));
create policy "owners delete items" on public.items
  for delete to authenticated using (owner = (select auth.uid()));

create policy "members read likes" on public.likes
  for select to authenticated using ((select public.is_member()));
create policy "members like" on public.likes
  for insert to authenticated with check (user_id = (select auth.uid()) and (select public.is_member()));
create policy "members unlike" on public.likes
  for delete to authenticated using (user_id = (select auth.uid()));

-- Storage: a private bucket; members read everything, write only under their own folder.
insert into storage.buckets (id, name, public, file_size_limit)
values ('library', 'library', false, 52428800)
on conflict (id) do nothing;

create policy "members read library files" on storage.objects
  for select to authenticated using (bucket_id = 'library' and (select public.is_member()));
create policy "members upload to own folder" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'library' and (select public.is_member())
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
-- Upserts (re-uploading the same file) need update as well as insert.
create policy "members update own files" on storage.objects
  for update to authenticated using (
    bucket_id = 'library' and (storage.foldername(name))[1] = (select auth.uid())::text
  );
create policy "members delete own files" on storage.objects
  for delete to authenticated using (
    bucket_id = 'library' and (storage.foldername(name))[1] = (select auth.uid())::text
  );
