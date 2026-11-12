-- Split common glass and accessory pricing from aluminium-brand catalogues.
-- Existing brand catalogues remain active for backwards compatibility.
-- Shared glass prices use HPM / INKA / DACON as the initial source where names match;
-- Alexindo lists Sealant under Kaca; HPM lists it under finishing at a different price, so those remain separate.
-- Shared accessory prices use the complete HPM / INKA / DACON list. The Alexindo
-- Pivot spelling is already represented by the same pivot item and is not duplicated.

alter table public.project_line_price_snapshots
  add column snapshot_component_key uuid
  generated always as (
    coalesce(component_id, '00000000-0000-0000-0000-000000000000'::uuid)
  ) stored;

alter table public.project_line_price_snapshots
  drop constraint project_line_price_snapshots_pkey;

alter table public.project_line_price_snapshots
  add constraint project_line_price_snapshots_pkey
  primary key (project_id, material_code, catalog_id, variant_id, snapshot_component_key);

create or replace function public.save_project_with_budget_prices(
  p_project_id uuid,
  p_name text,
  p_location text,
  p_floor text,
  p_lines jsonb,
  p_prices jsonb,
  p_price_snapshots jsonb
)
returns uuid
language plpgsql
set search_path = ''
as $function$
declare
  v_project_id uuid;
  v_snapshot jsonb;
begin
  if jsonb_typeof(p_price_snapshots) <> 'array' then
    raise exception 'Price snapshots must be an array' using errcode = '22023';
  end if;

  v_project_id := public.save_project_with_metadata(
    p_project_id, p_name, p_lines, p_prices, p_location, p_floor
  );

  update public.project_model_lines line
  set price_catalog_id = nullif(item.value ->> 'price_catalog_id', '')::uuid,
      price_variant_id = nullif(item.value ->> 'price_variant_id', '')::uuid
  from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) item(value)
  where line.project_id = v_project_id
    and line.id = nullif(item.value ->> 'id', '')::uuid;

  delete from public.project_line_price_snapshots
  where project_id = v_project_id;

  for v_snapshot in select value from jsonb_array_elements(p_price_snapshots)
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

  return v_project_id;
end;
$function$;

insert into public.budget_catalogs (slug, label, position, active)
select 'kaca-umum', 'Kaca', coalesce(max(position), 0) + 1, true
from public.budget_catalogs
on conflict (slug) do nothing;

insert into public.budget_catalogs (slug, label, position, active)
select 'aksesoris-umum', 'Aksesoris', coalesce(max(position), 0) + 1, true
from public.budget_catalogs
on conflict (slug) do nothing;

do $$
declare
  v_glass_catalog uuid;
  v_accessory_catalog uuid;
  v_hpm_catalog uuid;
  v_alexindo_catalog uuid;
  v_standard_glass_variant uuid;
  v_standard_accessory_variant uuid;
