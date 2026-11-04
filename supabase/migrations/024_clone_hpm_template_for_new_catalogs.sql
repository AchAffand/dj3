create or replace function public.create_budget_catalog(p_label text, p_slug text)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_catalog_id uuid;
  v_template_id uuid;
  v_position integer;
begin
  if not (select private.is_catalog_admin()) then
    raise exception 'Catalog admin access required' using errcode = '42501';
  end if;
  if nullif(trim(p_label), '') is null then
    raise exception 'Nama merek wajib diisi' using errcode = '22023';
  end if;
  if p_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then
    raise exception 'Format kode merek tidak valid' using errcode = '22023';
  end if;
  if exists (select 1 from public.budget_catalogs where slug = p_slug) then
    raise exception 'Merek dengan nama tersebut sudah ada' using errcode = '23505';
  end if;

  select id into v_template_id from public.budget_catalogs
  where slug = 'hpm-inka-dacon' and active;
  if v_template_id is null then
    raise exception 'Template HPM / INKA / DACON tidak ditemukan' using errcode = 'P0002';
  end if;

  select coalesce(max(position), 0) + 1 into v_position from public.budget_catalogs;
  insert into public.budget_catalogs (slug, label, position, active)
  values (p_slug, trim(p_label), v_position, true)
  returning id into v_catalog_id;

  insert into public.budget_variants (catalog_id, variant_key, label, source_row, position)
  select v_catalog_id, variant_key, label, source_row, position
  from public.budget_variants where catalog_id = v_template_id order by position;

  insert into public.budget_components
    (catalog_id, component_key, source_column, label, unit, category, position, active, group_label)
  select v_catalog_id, component_key, source_column, label, unit, category, position, true, group_label
  from public.budget_components where catalog_id = v_template_id and active order by position;

  insert into public.budget_prices (component_id, variant_id, amount, expression, source_cell)
  select new_component.id, new_variant.id, null, null, 'TEMPLATE'
  from public.budget_components new_component
  join public.budget_components template_component
    on template_component.catalog_id = v_template_id
   and template_component.component_key = new_component.component_key
  cross join public.budget_variants new_variant
  where new_component.catalog_id = v_catalog_id and new_variant.catalog_id = v_catalog_id;

  insert into public.budget_calculation_rules
    (catalog_id, line_position, component_id, variant_id, source_formula)
  select v_catalog_id, rule.line_position, new_component.id, new_variant.id, rule.source_formula
  from public.budget_calculation_rules rule
  join public.budget_components template_component on template_component.id = rule.component_id
  join public.budget_components new_component
    on new_component.catalog_id = v_catalog_id
   and new_component.component_key = template_component.component_key
  join public.budget_variants template_variant on template_variant.id = rule.variant_id
  join public.budget_variants new_variant
    on new_variant.catalog_id = v_catalog_id
   and new_variant.variant_key = template_variant.variant_key
  where rule.catalog_id = v_template_id;

  insert into public.budget_material_mappings
    (catalog_id, material_key, material_name, material_unit, component_id, active)
  select v_catalog_id, mapping.material_key, mapping.material_name, mapping.material_unit,
         new_component.id, mapping.active
  from public.budget_material_mappings mapping
  left join public.budget_components template_component on template_component.id = mapping.component_id
  left join public.budget_components new_component
    on new_component.catalog_id = v_catalog_id
   and new_component.component_key = template_component.component_key
  where mapping.catalog_id = v_template_id;

  return v_catalog_id;
end;
$$;

grant insert on public.budget_catalogs, public.budget_components, public.budget_variants,
  public.budget_prices, public.budget_calculation_rules, public.budget_material_mappings
  to authenticated;
revoke all on function public.create_budget_catalog(text, text) from public, anon, authenticated;
grant execute on function public.create_budget_catalog(text, text) to authenticated;
