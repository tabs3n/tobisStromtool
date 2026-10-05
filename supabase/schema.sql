-- Im Supabase-SQL-Editor ausführen (idempotent, darf wiederholt werden).
--
-- Alle Tabellen sind per RLS gesperrt. Zugriff läuft ausschließlich über die Funktionen unten,
-- und jede verlangt das Team-Passwort. Ohne Passwort sieht und ändert man nichts.
--
-- Team-Passwort setzen oder ändern (eigene Zeile, am Ende ausführen):
--   select public.set_team_password('dein-passwort');

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.projects (
  id         uuid primary key default gen_random_uuid(),
  data       jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.app_config (
  id      int primary key default 1 check (id = 1),
  pw_hash text not null
);

alter table public.projects   enable row level security;
alter table public.app_config enable row level security;

-- Alte Versionen ohne Passwort entfernen.
drop function if exists public.create_project(jsonb);
drop function if exists public.get_project(uuid);
drop function if exists public.save_project(uuid, jsonb);

-- Nur im SQL-Editor aufrufbar (nicht für anon).
create or replace function public.set_team_password(p_pass text)
returns void language sql security definer set search_path = public, extensions as $$
  insert into app_config (id, pw_hash) values (1, crypt(p_pass, gen_salt('bf')))
  on conflict (id) do update set pw_hash = excluded.pw_hash;
$$;
revoke all on function public.set_team_password(text) from public, anon, authenticated;

create or replace function public.assert_team_password(p_pass text)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  if not exists (select 1 from app_config where pw_hash = crypt(coalesce(p_pass, ''), pw_hash)) then
    raise exception 'Falsches Passwort';
  end if;
end $$;
revoke all on function public.assert_team_password(text) from public, anon, authenticated;

create or replace function public.check_password(p_pass text)
returns boolean language plpgsql security definer set search_path = public, extensions as $$
begin
  return exists (select 1 from app_config where pw_hash = crypt(coalesce(p_pass, ''), pw_hash));
end $$;

create or replace function public.list_projects(p_pass text)
returns table (id uuid, name text, venue text, date text, updated_at timestamptz)
language plpgsql security definer set search_path = public as $$
begin
  perform assert_team_password(p_pass);
  return query
    select p.id, p.data->>'name', p.data->>'venue', p.data->>'date', p.updated_at
    from projects p order by p.updated_at desc;
end $$;

create or replace function public.create_project(p_pass text, p_data jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare new_id uuid;
begin
  perform assert_team_password(p_pass);
  insert into projects (data) values (p_data) returning projects.id into new_id;
  return new_id;
end $$;

create or replace function public.get_project(p_pass text, p_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  perform assert_team_password(p_pass);
  return (select data from projects where id = p_id);
end $$;

create or replace function public.save_project(p_pass text, p_id uuid, p_data jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform assert_team_password(p_pass);
  update projects set data = p_data, updated_at = now() where id = p_id;
end $$;

create or replace function public.delete_project(p_pass text, p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform assert_team_password(p_pass);
  delete from projects where id = p_id;
end $$;

grant execute on function public.check_password(text)                to anon, authenticated;
grant execute on function public.list_projects(text)                  to anon, authenticated;
grant execute on function public.create_project(text, jsonb)          to anon, authenticated;
grant execute on function public.get_project(text, uuid)              to anon, authenticated;
grant execute on function public.save_project(text, uuid, jsonb)      to anon, authenticated;
grant execute on function public.delete_project(text, uuid)           to anon, authenticated;
