-- Einmalig im Supabase-SQL-Editor ausführen.
-- Die Tabelle ist per RLS komplett gesperrt; Zugriff nur über die Funktionen unten.
-- Wer die (unratbare) UUID kennt, kann das Projekt lesen und bearbeiten – aufgelistet wird nichts.

create table if not exists public.projects (
  id         uuid primary key default gen_random_uuid(),
  data       jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.projects enable row level security;

create or replace function public.create_project(p_data jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare new_id uuid;
begin
  insert into projects (data) values (p_data) returning id into new_id;
  return new_id;
end $$;

create or replace function public.get_project(p_id uuid)
returns jsonb language sql security definer set search_path = public stable as $$
  select data from projects where id = p_id;
$$;

create or replace function public.save_project(p_id uuid, p_data jsonb)
returns void language sql security definer set search_path = public as $$
  update projects set data = p_data, updated_at = now() where id = p_id;
$$;

grant execute on function public.create_project(jsonb)       to anon, authenticated;
grant execute on function public.get_project(uuid)           to anon, authenticated;
grant execute on function public.save_project(uuid, jsonb)   to anon, authenticated;
