-- Connect model accessory materials to the HPM / INKA / DACON price catalog.
-- Keep the existing price variants and saved project snapshots intact.

update public.materials
set name = 'Engsel Casement'
where lower(trim(name)) in ('engsel casmat', 'engsel casment');

update public.materials
set name = 'Rambuncis'
where lower(trim(name)) = 'rambancis';

update public.materials
set name = 'Flushbolt'
where lower(trim(name)) = 'flashbolt';

with desired(material_key, material_name, material_unit, source_column) as (values
  ('rambuncis|pcs', 'Rambuncis', 'pcs', 'BA'),
  ('engsel casement|pcs', 'Engsel Casement', 'pcs', 'BB'),
  ('engsel casement|set', 'Engsel Casement', 'set', 'BB'),
  ('engsel kupu|pcs', 'Engsel Kupu', 'pcs', 'BC'),
  ('engsel kupu|set', 'Engsel Kupu', 'set', 'BC'),
  ('handel + kunci|set', 'Handle + kunci', 'set', 'BD'),
  ('handel + kunci|pcs', 'Handle + kunci', 'pcs', 'BD'),
  ('handle|set', 'Handle', 'set', 'BG'),
  ('handel mangkok|pcs', 'Handle Mangkok', 'pcs', 'BM'),
  ('handel mangkok|set', 'Handle Mangkok', 'set', 'BM'),
  ('kunci sliding|set', 'Kunci Sliding', 'set', 'BN'),
  ('kunci ra|pcs', 'Kunci RA', 'pcs', 'BO'),
  ('flushbolt|pcs', 'Flushbolt', 'pcs', 'BK')
), catalog as (
  select id from public.budget_catalogs where slug = 'hpm-inka-dacon'
), resolved as (
  select catalog.id as catalog_id, desired.*, component.id as component_id
  from catalog
  cross join desired
  join public.budget_components component
    on component.catalog_id = catalog.id
   and component.source_column = desired.source_column
   and component.active = true
)
insert into public.budget_material_mappings
  (catalog_id, material_key, material_name, material_unit, component_id, active)
select catalog_id, material_key, material_name, material_unit, component_id, true
from resolved
on conflict (catalog_id, material_key) do update
set component_id = coalesce(public.budget_material_mappings.component_id, excluded.component_id),
    active = true;

-- Doorcloser deliberately remains unmapped: it has no corresponding item in
-- the supplied HPM / INKA / DACON workbook accessory columns AZ:BU.