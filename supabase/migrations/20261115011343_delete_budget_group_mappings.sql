-- Remove active formula-to-component mappings when their Master Harga group is deleted.
create or replace function public.delete_budget_component_groups(p_catalog_id uuid, p_group_ids uuid[])
returns integer language plpgsql security definer set search_path = '' as $$
declare v_group record; v_deleted integer := 0; v_count integer;
begin
  if not (select private.is_catalog_admin()) then raise exception 'Catalog admin access required' using errcode='42501'; end if;
  if coalesce(array_length(p_group_ids,1),0)=0 then raise exception 'Pilih minimal satu kelompok' using errcode='22023'; end if;
  for v_group in select id,name from public.budget_component_groups where catalog_id=p_catalog_id and id=any(p_group_ids) for update loop
    delete from public.budget_material_mappings
      where catalog_id=p_catalog_id
        and component_id in (select id from public.budget_components where catalog_id=p_catalog_id and category=v_group.name);
    delete from public.budget_components where catalog_id=p_catalog_id and category=v_group.name;
    get diagnostics v_count = row_count;
    v_deleted := v_deleted + v_count;
    delete from public.budget_component_groups where id=v_group.id;
  end loop;
  return v_deleted;
end; $$;