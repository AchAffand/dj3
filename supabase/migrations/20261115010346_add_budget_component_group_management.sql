-- Add persistent, catalog-scoped groups for Master Harga item categories.
create table if not exists public.budget_component_groups (
  id uuid primary key default gen_random_uuid(),
  catalog_id uuid not null references public.budget_catalogs(id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  position integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists budget_component_groups_catalog_name_unique
  on public.budget_component_groups (catalog_id, lower(name));
create index if not exists budget_component_groups_catalog_position_idx
  on public.budget_component_groups (catalog_id, position);
insert into public.budget_component_groups (catalog_id, name, position)
select c.catalog_id, trim(c.group_label), row_number() over (partition by c.catalog_id order by min(c.position))
from public.budget_components c
where c.active and length(trim(coalesce(c.group_label,''))) > 0
group by c.catalog_id, trim(c.group_label)
on conflict do nothing;
alter table public.budget_component_groups enable row level security;
create policy "signed in users read budget component groups"
  on public.budget_component_groups for select to authenticated
  using (exists (select 1 from public.budget_catalogs c where c.id = catalog_id and c.active));
create policy "catalog admins manage budget component groups"
  on public.budget_component_groups for all to authenticated
  using ((select private.is_catalog_admin()))
  with check ((select private.is_catalog_admin()));
create or replace function public.create_budget_component_group(p_catalog_id uuid, p_name text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if not (select private.is_catalog_admin()) then raise exception 'Catalog admin access required' using errcode='42501'; end if;
  if length(trim(coalesce(p_name,''))) = 0 then raise exception 'Nama kelompok wajib diisi' using errcode='22023'; end if;
  if not exists (select 1 from public.budget_catalogs where id=p_catalog_id and active) then raise exception 'Master harga tidak ditemukan' using errcode='P0002'; end if;
  insert into public.budget_component_groups(catalog_id,name,position)
  values(p_catalog_id,trim(p_name),coalesce((select max(position)+1 from public.budget_component_groups where catalog_id=p_catalog_id),1))
  returning id into v_id;
  return v_id;
end; $$;
create or replace function public.rename_budget_component_group(p_catalog_id uuid, p_group_id uuid, p_name text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_old_name text;
begin
  if not (select private.is_catalog_admin()) then raise exception 'Catalog admin access required' using errcode='42501'; end if;
  if length(trim(coalesce(p_name,''))) = 0 then raise exception 'Nama kelompok wajib diisi' using errcode='22023'; end if;
  select name into v_old_name from public.budget_component_groups where id=p_group_id and catalog_id=p_catalog_id for update;
  if v_old_name is null then raise exception 'Kelompok tidak ditemukan' using errcode='P0002'; end if;
  update public.budget_component_groups set name=trim(p_name),updated_at=now() where id=p_group_id;
  update public.budget_components set group_label=trim(p_name),updated_at=now()
    where catalog_id=p_catalog_id and group_label=v_old_name;
end; $$;
create or replace function public.delete_budget_component_groups(p_catalog_id uuid, p_group_ids uuid[])
returns integer language plpgsql security definer set search_path = '' as $$
declare v_group record; v_deleted integer := 0; v_count integer;
begin
  if not (select private.is_catalog_admin()) then raise exception 'Catalog admin access required' using errcode='42501'; end if;
  if coalesce(array_length(p_group_ids,1),0)=0 then raise exception 'Pilih minimal satu kelompok' using errcode='22023'; end if;
  for v_group in select id,name from public.budget_component_groups where catalog_id=p_catalog_id and id=any(p_group_ids) for update loop
    delete from public.budget_components where catalog_id=p_catalog_id and group_label=v_group.name;
    get diagnostics v_count = row_count;
    v_deleted := v_deleted + v_count;
    delete from public.budget_component_groups where id=v_group.id;
  end loop;
  return v_deleted;
end; $$;
revoke all on function public.create_budget_component_group(uuid,text) from public, anon;
revoke all on function public.rename_budget_component_group(uuid,uuid,text) from public, anon;
revoke all on function public.delete_budget_component_groups(uuid,uuid[]) from public, anon;
grant execute on function public.create_budget_component_group(uuid,text) to authenticated;
grant execute on function public.rename_budget_component_group(uuid,uuid,text) to authenticated;
grant execute on function public.delete_budget_component_groups(uuid,uuid[]) to authenticated;