begin
  select id into v_glass_catalog from public.budget_catalogs where slug = 'kaca-umum';
  select id into v_accessory_catalog from public.budget_catalogs where slug = 'aksesoris-umum';
  select id into v_hpm_catalog from public.budget_catalogs where slug = 'hpm-inka-dacon';
  select id into v_alexindo_catalog from public.budget_catalogs where slug = 'alexindo';

  if v_glass_catalog is null or v_accessory_catalog is null
     or v_hpm_catalog is null or v_alexindo_catalog is null then
    raise exception 'Katalog sumber atau katalog kelompok bersama tidak ditemukan';
  end if;

  insert into public.budget_variants (catalog_id, variant_key, label, source_row, position)
  values
    (v_glass_catalog, 'standar', 'Standar', 1, 1),
    (v_accessory_catalog, 'standar', 'Standar', 1, 1)
  on conflict (catalog_id, variant_key) do nothing;

  select id into v_standard_glass_variant
  from public.budget_variants where catalog_id = v_glass_catalog and variant_key = 'standar';
  select id into v_standard_accessory_variant
  from public.budget_variants where catalog_id = v_accessory_catalog and variant_key = 'standar';

  -- Union of the two glass lists by normalized item name. HPM is preferred
  -- for the shared 11 items; HPM's unique 12 mm tempered glass and Alexindo's
  -- unique Sealant item are both retained.
  with source_items as (
    select
      lower(regexp_replace(trim(component.label), '[[:space:]]+', ' ', 'g')) as normalized_label,
      component.label,
      component.unit,
      component.id as source_component_id,
      component.source_column,
      1 as source_priority
    from public.budget_components component
    where component.catalog_id = v_hpm_catalog
      and component.category = 'Kaca'
      and component.active = true

    union all

    select
      lower(regexp_replace(trim(component.label), '[[:space:]]+', ' ', 'g')) as normalized_label,
      component.label,
      component.unit,
      component.id as source_component_id,
      component.source_column,
      2 as source_priority
    from public.budget_components component
    where component.catalog_id = v_alexindo_catalog
      and component.category = 'Kaca'
      and component.active = true
  ),
  preferred as (
    select distinct on (normalized_label)
      normalized_label, label, unit, source_component_id, source_column
    from source_items
    order by normalized_label, source_priority
  ),
  numbered as (
    select
      row_number() over (order by normalized_label)::integer as item_number,
      label, unit
    from preferred
  )
  insert into public.budget_components (
    catalog_id, component_key, source_column, label, unit,
    category, position, active, group_label
  )
  select
    v_glass_catalog,
    'glass_' || lpad(item_number::text, 2, '0'),
    chr(64 + item_number),
    label,
    unit,
    'Kaca',
    item_number,
    true,
    'KACA UMUM'
  from numbered
  on conflict (catalog_id, component_key) do nothing;

  -- One stable standard price per glass item. The 11 matched items have the
  -- same initial price in both source catalogues; source data remains auditable.
  with source_items as (
    select
      lower(regexp_replace(trim(component.label), '[[:space:]]+', ' ', 'g')) as normalized_label,
      component.id as source_component_id,
      1 as source_priority
    from public.budget_components component
    where component.catalog_id = v_hpm_catalog and component.category = 'Kaca' and component.active = true
    union all
    select
      lower(regexp_replace(trim(component.label), '[[:space:]]+', ' ', 'g')) as normalized_label,
      component.id as source_component_id,
      2 as source_priority
    from public.budget_components component
    where component.catalog_id = v_alexindo_catalog and component.category = 'Kaca' and component.active = true
  ),
  preferred as (
    select distinct on (normalized_label) normalized_label, source_component_id
    from source_items
    order by normalized_label, source_priority
  )
  insert into public.budget_prices (
    component_id, variant_id, amount, expression, source_cell, source_formula, source_value
  )
  select
    shared_component.id,
    v_standard_glass_variant,
    source_price.amount,
    null,
    'SHARED_GLASS',
    null,
    source_price.source_value
  from public.budget_components shared_component
  join preferred on preferred.normalized_label =
    lower(regexp_replace(trim(shared_component.label), '[[:space:]]+', ' ', 'g'))
  left join public.budget_prices source_price
    on source_price.component_id = preferred.source_component_id
   and source_price.variant_id = (
     select id from public.budget_variants
     where catalog_id = v_hpm_catalog and variant_key = 'brown'
   )
  where shared_component.catalog_id = v_glass_catalog
  on conflict (component_id, variant_id) do update
    set amount = excluded.amount,
        expression = excluded.expression,
        source_cell = excluded.source_cell,
        source_value = excluded.source_value;

  -- The Alexindo-only Sealant entry has no HPM counterpart. If HPM is preferred
  -- for the same normalized name, this falls back to Alexindo's base variant.
  update public.budget_prices target
  set amount = alex_price.amount,
      source_value = alex_price.source_value,
      source_cell = 'ALEXINDO_SOURCE'
  from public.budget_components shared_component
  join public.budget_components alex_component
    on alex_component.catalog_id = v_alexindo_catalog
   and lower(regexp_replace(trim(alex_component.label), '[[:space:]]+', ' ', 'g')) =
       lower(regexp_replace(trim(shared_component.label), '[[:space:]]+', ' ', 'g'))
   and alex_component.category = 'Kaca'
  join public.budget_prices alex_price
    on alex_price.component_id = alex_component.id
   and alex_price.variant_id = (
     select id from public.budget_variants
     where catalog_id = v_alexindo_catalog and variant_key = 'base'
   )
  where target.component_id = shared_component.id
    and target.variant_id = v_standard_glass_variant
    and shared_component.catalog_id = v_glass_catalog
    and not exists (
      select 1 from public.budget_components hpm_component
      where hpm_component.catalog_id = v_hpm_catalog
        and hpm_component.category = 'Kaca'
        and lower(regexp_replace(trim(hpm_component.label), '[[:space:]]+', ' ', 'g')) =
            lower(regexp_replace(trim(shared_component.label), '[[:space:]]+', ' ', 'g'))
    );

  -- Copy the full active HPM / INKA / DACON accessory catalogue and prices.
  insert into public.budget_components (
    catalog_id, component_key, source_column, label, unit,
    category, position, active, group_label
  )
  select
    v_accessory_catalog,
    source.component_key,
    source.source_column,
    source.label,
    source.unit,
    'Aksesori',
    row_number() over (order by source.position)::integer,
    true,
    'AKSESORIS UMUM'
  from public.budget_components source
  where source.catalog_id = v_hpm_catalog
    and source.category = 'Aksesori'
    and source.active = true
  on conflict (catalog_id, component_key) do nothing;

  insert into public.budget_prices (
    component_id, variant_id, amount, expression, source_cell, source_formula, source_value
  )
  select
    shared_component.id,
    v_standard_accessory_variant,
    source_price.amount,
    source_price.expression,
    'HPM_ACCESSORY_SOURCE',
    source_price.source_formula,
    source_price.source_value
  from public.budget_components shared_component
  join public.budget_components source_component
    on source_component.catalog_id = v_hpm_catalog
   and source_component.component_key = shared_component.component_key
  join public.budget_prices source_price
    on source_price.component_id = source_component.id
   and source_price.variant_id = (
     select id from public.budget_variants
     where catalog_id = v_hpm_catalog and variant_key = 'brown'
   )
  where shared_component.catalog_id = v_accessory_catalog
  on conflict (component_id, variant_id) do update
    set amount = excluded.amount,
        expression = excluded.expression,
        source_cell = excluded.source_cell,
        source_formula = excluded.source_formula,
        source_value = excluded.source_value;

  -- Preserve the existing material-to-accessory defaults, now pointing to the
  -- independent accessory catalogue rather than the aluminium-brand catalogue.
  insert into public.budget_material_mappings (
    catalog_id, material_key, material_name, material_unit, component_id, active
  )
  select
    v_accessory_catalog,
    mapping.material_key,
    mapping.material_name,
    mapping.material_unit,
    shared_component.id,
    true
  from public.budget_material_mappings mapping
  join public.budget_components source_component
    on source_component.id = mapping.component_id
   and source_component.catalog_id = v_hpm_catalog
  join public.budget_components shared_component
    on shared_component.catalog_id = v_accessory_catalog
   and shared_component.component_key = source_component.component_key
  where mapping.catalog_id = v_hpm_catalog
    and mapping.active = true
    and source_component.category = 'Aksesori'
  on conflict (catalog_id, material_key) do update
    set component_id = excluded.component_id,
        active = true;

  -- Formula materials that have no priced source row yet remain visible in
  -- the shared accessory group, ready for an administrator to fill in.
  insert into public.budget_components (
    catalog_id, component_key, source_column, label, unit,
    category, position, active, group_label
  )
  select
    v_accessory_catalog,
    item.component_key,
    item.source_column,
    item.label,
    item.unit,
    'Aksesori',
    (select coalesce(max(position), 0) from public.budget_components where catalog_id = v_accessory_catalog)
      + row_number() over (order by item.sort_order)::integer,
    true,
    'AKSESORIS UMUM'
  from (values
    ('manual_doorcloser', 'BV', 'Doorcloser', 'set', 1),
    ('manual_kunci_folding', 'BW', 'Kunci Folding', 'set', 2),
    ('manual_engsel', 'BX', 'Engsel', 'set', 3),
    ('manual_engsel_pintu', 'BY', 'Engsel Pintu', 'set', 4)
  ) as item(component_key, source_column, label, unit, sort_order)
  on conflict (catalog_id, component_key) do nothing;

  insert into public.budget_material_mappings (
    catalog_id, material_key, material_name, material_unit, component_id, active
  )
  select
    v_accessory_catalog,
    item.material_key,
    item.material_name,
    item.material_unit,
    component.id,
    true
  from (values
    ('doorcloser|set', 'Doorcloser', 'set', 'manual_doorcloser'),
    ('kunci folding|set', 'Kunci Folding', 'set', 'manual_kunci_folding'),
    ('engsel|set', 'Engsel', 'set', 'manual_engsel'),
    ('engsel pintu|set', 'Engsel Pintu', 'set', 'manual_engsel_pintu')
  ) as item(material_key, material_name, material_unit, component_key)
  join public.budget_components component
    on component.catalog_id = v_accessory_catalog
   and component.component_key = item.component_key
  on conflict (catalog_id, material_key) do update
    set component_id = excluded.component_id,
        active = true;
end;
$;
