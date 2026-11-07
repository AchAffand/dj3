-- Restore the HPM / INKA / DACON accessory items from the workbook.
-- Source: "Master budget_DJ3 bengkel.xlsx", sheet "Hpm-inka-dacon dll",
-- columns AZ:BU, price row 11, and variant rows 14 / 17 / 20.
-- All three finish variants reference the same workbook base value for these items.
-- Insert-only for missing components/prices so existing admin-edited rows are preserved.

with accessory_items(component_key, source_column, label, unit, category, position, group_label) as (
  values
    ('col_ba', 'BA', 'Rambuncis', 'pcs', 'Aksesori', 48, 'ASSESORIS / PCS'),
    ('col_bb', 'BB', 'Engsel Casement', 'pcs', 'Aksesori', 49, 'ASSESORIS / PCS'),
    ('col_bc', 'BC', 'Engsel Kupu 4"', 'pcs', 'Aksesori', 50, 'ASSESORIS / PCS'),
    ('col_bd', 'BD', 'Handle + kunci', 'pcs', 'Aksesori', 51, 'ASSESORIS / PCS'),
    ('col_be', 'BE', 'Handle H P 35 cm', 'pcs', 'Aksesori', 52, 'ASSESORIS / PCS'),
    ('col_bf', 'BF', 'Handle H P 45 cm', 'pcs', 'Aksesori', 53, 'ASSESORIS / PCS'),
    ('col_bg', 'BG', 'Handle', 'pcs', 'Aksesori', 54, 'ASSESORIS / PCS'),
    ('col_bh', 'BH', 'Kunci pelor', 'pcs', 'Aksesori', 55, 'ASSESORIS / PCS'),
    ('col_bi', 'BI', 'Engsel Kupu KM', 'pcs', 'Aksesori', 56, 'ASSESORIS / PCS'),
    ('col_bj', 'BJ', 'Handle Kunci KM', 'pcs', 'Aksesori', 57, 'ASSESORIS / PCS'),
    ('col_bk', 'BK', 'Flushbolt', 'pcs', 'Aksesori', 58, 'ASSESORIS / PCS'),
    ('col_bl', 'BL', 'Rel Sliding', 'pcs', 'Aksesori', 59, 'ASSESORIS / PCS'),
    ('col_bm', 'BM', 'Handle Mangkok', 'pcs', 'Aksesori', 60, 'ASSESORIS / PCS'),
    ('col_bn', 'BN', 'Kunci Sliding Pintu', 'pcs', 'Aksesori', 61, 'ASSESORIS / PCS'),
    ('col_bo', 'BO', 'Kunci Sliding Jendela RA', 'pcs', 'Aksesori', 62, 'ASSESORIS / PCS'),
    ('col_bp', 'BP', 'Roda Sliding Selip', 'pcs', 'Aksesori', 63, 'ASSESORIS / PCS'),
    ('col_bq', 'BQ', 'Grendel Kuping', 'pcs', 'Aksesori', 64, 'ASSESORIS / PCS'),
    ('col_br', 'BR', 'Handle C (handerson)', 'pcs', 'Aksesori', 65, 'ASSESORIS / PCS'),
    ('col_bs', 'BS', 'Breket (henderson)', 'pcs', 'Aksesori', 66, 'ASSESORIS / PCS'),
    ('col_bt', 'BT', 'Roda Atas (henderson)', 'pcs', 'Aksesori', 67, 'ASSESORIS / PCS'),
    ('col_bu', 'BU', 'Roda Bawah (henderson)', 'pcs', 'Aksesori', 68, 'ASSESORIS / PCS')
)
insert into public.budget_components
  (catalog_id, component_key, source_column, label, unit, category, position, active, group_label)
select c.id, i.component_key, i.source_column, i.label, i.unit, i.category, i.position, true, i.group_label
from public.budget_catalogs c
cross join accessory_items i
where c.slug = 'hpm-inka-dacon'
on conflict (catalog_id, component_key) do nothing;

