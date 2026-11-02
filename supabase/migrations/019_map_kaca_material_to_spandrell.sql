begin;

-- New door/window models use the concise material name "kaca". Link it to
-- the same Spandrell / M2 price component as the older combined glass item.
insert into public.budget_material_mappings (catalog_id, material_key, material_name, material_unit, component_id)
select catalog.id, 'kaca|m"', 'kaca', 'm"', component.id
from public.budget_catalogs catalog
join public.budget_components component
  on component.catalog_id = catalog.id
 and lower(component.label) = lower('SPANDRELL / M2')
where catalog.slug in ('alexindo', 'hpm-inka-dacon')
on conflict (catalog_id, material_key) do nothing;

commit;
