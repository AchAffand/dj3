create or replace function public.create_formula_model(
  p_code integer,
  p_name text,
  p_input_variables text[] default '{}'
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_group_code integer;
begin
  if not (select private.is_catalog_admin()) then
    raise exception 'Catalog administrator access required' using errcode = '42501';
  end if;
  if p_code is null or p_code < 10100 or p_code >= 50000 or p_code % 100 <> 0 then
    raise exception 'Model code must be a valid xx00 catalog code' using errcode = '22023';
  end if;
  if length(trim(coalesce(p_name, ''))) = 0 then
    raise exception 'Model name is required' using errcode = '22023';
  end if;
  if coalesce(array_length(p_input_variables, 1), 0) > 0 and exists (
    select 1 from unnest(p_input_variables) as inputs(value)
    where value not in ('T1', 'L1', 'T2', 'L2', 'T3', 'L3', 'daunPintu', 'daunJendela')
  ) then
    raise exception 'Model contains an unsupported input variable' using errcode = '22023';
  end if;

  v_group_code := (p_code / 10000) * 10000;
  insert into public.door_models (code, group_code, name, input_variables, status)
  values (p_code, v_group_code, trim(p_name), coalesce(p_input_variables, '{}'), 'incomplete');
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
begin
  if not (select private.is_catalog_admin()) then
    raise exception 'Catalog administrator access required' using errcode = '42501';
  end if;
  if length(trim(coalesce(p_name, ''))) = 0 or length(trim(coalesce(p_unit, ''))) = 0 then
    raise exception 'Material name and unit are required' using errcode = '22023';
  end if;
  if length(trim(coalesce(p_expression, ''))) = 0 or length(p_expression) > 500 then
    raise exception 'Formula expression must contain 1 to 500 characters' using errcode = '22023';
  end if;
  if p_material_code <= p_model_code or p_material_code >= p_model_code + 100 or p_material_code >= 50000 then
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
    p_material_code, p_model_code, v_position, trim(p_expression), 1, 'Master Rumus', nullif(trim(p_source_formula), '')
  );
  insert into public.formula_versions (material_code, version, expression, created_by)
  values (p_material_code, 1, trim(p_expression), (select auth.uid()));
  return p_material_code;
end;
$$;

revoke all on function public.create_formula_model(integer, text, text[]) from public, anon;
revoke all on function public.create_formula_material(integer, integer, text, text, text, text) from public, anon;
grant execute on function public.create_formula_model(integer, text, text[]) to authenticated;
grant execute on function public.create_formula_material(integer, integer, text, text, text, text) to authenticated;
