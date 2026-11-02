create extension if not exists pgcrypto with schema extensions;

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.catalog_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.door_models (
  code integer primary key check (code >= 10100 and code < 50000 and code % 100 = 0),
  group_code integer not null check (group_code between 10000 and 40000 and group_code % 10000 = 0),
  name text not null,
  input_variables text[] not null default '{}',
  status text not null check (status in ('ready', 'incomplete')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.materials (
  code integer primary key check (code > 10000 and code < 50000),
  name text not null,
  unit text not null check (length(trim(unit)) > 0),
  created_at timestamptz not null default now()
);

create table public.model_materials (
  material_code integer primary key references public.materials(code) on delete restrict,
  model_code integer not null references public.door_models(code) on delete restrict,
  position integer not null check (position > 0),
  current_expression text,
  formula_version integer not null default 1 check (formula_version > 0),
  source_cell text not null,
  source_formula text,
  source_cached_quantity numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (model_code, position)
);

create index model_materials_model_code_idx on public.model_materials(model_code, position);

create table public.formula_versions (
  id uuid primary key default gen_random_uuid(),
  material_code integer not null references public.model_materials(material_code) on delete restrict,
  version integer not null check (version > 0),
  expression text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (material_code, version)
);

create index formula_versions_material_idx on public.formula_versions(material_code, version desc);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index projects_owner_updated_idx on public.projects(user_id, updated_at desc);

create table public.project_model_lines (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  model_code integer not null references public.door_models(code) on delete restrict,
  inputs jsonb not null default '{}',
  model_count integer not null default 1 check (model_count > 0),
  formula_snapshot jsonb not null default '[]' check (jsonb_typeof(formula_snapshot) = 'array'),
  result_snapshot jsonb not null default '{"items":[],"errors":[]}' check (jsonb_typeof(result_snapshot) = 'object'),
  created_at timestamptz not null default now()
);

create index project_model_lines_project_idx on public.project_model_lines(project_id);

create table public.project_material_prices (
  project_id uuid not null references public.projects(id) on delete cascade,
  material_code integer not null references public.materials(code) on delete restrict,
  name_snapshot text not null,
  unit_snapshot text not null,
  unit_price numeric(16, 2) check (unit_price is null or unit_price >= 0),
  updated_at timestamptz not null default now(),
  primary key (project_id, material_code)
);

create or replace function private.is_catalog_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.catalog_admins
    where user_id = (select auth.uid())
  );
$$;

revoke all on function private.is_catalog_admin() from public, anon;
grant execute on function private.is_catalog_admin() to authenticated;

create or replace function private.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(coalesce(new.email, ''), '@', 1))
  )
  on conflict (id) do update set email = excluded.email;
  return new;
end;
$$;

revoke all on function private.handle_new_auth_user() from public, anon, authenticated;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_auth_user();

create or replace function public.save_project(
  p_project_id uuid,
  p_name text,
  p_lines jsonb,
  p_prices jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_project_id uuid;
  v_line jsonb;
  v_price jsonb;
begin
  if (select auth.uid()) is null then
    raise exception 'Sign in required' using errcode = '42501';
  end if;
  if length(trim(coalesce(p_name, ''))) = 0 then
    raise exception 'Project name is required' using errcode = '22023';
  end if;
  if p_lines is not null and jsonb_typeof(p_lines) <> 'array' then
    raise exception 'Project lines must be an array' using errcode = '22023';
  end if;
  if p_prices is not null and jsonb_typeof(p_prices) <> 'array' then
    raise exception 'Project prices must be an array' using errcode = '22023';
  end if;

  if p_project_id is null then
    insert into public.projects (user_id, name)
    values ((select auth.uid()), trim(p_name))
    returning id into v_project_id;
  else
    update public.projects
      set name = trim(p_name), updated_at = now()
      where id = p_project_id and user_id = (select auth.uid())
      returning id into v_project_id;
    if v_project_id is null then
      raise exception 'Project not found or not owned by this user' using errcode = '42501';
    end if;
  end if;

  delete from public.project_model_lines where project_id = v_project_id;
  for v_line in select value from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) as line(value)
  loop
    insert into public.project_model_lines (
      id, project_id, model_code, inputs, model_count, formula_snapshot, result_snapshot
    ) values (
      coalesce(nullif(v_line ->> 'id', '')::uuid, gen_random_uuid()),
      v_project_id,
      (v_line ->> 'model_code')::integer,
      coalesce(v_line -> 'inputs', '{}'::jsonb),
      coalesce((v_line ->> 'model_count')::integer, 1),
      coalesce(v_line -> 'formula_snapshot', '[]'::jsonb),
      coalesce(v_line -> 'result_snapshot', '{"items":[],"errors":[]}'::jsonb)
    );
  end loop;

  delete from public.project_material_prices where project_id = v_project_id;
  for v_price in select value from jsonb_array_elements(coalesce(p_prices, '[]'::jsonb)) as price(value)
  loop
    insert into public.project_material_prices (
      project_id, material_code, name_snapshot, unit_snapshot, unit_price, updated_at
    ) values (
      v_project_id,
      (v_price ->> 'material_code')::integer,
      v_price ->> 'name_snapshot',
      v_price ->> 'unit_snapshot',
      nullif(v_price ->> 'unit_price', '')::numeric,
      now()
    );
  end loop;

  return v_project_id;
end;
$$;

create or replace function public.save_formula_change(
  p_material_code integer,
  p_expression text
)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_version integer;
begin
  if length(trim(coalesce(p_expression, ''))) = 0 or length(p_expression) > 500 then
    raise exception 'Formula expression must contain 1 to 500 characters' using errcode = '22023';
  end if;

  update public.model_materials
    set current_expression = trim(p_expression),
        formula_version = formula_version + 1,
        updated_at = now()
    where material_code = p_material_code
    returning formula_version into v_version;
  if v_version is null then
    raise exception 'Material formula not found or access denied' using errcode = '42501';
  end if;

  insert into public.formula_versions (material_code, version, expression, created_by)
  values (p_material_code, v_version, trim(p_expression), (select auth.uid()));
  return v_version;
end;
$$;

revoke all on function public.save_project(uuid, text, jsonb, jsonb) from public, anon;
revoke all on function public.save_formula_change(integer, text) from public, anon;
grant execute on function public.save_project(uuid, text, jsonb, jsonb) to authenticated;
grant execute on function public.save_formula_change(integer, text) to authenticated;
