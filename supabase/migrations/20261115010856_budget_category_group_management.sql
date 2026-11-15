-- Master Harga groups represent the category column, not the workbook section label.
delete from public.budget_component_groups;
insert into public.budget_component_groups (catalog_id, name, position)
select c.catalog_id, trim(c.category), row_number() over (partition by c.catalog_id order by min(c.position))
from public.budget_components c
where c.active and length(trim(coalesce(c.category,''))) > 0
group by c.catalog_id, trim(c.category)
on conflict do nothing;

create or replace function public.rename_budget_component_group(p_catalog_id uuid, p_group_id uuid, p_name text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_old_name text;
begin
  if not (select private.is_catalog_admin()) then raise exception 'Catalog admin access required' using errcode='42501'; end if;
  if length(trim(coalesce(p_name,''))) = 0 then raise exception 'Nama kelompok wajib diisi' using errcode='22023'; end if;
  select name into v_old_name from public.budget_component_groups where id=p_group_id and catalog_id=p_catalog_id for update;
  if v_old_name is null then raise exception 'Kelompok tidak ditemukan' using errcode='P0002'; end if;
  update public.budget_component_groups set name=trim(p_name),updated_at=now() where id=p_group_id;
  update public.budget_components set category=trim(p_name),updated_at=now()
    where catalog_id=p_catalog_id and category=v_old_name;
end; $$;

create or replace function public.delete_budget_component_groups(p_catalog_id uuid, p_group_ids uuid[])
returns integer language plpgsql security definer set search_path = '' as $$
declare v_group record; v_deleted integer := 0; v_count integer;
begin
  if not (select private.is_catalog_admin()) then raise exception 'Catalog admin access required' using errcode='42501'; end if;
  if coalesce(array_length(p_group_ids,1),0)=0 then raise exception 'Pilih minimal satu kelompok' using errcode='22023'; end if;
  for v_group in select id,name from public.budget_component_groups where catalog_id=p_catalog_id and id=any(p_group_ids) for update loop
    delete from public.budget_components where catalog_id=p_catalog_id and category=v_group.name;
    get diagnostics v_count = row_count;
    v_deleted := v_deleted + v_count;
    delete from public.budget_component_groups where id=v_group.id;
  end loop;
  return v_deleted;
end; $$;