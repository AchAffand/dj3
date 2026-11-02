-- Add optional project location and floor without changing any saved calculations.
alter table public.projects
  add column if not exists location text not null default '',
  add column if not exists floor text not null default '';

-- Keep existing save_project callers working while adding one atomic metadata-aware RPC.
create or replace function public.save_project_with_metadata(
  p_project_id uuid,
  p_name text,
  p_lines jsonb,
  p_prices jsonb,
  p_location text default '',
  p_floor text default ''
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_project_id uuid;
begin
  v_project_id := public.save_project(p_project_id, p_name, p_lines, p_prices);

  update public.projects
    set location = trim(coalesce(p_location, '')),
        floor = trim(coalesce(p_floor, ''))
    where id = v_project_id
      and user_id = (select auth.uid());

  if not found then
    raise exception 'Project not found or not owned by this user' using errcode = '42501';
  end if;

  return v_project_id;
end;
$$;

revoke all on function public.save_project_with_metadata(uuid, text, jsonb, jsonb, text, text) from public, anon;
grant execute on function public.save_project_with_metadata(uuid, text, jsonb, jsonb, text, text) to authenticated;