-- Store the workbook's evaluated numeric prices directly. This avoids a self-referencing
-- "price_col_*_base" expression for accessories, whose source cells are simple references
-- to row 11 rather than independent calculations.
with accessory_prices(component_key, source_column, amount) as (
  values
    ('col_ba', 'BA', 15000),
    ('col_bb', 'BB', 100000),
    ('col_bc', 'BC', 55000),
    ('col_bd', 'BD', 350000),
    ('col_be', 'BE', 350000),
    ('col_bf', 'BF', 600000),
    ('col_bg', 'BG', 0),
    ('col_bh', 'BH', 350000),
    ('col_bi', 'BI', 35000),
    ('col_bj', 'BJ', 150000),
    ('col_bk', 'BK', 45000),
    ('col_bl', 'BL', 300000),
    ('col_bm', 'BM', 60000),
    ('col_bn', 'BN', 250000),
    ('col_bo', 'BO', 150000),
    ('col_bp', 'BP', 45000),
    ('col_bq', 'BQ', 50000),
    ('col_br', 'BR', 200000),
    ('col_bs', 'BS', 140000),
    ('col_bt', 'BT', 275000),
    ('col_bu', 'BU', 175000)
),
price_rows as (
  select
    comp.id as component_id,
    var.id as variant_id,
    p.amount,
    p.source_column || case when var.variant_key = 'coating' then '14' else '11' end as source_formula_cell,
    p.source_column || case var.variant_key
      when 'brown' then '14'
      when 'cream' then '17'
      else '20'
    end as source_cell,
    '=' || p.source_column || case when var.variant_key = 'coating' then '14' else '11' end as source_formula
  from public.budget_catalogs c
  join accessory_prices p on true
  join public.budget_components comp
    on comp.catalog_id = c.id and comp.component_key = p.component_key
  join public.budget_variants var
    on var.catalog_id = c.id and var.variant_key in ('brown', 'cream', 'coating')
  where c.slug = 'hpm-inka-dacon'
)
insert into public.budget_prices
  (component_id, variant_id, amount, expression, source_cell, source_formula, source_value, version)
select component_id, variant_id, amount, null, source_cell, source_formula, amount::text, 1
from price_rows
on conflict (component_id, variant_id) do nothing;

-- The existing AZ / Aseseris Pivot row was seeded as a self-reference. Convert it to
-- the workbook's evaluated value only while it is still untouched at seed version 1.
with updated as (
  update public.budget_prices bp
  set amount = 165000,
      expression = null,
      source_value = '165000',
      version = 2,
      updated_at = now()
  from public.budget_catalogs c
  join public.budget_components comp on comp.catalog_id = c.id and comp.source_column = 'AZ'
  join public.budget_variants var on var.catalog_id = c.id
  where c.slug = 'hpm-inka-dacon'
    and bp.component_id = comp.id
    and bp.variant_id = var.id
    and var.variant_key in ('brown', 'cream', 'coating')
    and bp.amount is null
    and bp.version = 1
    and bp.expression in ('price_col_az_base', 'price_col_az_brown')
  returning bp.component_id, bp.variant_id, bp.version, bp.amount, bp.expression, bp.updated_by
)
insert into public.budget_price_versions
  (component_id, variant_id, version, amount, expression, changed_by)
select component_id, variant_id, version, amount, expression, updated_by
from updated
on conflict (component_id, variant_id, version) do nothing;

-- Record initial price history for newly inserted accessory price rows.
insert into public.budget_price_versions
  (component_id, variant_id, version, amount, expression, changed_by)
select bp.component_id, bp.variant_id, bp.version, bp.amount, bp.expression, bp.updated_by
from public.budget_prices bp
join public.budget_components comp on comp.id = bp.component_id
join public.budget_catalogs c on c.id = comp.catalog_id
where c.slug = 'hpm-inka-dacon'
  and comp.source_column between 'AZ' and 'BU'
  and bp.version = 1
on conflict (component_id, variant_id, version) do nothing;

do $$
declare
  accessory_component_count integer;
  accessory_price_count integer;
begin
  select count(*) into accessory_component_count
  from public.budget_components comp
  join public.budget_catalogs c on c.id = comp.catalog_id
  where c.slug = 'hpm-inka-dacon'
    and comp.source_column between 'AZ' and 'BU'
    and comp.active;

  select count(*) into accessory_price_count
  from public.budget_prices bp
  join public.budget_components comp on comp.id = bp.component_id
  join public.budget_catalogs c on c.id = comp.catalog_id
  where c.slug = 'hpm-inka-dacon'
    and comp.source_column between 'AZ' and 'BU'
    and comp.active;

  if accessory_component_count <> 22 then
    raise exception 'Expected 22 active HPM accessory components, found %', accessory_component_count;
  end if;
  if accessory_price_count <> 66 then
    raise exception 'Expected 66 HPM accessory variant prices, found %', accessory_price_count;
  end if;
end $$;
