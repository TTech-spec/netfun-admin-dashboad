-- NetFun admin: admins, official posts on the home feed, game tournaments
-- (criteria, banner, applications the admin accepts or rejects), and user
-- moderation (block from tournaments, ban from NetFun).
--
-- Run this once in the Supabase SQL editor of the SAME project the NetFun app
-- uses, after the core migrations. It's safe to run again.
--
-- Then make yourself an admin (change the email to your NetFun login):
--   insert into public.app_admins (user_id)
--   select id from auth.users where email = 'you@example.com'
--   on conflict do nothing;

-- -----------------------------------------------------------------------------
-- Admins
-- -----------------------------------------------------------------------------

create table if not exists public.app_admins (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.app_admins enable row level security;

-- Admins are added from the SQL editor only; people may only check themselves.
drop policy if exists "admins see self" on public.app_admins;
create policy "admins see self" on public.app_admins for select to authenticated
  using (user_id = auth.uid());

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.app_admins where user_id = auth.uid());
$$;

grant execute on function public.is_admin() to authenticated;

-- -----------------------------------------------------------------------------
-- Moderation columns on profiles
-- -----------------------------------------------------------------------------

alter table public.profiles add column if not exists banned_at             timestamptz;
alter table public.profiles add column if not exists ban_reason            text not null default '';
alter table public.profiles add column if not exists tournament_blocked_at timestamptz;

-- People can edit their own profile, but never their own ban or block.
create or replace function public.guard_profile_moderation()
returns trigger
language plpgsql
as $$
begin
  if current_user = 'authenticated' and (
    new.banned_at is distinct from old.banned_at or
    new.ban_reason is distinct from old.ban_reason or
    new.tournament_blocked_at is distinct from old.tournament_blocked_at
  ) then
    raise exception 'moderation_fields_locked';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_guard_moderation on public.profiles;
create trigger profiles_guard_moderation
  before update on public.profiles
  for each row execute function public.guard_profile_moderation();

create or replace function public.is_banned(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.profiles where id = uid and banned_at is not null);
$$;

-- Banned people can't write anything: a restrictive policy refuses their
-- inserts on top of the existing policies (covers a session still open when
-- the ban lands).
do $$
declare
  t text;
