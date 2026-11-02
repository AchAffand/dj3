alter table public.model_materials drop column if exists is_active;

create or replace function public.delete_formula_material(
  p_model_code integer,
  p_material_code integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (select private.is_catalog_admin()) then
    raise exception 'Catalog administrator access required' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.model_materials
    where model_code = p_model_code and material_code = p_material_code
  ) then
    raise exception 'Material tidak ditemukan pada model ini' using errcode = '22023';
  end if;

  if exists (
    select 1 from public.model_materials
    where material_code <> p_material_code
      and current_expression ~ ('(^|[^[:alnum:]_])qty_' || p_material_code::text || '([^[:digit:]]|$)')
  ) then
    raise exception 'Material masih dipakai oleh rumus lain. Ubah rumus yang merujuk kode ini terlebih dahulu.' using errcode = '23503';
  end if;

  -- Formula history belongs to the catalog entry and is removed with it.
  delete from public.formula_versions where material_code = p_material_code;
  delete from public.model_materials
  where model_code = p_model_code and material_code = p_material_code;

  -- Keep the material row only when saved project prices still refer to its code.
  -- It is no longer part of any model catalog after its model_materials row is removed.
  if not exists (select 1 from public.project_material_prices where material_code = p_material_code)
     and not exists (select 1 from public.project_line_price_snapshots where material_code = p_material_code) then
    delete from public.materials where code = p_material_code;
  end if;
end;
$$;

revoke all on function public.delete_formula_material(integer, integer) from public, anon;
grant execute on function public.delete_formula_material(integer, integer) to authenticated;
