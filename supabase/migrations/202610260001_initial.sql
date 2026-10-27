-- Universal Roblox Tier List: Supabase/Postgres security model.
-- Run once in a FRESH Supabase project, in the SQL Editor.
-- All user-originated writes require an authenticated user and RLS.
create extension if not exists pgcrypto;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null check (username ~ '^[A-Za-z0-9_]{3,24}$'),
  bio text not null default '' check (char_length(bio) <= 500),
  avatar_path text,
  role text not null default 'user' check (role in ('user','admin','boss')),
  banned_until timestamptz,
  created_at timestamptz not null default now(),
  constraint avatar_owned_path check (avatar_path is null or left(avatar_path, char_length(id::text)+1) = id::text || '/')
);
create unique index profiles_username_ci on public.profiles ((lower(username)));
create index profiles_username_search on public.profiles (username);

create or replace function public.create_profile_for_auth_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare nickname text;
begin
  nickname := trim(coalesce(new.raw_user_meta_data->>'username', ''));
  if nickname !~ '^[A-Za-z0-9_]{3,24}$' then
    raise exception 'Invalid username';
  end if;
  insert into public.profiles(id, username) values(new.id, nickname);
  return new;
end;
$$;
create trigger auth_user_profile_created after insert on auth.users
for each row execute function public.create_profile_for_auth_user();

create or replace function public.is_active()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and (p.banned_until is null or p.banned_until <= now())
  );
$$;

create table public.favorites (
  user_id uuid not null references public.profiles(id) on delete cascade default auth.uid(),
  card_id text not null check (card_id ~ '^[a-f0-9]{24}$'),
  created_at timestamptz not null default now(),
  primary key (user_id, card_id)
);

create table public.friendships (
  id uuid primary key default gen_random_uuid(),
  requester uuid not null references public.profiles(id) on delete cascade,
  recipient uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted')),
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  constraint no_self_friend check (requester <> recipient)
);
create unique index unique_friend_pair on public.friendships
  (least(requester,recipient), greatest(requester,recipient));
create index friend_recipient_idx on public.friendships(recipient, created_at desc);
create index friend_requester_idx on public.friendships(requester, created_at desc);

