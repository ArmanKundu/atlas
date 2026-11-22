-- Atlas access cap, waitlist, admin and bug reports. Applied as migrations
-- atlas_access_waitlist, atlas_feedback and atlas_capacity_status.

-- Who runs Atlas, and how many accounts it allows.
create table public.app_admins (user_id uuid primary key references auth.users (id) on delete cascade);
create table public.app_settings (
  id int primary key default 1 check (id = 1),
  max_accounts int not null default 5 check (max_accounts between 1 and 1000)
);
insert into public.app_settings (id) values (1);
-- One row per signed-in account: approved, or waiting for a place.
create table public.access (
  user_id uuid primary key references auth.users (id) on delete cascade,
  email text not null default '',
  status text not null check (status in ('approved', 'waitlisted')),
  created_at timestamptz not null default now(),
  decided_at timestamptz
);
alter table public.app_admins enable row level security;
alter table public.app_settings enable row level security;
alter table public.access enable row level security;

-- is_admin(), has_access(): security definer helpers.
-- claim_access(): after sign-in, takes a free place or joins the waitlist (advisory lock so two
--   sign-ups cannot both take the last place) and tells the admins about new waitlisters.
-- admin_access_list(), admin_set_access(target, 'approved'|'waitlisted'|'removed'),
-- admin_set_capacity(cap): admin only.
-- capacity_status(): callable signed out, so the sign-in screen can warn that Atlas is full.
-- Profiles can only be created by approved accounts, and space_role() returns null for anyone
-- who lost access, so removed people lose every space at once.
-- notifications.kind gains 'waitlist'.

-- Bug reports and feature requests: anyone signed in can send; only the admin reads.
create table public.feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null check (kind in ('bug', 'idea', 'other')),
  title text not null check (char_length(title) between 1 and 140),
  body text not null default '' check (char_length(body) <= 8000),
  attachment text,
  app_version text not null default '',
  platform text not null default '',
  status text not null default 'new' check (status in ('new', 'seen', 'done')),
  created_at timestamptz not null default now()
);
-- Private storage bucket 'feedback' (50 MB per file), files under <uid>/, readable by the admin.
