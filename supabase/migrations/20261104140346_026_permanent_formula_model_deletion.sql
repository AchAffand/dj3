create or replace function public.delete_formula_model_permanently(p_model_code integer)
returns void language plpgsql security definer set search_path = '' as $$
declare v_material_codes integer[];
begin
 if not (select private.is_catalog_admin()) then raise exception 'Catalog administrator access required' using errcode = '42501'; end if;
 perform 1 from public.door_models where code = p_model_code for update;
 if not found then raise exception 'Model tidak ditemukan' using errcode = 'P0002'; end if;
 if exists (select 1 from public.project_model_lines where model_code = p_model_code) then raise exception 'Model tidak dapat dihapus karena sudah digunakan dalam proyek. Riwayat proyek harus tetap dipertahankan.' using errcode = '23503'; end if;
 select coalesce(array_agg(material_code), array[]::integer[]) into v_material_codes from public.model_materials where model_code = p_model_code;
 if exists (select 1 from public.model_materials dependent where dependent.model_code <> p_model_code and exists (select 1 from unnest(v_material_codes) target(material_code) where dependent.current_expression ~ ('(^|[^[:alnum:]_])qty_' || target.material_code::text || '([^[:digit:]]|$)'))) then raise exception 'Model masih digunakan oleh rumus model lain. Hapus atau ubah referensi rumus tersebut terlebih dahulu.' using errcode = '23503'; end if;
 if exists (select 1 from public.project_material_prices where material_code = any(v_material_codes)) or exists (select 1 from public.project_line_price_snapshots where material_code = any(v_material_codes)) then raise exception 'Material model ini masih tersimpan pada harga proyek. Data proyek harus tetap dipertahankan.' using errcode = '23503'; end if;
 delete from public.formula_versions where material_code = any(v_material_codes);
 delete from public.model_materials where model_code = p_model_code;
 delete from public.materials material where material.code = any(v_material_codes) and not exists (select 1 from public.model_materials linked where linked.material_code = material.code) and not exists (select 1 from public.project_material_prices price where price.material_code = material.code) and not exists (select 1 from public.project_line_price_snapshots snapshot where snapshot.material_code = material.code);
 delete from public.door_models where code = p_model_code;
 delete from public.model_groups group_row where group_row.group_code = (select dm.group_code from public.door_models dm where dm.code = p_model_code) and not exists (select 1 from public.door_models dm where dm.group_code = group_row.group_code);
end; $$;
revoke all on function public.delete_formula_model_permanently(integer) from public, anon;
grant execute on function public.delete_formula_model_permanently(integer) to authenticated;