create or replace function public.can_access_friendship(fid uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_active() and exists (
    select 1 from public.friendships f
    where f.id = fid and f.status = 'accepted'
      and (select auth.uid()) in (f.requester, f.recipient)
      and exists (
        select 1 from public.profiles p
        where p.id = case when f.requester = (select auth.uid()) then f.recipient else f.requester end
        and (p.banned_until is null or p.banned_until <= now())
      )
  );
$$;

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  friendship_id uuid not null references public.friendships(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade default auth.uid(),
  body text not null check (char_length(btrim(body)) between 1 and 500),
  created_at timestamptz not null default now()
);
create index messages_recent_in_friendship on public.messages(friendship_id, created_at desc);
create index messages_rate on public.messages(sender_id, created_at desc);

create or replace function public.enforce_message_rate()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  -- Supplemental anti-spam throttle, in addition to Supabase rate limits/CAPTCHA.
  if exists (select 1 from public.messages m where m.sender_id = new.sender_id
    and m.created_at > clock_timestamp() - interval '1 second') then
    raise exception 'Message rate exceeded';
  end if;
  return new;
end;
$$;
create trigger message_rate_guard before insert on public.messages
for each row execute function public.enforce_message_rate();

-- Row Level Security is ON for every public table.
alter table public.profiles enable row level security;
alter table public.favorites enable row level security;
alter table public.friendships enable row level security;
alter table public.messages enable row level security;

-- Explicit table / column permissions. No authenticated client can set role or bans.
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant update (username, bio, avatar_path) on public.profiles to authenticated;
revoke all on public.favorites from anon, authenticated;
grant select, delete on public.favorites to authenticated;
grant insert (user_id, card_id) on public.favorites to authenticated;
revoke all on public.friendships from anon, authenticated;
grant select, delete on public.friendships to authenticated;
grant insert (requester, recipient) on public.friendships to authenticated;
revoke all on public.messages from anon, authenticated;
grant select on public.messages to authenticated;
grant insert (friendship_id, body) on public.messages to authenticated;

create policy profile_read on public.profiles for select to authenticated
  using (id = (select auth.uid()) or public.is_active());
create policy profile_self_edit on public.profiles for update to authenticated
  using (id = (select auth.uid()) and public.is_active())
  with check (id = (select auth.uid()) and public.is_active());
create policy favorites_read on public.favorites for select to authenticated
  using (user_id = (select auth.uid()) and public.is_active());
create policy favorites_add on public.favorites for insert to authenticated
  with check (user_id = (select auth.uid()) and public.is_active());
create policy favorites_remove on public.favorites for delete to authenticated
  using (user_id = (select auth.uid()) and public.is_active());
create policy friend_read on public.friendships for select to authenticated
  using ((select auth.uid()) in (requester, recipient) and public.is_active());
create policy friend_request on public.friendships for insert to authenticated
  with check (requester = (select auth.uid()) and requester <> recipient
    and status = 'pending' and accepted_at is null and public.is_active()
    and exists (select 1 from public.profiles p where p.id = recipient
      and (p.banned_until is null or p.banned_until <= now())));
create policy friend_remove on public.friendships for delete to authenticated
  using ((select auth.uid()) in (requester, recipient) and public.is_active());
create policy msg_read on public.messages for select to authenticated
  using (public.can_access_friendship(friendship_id));
create policy msg_insert on public.messages for insert to authenticated
  with check (sender_id = (select auth.uid()) and public.can_access_friendship(friendship_id));

-- Only recipient can accept a pending friendship, never the sender.
create or replace function public.accept_friendship(fid uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_active() then raise exception 'Access denied'; end if;
  update public.friendships f set status='accepted', accepted_at=now()
  where f.id=fid and f.recipient=auth.uid() and f.status='pending';
  if not found then raise exception 'Request not found'; end if;
end;
$$;

-- Exact case-insensitive nickname match (no LIKE wildcards / enumeration via patterns).
create or replace function public.find_user_by_username(search_name text)
returns table (id uuid, username text, avatar_path text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_active() or search_name !~ '^[A-Za-z0-9_]{3,24}$' then
    return;
  end if;
  return query select p.id,p.username,p.avatar_path from public.profiles p
  where lower(p.username)=lower(search_name)
    and (p.banned_until is null or p.banned_until<=now()) limit 1;
end;
$$;

-- Server-side permission for ephemeral WebRTC call channels.
create or replace function public.can_access_call_topic(topic text)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare fid uuid;
begin
  if topic !~ '^call:[a-f0-9-]{36}$' then return false; end if;
  fid := substring(topic from 6)::uuid;
  return public.can_access_friendship(fid);
exception when invalid_text_representation then return false;
end;
$$;

create policy call_receive on realtime.messages for select to authenticated
  using (realtime.messages.extension = 'broadcast' and public.can_access_call_topic(realtime.topic()));
create policy call_send on realtime.messages for insert to authenticated
  with check (realtime.messages.extension = 'broadcast' and public.can_access_call_topic(realtime.topic()));

-- Administrative actions: definer privileges, verified against DB role on EVERY call.
create table public.admin_audit (
  id bigint generated always as identity primary key,
  admin_id uuid not null references public.profiles(id),
  target_id uuid not null references public.profiles(id),
  action text not null,
  recorded_at timestamptz not null default now()
);
alter table public.admin_audit enable row level security;
revoke all on public.admin_audit from anon, authenticated;

create or replace function public.admin_list_users()
returns table (id uuid, username text, role text, banned_until timestamptz, created_at timestamptz)
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_active() or not exists (
    select 1 from public.profiles p where p.id=auth.uid() and p.role in ('admin','boss')
  ) then raise exception 'Admin access denied'; end if;
  return query select p.id, p.username, p.role, p.banned_until, p.created_at
    from public.profiles p order by p.created_at desc limit 500;
end;
$$;

create or replace function public.admin_manage_user(target uuid, operation text, duration_seconds integer default null)
returns void language plpgsql security definer set search_path = '' as $$
declare actor_role text; target_role text;
begin
  if not public.is_active() then raise exception 'Account disabled'; end if;
  select p.role into actor_role from public.profiles p where p.id = auth.uid();
  if actor_role not in ('admin','boss') or target = auth.uid() then raise exception 'Not permitted'; end if;
  select p.role into target_role from public.profiles p where p.id=target for update;
  if not found then raise exception 'User not found'; end if;
  if actor_role='admin' and target_role <> 'user' then raise exception 'Protected account'; end if;
  if target_role='boss' then raise exception 'Boss account is protected'; end if;
  if operation='ban' then
    if duration_seconds is null or duration_seconds < 60 or duration_seconds > 31536000 then
      raise exception 'Invalid ban duration';
    end if;
    update public.profiles set banned_until = now() + make_interval(secs=>duration_seconds) where id=target;
  elsif operation='unban' then
    update public.profiles set banned_until = null where id=target;
  elsif operation in ('promote','demote') then
    if actor_role <> 'boss' then raise exception 'Boss role required'; end if;
    update public.profiles set role=case when operation='promote' then 'admin' else 'user' end where id=target;
  else raise exception 'Unknown operation'; end if;
  insert into public.admin_audit(admin_id,target_id,action)
    values(auth.uid(),target, operation || coalesce(':' || duration_seconds::text, ''));
end;
$$;

revoke all on function public.create_profile_for_auth_user() from public, anon, authenticated;
revoke all on function public.enforce_message_rate() from public, anon, authenticated;
revoke all on function public.is_active() from public, anon;
revoke all on function public.can_access_friendship(uuid) from public, anon;
revoke all on function public.can_access_call_topic(text) from public, anon;
revoke all on function public.accept_friendship(uuid) from public, anon;
revoke all on function public.find_user_by_username(text) from public, anon;
revoke all on function public.admin_list_users() from public, anon;
revoke all on function public.admin_manage_user(uuid,text,integer) from public, anon;
grant execute on function public.is_active() to authenticated;
grant execute on function public.can_access_friendship(uuid) to authenticated;
grant execute on function public.can_access_call_topic(text) to authenticated;
grant execute on function public.accept_friendship(uuid) to authenticated;
grant execute on function public.find_user_by_username(text) to authenticated;
grant execute on function public.admin_list_users() to authenticated;
grant execute on function public.admin_manage_user(uuid,text,integer) to authenticated;

-- Storage limits verified by Supabase Storage; only the owner can change avatar files.
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('avatars','avatars',true,2097152,array['image/png','image/jpeg','image/webp'])
on conflict (id) do update set public=true, file_size_limit=2097152,
allowed_mime_types=array['image/png','image/jpeg','image/webp'];
create policy avatar_upload on storage.objects for insert to authenticated
  with check (bucket_id='avatars' and (storage.foldername(name))[1]=(select auth.uid())::text and public.is_active());
create policy avatar_change on storage.objects for update to authenticated
  using (bucket_id='avatars' and (storage.foldername(name))[1]=(select auth.uid())::text and public.is_active())
  with check (bucket_id='avatars' and (storage.foldername(name))[1]=(select auth.uid())::text and public.is_active());
create policy avatar_delete on storage.objects for delete to authenticated
  using (bucket_id='avatars' and (storage.foldername(name))[1]=(select auth.uid())::text and public.is_active());

-- Chat changefeed: RLS ensures only accepted participants can see message inserts.
do $$ begin
  if not exists (
    select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='messages'
  ) then alter publication supabase_realtime add table public.messages; end if;
  if not exists (
    select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='friendships'
  ) then alter publication supabase_realtime add table public.friendships; end if;
end $$;
