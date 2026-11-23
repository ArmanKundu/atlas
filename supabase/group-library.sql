-- Group library (23 Nov): one shared space for the whole group, and richer resources.
--
-- * spaces.is_group: everyone with an account is added to group spaces as an editor when their
--   profile is made, so everything shared there is public to the group by default.
-- * items gain units (1-4), a material type, the teacher who made it, and an AI summary and
--   text version written by the uploader's own AI (Atlas never pays for AI).
-- * Search covers the teacher, the summary and the text version too.

alter table public.spaces add column if not exists is_group boolean not null default false;
update public.spaces set is_group = true where name = 'Atlas Friends';

create or replace function public.join_group_spaces() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.space_members (space_id, user_id, role)
  select s.id, new.user_id, 'editor' from public.spaces s where s.is_group
  on conflict do nothing;
  return new;
end $$;
revoke all on function public.join_group_spaces() from public, anon, authenticated;
drop trigger if exists profiles_join_group on public.profiles;
create trigger profiles_join_group after insert on public.profiles
for each row execute function public.join_group_spaces();

-- Anyone who already has a profile joins the group spaces now.
insert into public.space_members (space_id, user_id, role)
select s.id, p.user_id, 'editor' from public.spaces s cross join public.profiles p where s.is_group
on conflict do nothing;

alter table public.items
  add column if not exists units smallint[] not null default '{}'
    check (units <@ array[1, 2, 3, 4]::smallint[]),
  add column if not exists material text not null default 'other'
    check (material in ('pdf', 'slides', 'document', 'image', 'video', 'audio', 'notes', 'link',
                        'exam', 'report', 'worksheet', 'timetable', 'flashcards', 'other')),
  add column if not exists teacher text not null default '' check (char_length(teacher) <= 80),
  add column if not exists ai_summary text not null default '' check (char_length(ai_summary) <= 20000),
  add column if not exists ai_text text not null default '' check (char_length(ai_text) <= 400000),
  add column if not exists ai_by text not null default '' check (char_length(ai_by) <= 80);

create index if not exists items_subject on public.items (subject);
create index if not exists items_units on public.items using gin (units);
create index if not exists items_teacher on public.items (teacher);

create or replace function public.items_search_vector() returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.search :=
    setweight(to_tsvector('english'::regconfig, coalesce(new.title, '')), 'A') ||
    setweight(to_tsvector('english'::regconfig,
      coalesce(new.subject, '') || ' ' || array_to_string(new.tags, ' ') || ' ' ||
      coalesce(new.teacher, '') || ' ' || coalesce(new.material, '')), 'B') ||
    setweight(to_tsvector('english'::regconfig,
      coalesce(new.description, '') || ' ' || left(coalesce(new.ai_summary, ''), 20000)), 'C') ||
    setweight(to_tsvector('english'::regconfig,
      left(coalesce(new.body, ''), 100000) || ' ' || left(coalesce(new.ai_text, ''), 100000)), 'D');
  return new;
end $$;

-- Views gain the new fields (appended so existing columns keep their places):
--   item_cards: units, material, teacher, ai_summary, ai_by, ai_text_length (= char_length(ai_text))
--   my_spaces: is_group
