-- DJ3 project-save and catalog-admin access repair.
-- Keep project ownership unchanged. Admins may read/update every project, but
-- cannot create projects on behalf of another user or delete project headers.
-- Child rows must be manageable by admins because save_project_* replaces them.
begin;

-- save_project_with_budget_prices is SECURITY INVOKER. Grant the DML it needs;
-- RLS below remains the row-level boundary.
grant insert, update, delete on public.project_line_price_snapshots to authenticated;

drop policy if exists "project owners update line price snapshots" on public.project_line_price_snapshots;
create policy "project owners update line price snapshots"
  on public.project_line_price_snapshots
  for update to authenticated
  using (
    exists (
      select 1 from public.projects p
      where p.id = project_line_price_snapshots.project_id
        and p.user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.projects p
      where p.id = project_line_price_snapshots.project_id
        and p.user_id = (select auth.uid())
    )
  );

-- Project headers: admin read/update only. Existing owner policies continue to
-- permit each user to create/read/update/delete their own projects.
drop policy if exists "catalog admins manage all projects" on public.projects;
drop policy if exists "catalog admins read all projects" on public.projects;
drop policy if exists "catalog admins update all projects" on public.projects;
create policy "catalog admins read all projects"
  on public.projects for select to authenticated
  using ((select private.is_catalog_admin()));
create policy "catalog admins update all projects"
  on public.projects for update to authenticated
  using ((select private.is_catalog_admin()))
  with check ((select private.is_catalog_admin()));

-- Admins must replace child rows while saving an existing project.
drop policy if exists "catalog admins manage all project model lines" on public.project_model_lines;
create policy "catalog admins manage all project model lines"
  on public.project_model_lines for all to authenticated
  using ((select private.is_catalog_admin()))
  with check ((select private.is_catalog_admin()));

drop policy if exists "catalog admins manage all project material prices" on public.project_material_prices;
create policy "catalog admins manage all project material prices"
  on public.project_material_prices for all to authenticated
  using ((select private.is_catalog_admin()))
  with check ((select private.is_catalog_admin()));

drop policy if exists "catalog admins manage all line price snapshots" on public.project_line_price_snapshots;
create policy "catalog admins manage all line price snapshots"
  on public.project_line_price_snapshots for all to authenticated
  using ((select private.is_catalog_admin()))
  with check ((select private.is_catalog_admin()));

-- The admin project list displays owner labels from profiles.
drop policy if exists "catalog admins read all profiles" on public.profiles;
create policy "catalog admins read all profiles"
  on public.profiles for select to authenticated
  using ((select private.is_catalog_admin()));

-- Saving existing projects is allowed for owner or catalog admin. Creating a
-- new project always assigns it to auth.uid(); the caller cannot choose owner.
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
      where id = p_project_id
        and (
          user_id = (select auth.uid())
          or (select private.is_catalog_admin())
        )
      returning id into v_project_id;
    if v_project_id is null then
      raise exception 'Project not found or not owned by this user' using errcode = '42501';
    end if;
  end if;

  delete from public.project_model_lines where project_id = v_project_id;
  for v_line in
    select value from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) as line(value)
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
  for v_price in
    select value from jsonb_array_elements(coalesce(p_prices, '[]'::jsonb)) as price(value)
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
      and (
        user_id = (select auth.uid())
        or (select private.is_catalog_admin())
      );

  if not found then
    raise exception 'Project not found or not owned by this user' using errcode = '42501';
  end if;

  return v_project_id;
end;
$$;

commit;
