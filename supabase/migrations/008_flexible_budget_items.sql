alter table public.budget_components
  add column if not exists group_label text not null default '';

-- The workbook's accessory header is merged over several price columns.
update public.budget_variants v
set label = 'ITEM ALEXINDO SILVER'
from public.budget_catalogs c
where v.catalog_id = c.id and c.slug = 'alexindo' and v.variant_key = 'base';

update public.budget_components
set label = 'Aseseris Pivot', unit = 'pcs', category = 'Aksesori', group_label = 'ASSESORIS / PCS', updated_at = now()
where catalog_id = (select id from public.budget_catalogs where slug = 'alexindo') and component_key = 'col_ay';

update public.budget_components
set label = 'Aseseris Pivot', unit = 'pcs', category = 'Aksesori', group_label = 'ASSESORIS / PCS', updated_at = now()
where catalog_id = (select id from public.budget_catalogs where slug = 'hpm-inka-dacon') and component_key = 'col_az';

create or replace function public.save_budget_component(
  p_catalog_id uuid,
  p_component_id uuid,
  p_component_key text,
  p_label text,
  p_unit text,
  p_category text,
  p_group_label text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not (select private.is_catalog_admin()) then
    raise exception 'Catalog admin access required' using errcode = '42501';
  end if;
  if length(trim(coalesce(p_label, ''))) = 0 or length(trim(coalesce(p_category, ''))) = 0 then
    raise exception 'Item name and category are required' using errcode = '22023';
  end if;
  if not exists (select 1 from public.budget_catalogs where id = p_catalog_id and active) then
    raise exception 'Budget catalog not found' using errcode = 'P0002';
  end if;

  if p_component_id is null then
    if coalesce(p_component_key, '') !~ '^manual_[a-z0-9_]+$' then
      raise exception 'Invalid component key' using errcode = '22023';
    end if;
    insert into public.budget_components (catalog_id, component_key, source_column, label, unit, category, position, group_label)
    values (p_catalog_id, p_component_key, 'Manual', trim(p_label), trim(coalesce(p_unit, '')), trim(p_category),
      coalesce((select max(position) + 1 from public.budget_components where catalog_id = p_catalog_id), 1), trim(coalesce(p_group_label, '')))
    returning id into v_id;
    insert into public.budget_prices (component_id, variant_id, amount, expression, source_cell)
    select v_id, variant.id, null, null, 'MANUAL'
    from public.budget_variants variant where variant.catalog_id = p_catalog_id;
  else
    update public.budget_components set label = trim(p_label), unit = trim(coalesce(p_unit, '')),
      category = trim(p_category), group_label = trim(coalesce(p_group_label, '')), updated_at = now()
    where id = p_component_id and catalog_id = p_catalog_id and active
    returning id into v_id;
    if v_id is null then
      raise exception 'Budget item not found' using errcode = 'P0002';
    end if;
  end if;
  return v_id;
end;
$$;
revoke all on function public.save_budget_component(uuid, uuid, text, text, text, text, text) from public, anon;
grant execute on function public.save_budget_component(uuid, uuid, text, text, text, text, text) to authenticated;

create or replace function public.archive_budget_component(p_catalog_id uuid, p_component_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (select private.is_catalog_admin()) then
    raise exception 'Catalog admin access required' using errcode = '42501';
  end if;
  update public.budget_components set active = false, updated_at = now()
  where id = p_component_id and catalog_id = p_catalog_id and active;
  if not found then
    raise exception 'Budget item not found' using errcode = 'P0002';
  end if;
end;
$$;
revoke all on function public.archive_budget_component(uuid, uuid) from public, anon;
grant execute on function public.archive_budget_component(uuid, uuid) to authenticated;
