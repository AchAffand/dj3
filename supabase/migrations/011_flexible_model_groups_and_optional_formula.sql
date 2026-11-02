create table if not exists public.model_groups (
  group_code integer primary key check (group_code between 10000 and 990000 and group_code % 10000 = 0),
  group_name text not null check (length(trim(group_name)) > 0),
  created_at timestamptz not null default now()
);

insert into public.model_groups (group_code, group_name) values
  (10000, 'Pintu'),
  (20000, 'Jendela'),
  (30000, 'Pintu Jendela'),
  (40000, 'Pintu Sliding')
on conflict (group_code) do nothing;

insert into public.model_groups (group_code, group_name)
select distinct group_code,
  case group_code
    when 10000 then 'Pintu'
    when 20000 then 'Jendela'
    when 30000 then 'Pintu Jendela'
    when 40000 then 'Pintu Sliding'
    else 'Kelompok ' || group_code::text
  end
from public.door_models
on conflict (group_code) do nothing;

alter table public.door_models
  drop constraint if exists door_models_code_check,
  drop constraint if exists door_models_group_code_check;
alter table public.door_models
  add constraint door_models_code_check
    check (code >= 10100 and code < 1000000 and code % 100 = 0),
  add constraint door_models_group_code_check
    check (
      group_code between 10000 and 990000
      and group_code % 10000 = 0
      and group_code = (code / 10000) * 10000
    );

alter table public.materials drop constraint if exists materials_code_check;
alter table public.materials add constraint materials_code_check
  check (code > 10000 and code < 1000000);

alter table public.door_models
  add constraint door_models_group_code_fkey
  foreign key (group_code) references public.model_groups(group_code);

alter table public.model_groups enable row level security;
create policy "signed in users read model groups" on public.model_groups
  for select to authenticated using (true);
create policy "catalog admins insert model groups" on public.model_groups
  for insert to authenticated with check ((select private.is_catalog_admin()));
create policy "catalog admins update model groups" on public.model_groups
  for update to authenticated using ((select private.is_catalog_admin()))
  with check ((select private.is_catalog_admin()));
grant select, insert, update on public.model_groups to authenticated;

drop function if exists public.create_formula_model(integer, text, text[]);
create or replace function public.create_formula_model(
  p_code integer,
  p_name text,
  p_input_variables text[],
  p_group_code integer,
  p_group_name text
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (select private.is_catalog_admin()) then
    raise exception 'Catalog administrator access required' using errcode = '42501';
  end if;
  if p_code is null or p_group_code is null
    or p_group_code < 10000 or p_group_code > 990000 or p_group_code % 10000 <> 0
    or p_code < p_group_code + 100 or p_code > p_group_code + 9900
    or p_code % 100 <> 0 or p_code >= 1000000 then
    raise exception 'Model code must follow the selected group and xx00 pattern' using errcode = '22023';
  end if;
  if length(trim(coalesce(p_name, ''))) = 0 or length(trim(coalesce(p_group_name, ''))) = 0 then
    raise exception 'Model and group names are required' using errcode = '22023';
  end if;
  insert into public.model_groups (group_code, group_name)
  values (p_group_code, trim(p_group_name))
  on conflict (group_code) do update set group_name = excluded.group_name;
  insert into public.door_models (code, group_code, name, input_variables, status)
  values (p_code, p_group_code, trim(p_name), coalesce(p_input_variables, '{}'), 'incomplete');
  return p_code;
end;
$$;

create or replace function public.create_formula_material(
  p_model_code integer,
  p_material_code integer,
  p_name text,
  p_unit text,
  p_expression text,
  p_source_formula text default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_position integer;
  v_expression text := nullif(trim(p_expression), '');
begin
  if not (select private.is_catalog_admin()) then
    raise exception 'Catalog administrator access required' using errcode = '42501';
  end if;
  if length(trim(coalesce(p_name, ''))) = 0 or length(trim(coalesce(p_unit, ''))) = 0 then
    raise exception 'Material name and unit are required' using errcode = '22023';
  end if;
  if v_expression is not null and length(v_expression) > 500 then
    raise exception 'Formula expression must contain at most 500 characters' using errcode = '22023';
  end if;
  if p_material_code <= p_model_code or p_material_code >= p_model_code + 100 or p_material_code >= 1000000 then
    raise exception 'Material code must follow the selected model xx00 code' using errcode = '22023';
  end if;

  perform 1 from public.door_models where code = p_model_code for update;
  if not found then
    raise exception 'Selected model was not found' using errcode = '22023';
  end if;
  select coalesce(max(position), 0) + 1 into v_position
    from public.model_materials where model_code = p_model_code;

  insert into public.materials (code, source_code, name, unit)
  values (p_material_code, p_material_code, trim(p_name), trim(p_unit));
  insert into public.model_materials (
    material_code, model_code, position, current_expression, formula_version, source_cell, source_formula
  ) values (
    p_material_code, p_model_code, v_position, v_expression, 1, 'Master Rumus', nullif(trim(p_source_formula), '')
  );
  insert into public.formula_versions (material_code, version, expression, created_by)
  values (p_material_code, 1, v_expression, (select auth.uid()));
  return p_material_code;
end;
$$;

revoke all on function public.create_formula_model(integer, text, text[], integer, text) from public, anon;
grant execute on function public.create_formula_model(integer, text, text[], integer, text) to authenticated;
revoke all on function public.create_formula_material(integer, integer, text, text, text, text) from public, anon;
grant execute on function public.create_formula_material(integer, integer, text, text, text, text) to authenticated;