begin
  foreach t in array array[
    'posts', 'post_likes', 'post_comments', 'messages', 'friend_requests',
    'whatsapp_requests', 'communities', 'community_members', 'community_join_requests'
  ] loop
    execute format('drop policy if exists "banned cannot write" on public.%I', t);
    execute format(
      'create policy "banned cannot write" on public.%I as restrictive for insert to authenticated
         with check (not public.is_banned(auth.uid()))', t);
  end loop;
end;
$$;

-- -----------------------------------------------------------------------------
-- Tournaments
-- -----------------------------------------------------------------------------

create table if not exists public.tournaments (
  id                     uuid primary key default gen_random_uuid(),
  title                  text not null check (char_length(title) between 3 and 80),
  game                   text not null default '' check (char_length(game) <= 60),
  description            text not null default '' check (char_length(description) <= 2000),
  -- What players must meet to be accepted, one line each.
  criteria               text[] not null default '{}',
  -- Asked on the application form, e.g. "Your CODM UID and rank".
  entry_question         text not null default '' check (char_length(entry_question) <= 200),
  format                 text not null default '' check (char_length(format) <= 100),
  prize                  text not null default '' check (char_length(prize) <= 200),
  max_participants       int check (max_participants is null or max_participants between 2 and 10000),
  starts_at              timestamptz,
  registration_closes_at timestamptz,
  banner_path            text,
  status                 text not null default 'draft'
                           check (status in ('draft', 'open', 'closed', 'live', 'completed', 'cancelled')),
  created_by             uuid references public.profiles (id) on delete set null,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create index if not exists tournaments_status_idx on public.tournaments (status, starts_at);

create or replace function public.touch_tournament()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists tournaments_touch on public.tournaments;
create trigger tournaments_touch
  before update on public.tournaments
  for each row execute function public.touch_tournament();

create table if not exists public.tournament_entries (
  id            uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  user_id       uuid not null references public.profiles (id) on delete cascade,
  in_game_name  text not null default '' check (char_length(in_game_name) <= 60),
  answer        text not null default '' check (char_length(answer) <= 500),
  status        text not null default 'pending' check (status in ('pending', 'accepted', 'rejected')),
  admin_note    text not null default '' check (char_length(admin_note) <= 300),
  created_at    timestamptz not null default now(),
  reviewed_at   timestamptz,
  unique (tournament_id, user_id)
);

create index if not exists tournament_entries_tournament_idx
  on public.tournament_entries (tournament_id, status, created_at);

-- Applications are only taken while a tournament is open, not full, and
-- from people who aren't blocked. They always start as pending.
create or replace function public.check_tournament_entry()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  t public.tournaments;
begin
  select * into t from public.tournaments where id = new.tournament_id;
  if t.id is null or t.status <> 'open' then
    raise exception 'tournament_not_open';
  end if;
  if t.registration_closes_at is not null and t.registration_closes_at < now() then
    raise exception 'tournament_registration_closed';
  end if;
  if exists (select 1 from public.profiles where id = new.user_id and tournament_blocked_at is not null) then
    raise exception 'tournament_blocked';
  end if;
  if t.max_participants is not null and (
    select count(*) from public.tournament_entries
    where tournament_id = t.id and status = 'accepted'
  ) >= t.max_participants then
    raise exception 'tournament_full';
  end if;
  new.status := 'pending';
  new.admin_note := '';
  new.reviewed_at := null;
  return new;
end;
$$;

drop trigger if exists tournament_entries_check on public.tournament_entries;
create trigger tournament_entries_check
  before insert on public.tournament_entries
  for each row execute function public.check_tournament_entry();

-- Admin accepts or rejects (or moves back to pending) an application.
create or replace function public.review_tournament_entry(entry_id uuid, new_status text, note text default '')
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  e public.tournament_entries;
  t public.tournaments;
begin
  if not public.is_admin() then raise exception 'not_admin'; end if;
  if new_status not in ('pending', 'accepted', 'rejected') then raise exception 'invalid_status'; end if;
  select * into e from public.tournament_entries where id = entry_id for update;
  if e.id is null then raise exception 'entry_not_found'; end if;
  select * into t from public.tournaments where id = e.tournament_id for update;
  if new_status = 'accepted' and e.status <> 'accepted' and t.max_participants is not null and (
    select count(*) from public.tournament_entries
    where tournament_id = t.id and status = 'accepted'
  ) >= t.max_participants then
    raise exception 'tournament_full';
  end if;
  update public.tournament_entries
    set status = new_status,
        admin_note = left(coalesce(note, ''), 300),
        reviewed_at = case when new_status = 'pending' then null else now() end
    where id = entry_id;
end;
$$;

grant execute on function public.review_tournament_entry(uuid, text, text) to authenticated;

-- Tell the player when their application is decided.
create or replace function public.notify_tournament_entry()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status <> old.status and new.status in ('accepted', 'rejected') then
    insert into public.notifications (user_id, actor_id, kind, payload)
    select new.user_id, null, 'tournament_' || new.status,
           jsonb_build_object('tournament_id', new.tournament_id, 'title', t.title)
    from public.tournaments t where t.id = new.tournament_id;
  end if;
  return new;
end;
$$;

drop trigger if exists tournament_entries_notify on public.tournament_entries;
create trigger tournament_entries_notify
  after update on public.tournament_entries
  for each row execute function public.notify_tournament_entry();

alter table public.tournaments        enable row level security;
alter table public.tournament_entries enable row level security;

-- Everyone signed in sees published tournaments; drafts are admin-only.
drop policy if exists "tournaments readable" on public.tournaments;
create policy "tournaments readable" on public.tournaments for select to authenticated
  using (status <> 'draft' or public.is_admin());
drop policy if exists "tournaments admin insert" on public.tournaments;
create policy "tournaments admin insert" on public.tournaments for insert to authenticated
  with check (public.is_admin());
drop policy if exists "tournaments admin update" on public.tournaments;
create policy "tournaments admin update" on public.tournaments for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
drop policy if exists "tournaments admin delete" on public.tournaments;
create policy "tournaments admin delete" on public.tournaments for delete to authenticated
  using (public.is_admin());

-- Players see their own application and the accepted line-up; admins see all.
drop policy if exists "entries readable" on public.tournament_entries;
create policy "entries readable" on public.tournament_entries for select to authenticated
  using (user_id = auth.uid() or status = 'accepted' or public.is_admin());
drop policy if exists "entries apply" on public.tournament_entries;
create policy "entries apply" on public.tournament_entries for insert to authenticated
  with check (user_id = auth.uid() and not public.is_banned(auth.uid()));
drop policy if exists "entries withdraw" on public.tournament_entries;
create policy "entries withdraw" on public.tournament_entries for delete to authenticated
  using ((user_id = auth.uid() and status = 'pending') or public.is_admin());

-- -----------------------------------------------------------------------------
-- Official posts on the home feed
-- -----------------------------------------------------------------------------

alter table public.posts add column if not exists is_official   boolean not null default false;
alter table public.posts add column if not exists tournament_id uuid references public.tournaments (id) on delete set null;

create or replace function public.guard_official_post()
returns trigger
language plpgsql
as $$
begin
  if (new.is_official or new.tournament_id is not null) and not public.is_admin() then
    raise exception 'only_admins_post_official';
  end if;
  return new;
end;
$$;

drop trigger if exists posts_guard_official on public.posts;
create trigger posts_guard_official
  before insert on public.posts
  for each row execute function public.guard_official_post();

-- Admins can see and remove any post or comment.
drop policy if exists "posts admin read" on public.posts;
create policy "posts admin read" on public.posts for select to authenticated using (public.is_admin());
drop policy if exists "posts admin delete" on public.posts;
create policy "posts admin delete" on public.posts for delete to authenticated using (public.is_admin());
drop policy if exists "comments admin delete" on public.post_comments;
create policy "comments admin delete" on public.post_comments for delete to authenticated using (public.is_admin());

-- -----------------------------------------------------------------------------
-- Admin actions on people
-- -----------------------------------------------------------------------------

-- Ban from NetFun: can't sign in again, signed-out everywhere, and can't post,
-- comment, message or apply while any old session lingers.
create or replace function public.admin_set_ban(target uuid, banned boolean, reason text default '')
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'not_admin'; end if;
  if target = auth.uid() then raise exception 'cannot_moderate_self'; end if;
  if exists (select 1 from public.app_admins where user_id = target) then
    raise exception 'cannot_moderate_admin';
  end if;

  update public.profiles
    set banned_at  = case when banned then coalesce(banned_at, now()) else null end,
        ban_reason = case when banned then left(coalesce(reason, ''), 300) else '' end
    where id = target;

  if banned then
    update public.tournament_entries set status = 'rejected', reviewed_at = now(),
      admin_note = 'Removed by NetFun'
      where user_id = target and status in ('pending', 'accepted');
  end if;

  -- Also lock the login itself. Kept separate so the ban above still holds
  -- if this project doesn't allow editing auth tables from SQL.
  begin
    update auth.users
      set banned_until = case when banned then now() + interval '100 years' else null end
      where id = target;
    if banned then
      delete from auth.sessions where user_id = target;
    end if;
  exception when others then
    raise notice 'could not update auth.users: %', sqlerrm;
  end;
end;
$$;

-- Block from tournaments only: they keep using NetFun but can't apply, and
-- open applications are rejected.
create or replace function public.admin_set_tournament_block(target uuid, blocked boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'not_admin'; end if;
  if target = auth.uid() then raise exception 'cannot_moderate_self'; end if;

  update public.profiles
    set tournament_blocked_at = case when blocked then coalesce(tournament_blocked_at, now()) else null end
    where id = target;

  if blocked then
    update public.tournament_entries e set status = 'rejected', reviewed_at = now(),
      admin_note = 'Blocked from tournaments'
      from public.tournaments t
      where e.tournament_id = t.id and e.user_id = target
        and e.status in ('pending', 'accepted')
        and t.status in ('draft', 'open', 'closed', 'live');
  end if;
end;
$$;

grant execute on function public.admin_set_ban(uuid, boolean, text) to authenticated;
grant execute on function public.admin_set_tournament_block(uuid, boolean) to authenticated;

-- People list for the dashboard, with the sign-in email only admins can see.
create or replace function public.admin_list_users(search text default '', lim int default 50)
returns table (
  id                    uuid,
  username              text,
  full_name             text,
  university            text,
  avatar_color          text,
  email                 text,
  created_at            timestamptz,
  banned_at             timestamptz,
  ban_reason            text,
  tournament_blocked_at timestamptz,
  is_admin              boolean,
  post_count            bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'not_admin'; end if;
  return query
    select p.id, p.username, p.full_name, p.university, p.avatar_color, u.email::text,
           p.created_at, p.banned_at, p.ban_reason, p.tournament_blocked_at,
           exists (select 1 from public.app_admins a where a.user_id = p.id),
           (select count(*) from public.posts x where x.author_id = p.id)
    from public.profiles p
    join auth.users u on u.id = p.id
    where coalesce(search, '') = ''
       or p.username ilike '%' || search || '%'
       or p.full_name ilike '%' || search || '%'
       or u.email ilike '%' || search || '%'
    order by p.created_at desc
    limit least(greatest(coalesce(lim, 50), 1), 200);
end;
$$;

grant execute on function public.admin_list_users(text, int) to authenticated;

create or replace function public.admin_stats()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'not_admin'; end if;
  return jsonb_build_object(
    'users',            (select count(*) from public.profiles),
    'users_week',       (select count(*) from public.profiles where created_at > now() - interval '7 days'),
    'posts',            (select count(*) from public.posts),
    'posts_today',      (select count(*) from public.posts where created_at > now() - interval '1 day'),
    'tournaments_open', (select count(*) from public.tournaments where status in ('open', 'live')),
    'pending_entries',  (select count(*) from public.tournament_entries where status = 'pending'),
    'banned',           (select count(*) from public.profiles where banned_at is not null)
  );
end;
$$;

grant execute on function public.admin_stats() to authenticated;

-- -----------------------------------------------------------------------------
-- Storage: tournament banners (public to view, admins upload)
-- -----------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('tournament-banners', 'tournament-banners', true)
on conflict (id) do nothing;

drop policy if exists "tournament banners admin upload" on storage.objects;
create policy "tournament banners admin upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'tournament-banners' and public.is_admin());
drop policy if exists "tournament banners admin update" on storage.objects;
create policy "tournament banners admin update" on storage.objects for update to authenticated
  using (bucket_id = 'tournament-banners' and public.is_admin());
drop policy if exists "tournament banners admin delete" on storage.objects;
create policy "tournament banners admin delete" on storage.objects for delete to authenticated
  using (bucket_id = 'tournament-banners' and public.is_admin());

-- Let admins remove photos of posts they take down.
drop policy if exists "post images admin delete" on storage.objects;
create policy "post images admin delete" on storage.objects for delete to authenticated
  using (bucket_id = 'post-images' and public.is_admin());

-- -----------------------------------------------------------------------------
-- Realtime
-- -----------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array['tournaments', 'tournament_entries'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end;
$$;
