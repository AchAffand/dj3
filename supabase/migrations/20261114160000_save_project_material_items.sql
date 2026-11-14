-- Preserve TYPE-level material selections and snapshots when saving a project.
-- This RPC replaces the legacy delete-and-recreate line flow for this client.
-- Existing RPCs remain available for older deployed clients.

create or replace function public.save_project_with_material_items(
  p_project_id uuid,
  p_name text,
  p_location text,
  p_floor text,
  p_lines jsonb,
  p_prices jsonb,
  p_price_snapshots jsonb,
  p_material_items jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_project_id uuid;
  v_line jsonb;
  v_item jsonb;
  v_price jsonb;
  v_snapshot jsonb;
  v_line_id uuid;
  v_item_id uuid;
  v_line_ids uuid[] := array[]::uuid[];
  v_item_ids uuid[] := array[]::uuid[];
begin
  if (select auth.uid()) is null then
    raise exception 'Sign in required' using errcode = '42501';
  end if;
  if length(trim(coalesce(p_name, ''))) = 0 then
    raise exception 'Project name is required' using errcode = '22023';
  end if;
  if jsonb_typeof(coalesce(p_lines, '[]'::jsonb)) <> 'array'
     or jsonb_typeof(coalesce(p_prices, '[]'::jsonb)) <> 'array'
     or jsonb_typeof(coalesce(p_price_snapshots, '[]'::jsonb)) <> 'array'
     or jsonb_typeof(coalesce(p_material_items, '[]'::jsonb)) <> 'array' then
    raise exception 'Project payload collections must be arrays' using errcode = '22023';
  end if;

  if p_project_id is null then
    insert into public.projects (user_id, name, location, floor)
    values ((select auth.uid()), trim(p_name), trim(coalesce(p_location, '')), trim(coalesce(p_floor, '')))
    returning id into v_project_id;
  else
    update public.projects
      set name = trim(p_name),
          location = trim(coalesce(p_location, '')),
          floor = trim(coalesce(p_floor, '')),
          updated_at = now()
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

  -- Upsert existing TYPE lines in place. Only lines omitted from the submitted
  -- project are deleted, so their child material rows survive ordinary saves.
  for v_line in
    select value from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) as line(value)
  loop
    v_line_id := nullif(v_line ->> 'id', '')::uuid;
    if v_line_id is null then
      raise exception 'Every project model line must have a stable id' using errcode = '22023';
    end if;
    v_line_ids := array_append(v_line_ids, v_line_id);

    insert into public.project_model_lines (
      id, project_id, model_code, inputs, model_count,
      formula_snapshot, result_snapshot, price_catalog_id, price_variant_id
    ) values (
      v_line_id,
      v_project_id,
      (v_line ->> 'model_code')::integer,
      coalesce(v_line -> 'inputs', '{}'::jsonb),
      coalesce((v_line ->> 'model_count')::integer, 1),
      coalesce(v_line -> 'formula_snapshot', '[]'::jsonb),
      coalesce(v_line -> 'result_snapshot', '{"items":[],"errors":[]}'::jsonb),
      nullif(v_line ->> 'price_catalog_id', '')::uuid,
      nullif(v_line ->> 'price_variant_id', '')::uuid
    )
    on conflict (id) do update set
      model_code = excluded.model_code,
      inputs = excluded.inputs,
      model_count = excluded.model_count,
      formula_snapshot = excluded.formula_snapshot,
      result_snapshot = excluded.result_snapshot,
      price_catalog_id = excluded.price_catalog_id,
      price_variant_id = excluded.price_variant_id
    where public.project_model_lines.project_id = v_project_id;

    if not found then
      raise exception 'Project model line does not belong to this project' using errcode = '42501';
    end if;
  end loop;

  delete from public.project_model_lines
  where project_id = v_project_id
    and not (id = any(v_line_ids));

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

  delete from public.project_line_price_snapshots where project_id = v_project_id;
  for v_snapshot in
    select value from jsonb_array_elements(coalesce(p_price_snapshots, '[]'::jsonb)) as snapshot(value)
  loop
    insert into public.project_line_price_snapshots (
      project_id, material_code, catalog_id, variant_id, name_snapshot, unit_snapshot,
      unit_price, component_id, price_version, expression_snapshot, updated_at
    ) values (
      v_project_id,
      (v_snapshot ->> 'material_code')::integer,
      (v_snapshot ->> 'catalog_id')::uuid,
      (v_snapshot ->> 'variant_id')::uuid,
      v_snapshot ->> 'name_snapshot',
      v_snapshot ->> 'unit_snapshot',
      nullif(v_snapshot ->> 'unit_price', '')::numeric,
      nullif(v_snapshot ->> 'component_id', '')::uuid,
      nullif(v_snapshot ->> 'price_version', '')::integer,
      v_snapshot ->> 'expression_snapshot',
      now()
    )
    on conflict (
      project_id, material_code, catalog_id, variant_id, snapshot_component_key
    ) do update set
      name_snapshot = excluded.name_snapshot,
      unit_snapshot = excluded.unit_snapshot,
      unit_price = excluded.unit_price,
      component_id = excluded.component_id,
      price_version = excluded.price_version,
      expression_snapshot = excluded.expression_snapshot,
      updated_at = now();
  end loop;

  -- Preserve row identity for existing formula/manual material rows as well.
  for v_item in
    select value from jsonb_array_elements(coalesce(p_material_items, '[]'::jsonb)) as material(value)
  loop
    v_item_id := nullif(v_item ->> 'id', '')::uuid;
    if v_item_id is null then
      raise exception 'Every project material row must have a stable id' using errcode = '22023';
    end if;
    v_item_ids := array_append(v_item_ids, v_item_id);

    insert into public.project_line_material_items (
      id, project_id, project_model_line_id, source_type, formula_material_code,
      master_item_id, selected_brand_id, selected_variant_id, quantity, unit_snapshot,
      item_name_snapshot, group_name_snapshot, brand_name_snapshot, variant_name_snapshot,
      unit_price_snapshot, price_version_snapshot, price_is_set, position, updated_at
    ) values (
      v_item_id,
      v_project_id,
      (v_item ->> 'project_model_line_id')::uuid,
      v_item ->> 'source_type',
      nullif(v_item ->> 'formula_material_code', '')::integer,
      nullif(v_item ->> 'master_item_id', '')::uuid,
      nullif(v_item ->> 'selected_brand_id', '')::uuid,
      nullif(v_item ->> 'selected_variant_id', '')::uuid,
      (v_item ->> 'quantity')::numeric,
      v_item ->> 'unit_snapshot',
      v_item ->> 'item_name_snapshot',
      v_item ->> 'group_name_snapshot',
      v_item ->> 'brand_name_snapshot',
      v_item ->> 'variant_name_snapshot',
      nullif(v_item ->> 'unit_price_snapshot', '')::numeric,
      nullif(v_item ->> 'price_version_snapshot', '')::integer,
      coalesce((v_item ->> 'price_is_set')::boolean, false),
      coalesce((v_item ->> 'position')::integer, 0),
      now()
    )
    on conflict (id) do update set
      project_model_line_id = excluded.project_model_line_id,
      source_type = excluded.source_type,
      formula_material_code = excluded.formula_material_code,
      master_item_id = excluded.master_item_id,
      selected_brand_id = excluded.selected_brand_id,
      selected_variant_id = excluded.selected_variant_id,
      quantity = excluded.quantity,
      unit_snapshot = excluded.unit_snapshot,
      item_name_snapshot = excluded.item_name_snapshot,
      group_name_snapshot = excluded.group_name_snapshot,
      brand_name_snapshot = excluded.brand_name_snapshot,
      variant_name_snapshot = excluded.variant_name_snapshot,
      unit_price_snapshot = excluded.unit_price_snapshot,
      price_version_snapshot = excluded.price_version_snapshot,
      price_is_set = excluded.price_is_set,
      position = excluded.position,
      updated_at = now()
    where public.project_line_material_items.project_id = v_project_id;

    if not found then
      raise exception 'Project material row does not belong to this project' using errcode = '42501';
    end if;
  end loop;

  delete from public.project_line_material_items
  where project_id = v_project_id
    and not (id = any(v_item_ids));

  return v_project_id;
end;
$function$;

revoke all on function public.save_project_with_material_items(uuid, text, text, text, jsonb, jsonb, jsonb, jsonb)
  from public, anon;
grant execute on function public.save_project_with_material_items(uuid, text, text, text, jsonb, jsonb, jsonb, jsonb)
  to authenticated;
