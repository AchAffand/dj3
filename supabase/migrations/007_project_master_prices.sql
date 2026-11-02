alter table public.project_model_lines
  add column if not exists price_catalog_id uuid references public.budget_catalogs(id) on delete set null,
  add column if not exists price_variant_id uuid references public.budget_variants(id) on delete set null;

create table if not exists public.budget_material_mappings (
  id uuid primary key default gen_random_uuid(),
  catalog_id uuid not null references public.budget_catalogs(id) on delete cascade,
  material_key text not null,
  material_name text not null,
  material_unit text not null default '',
  component_id uuid references public.budget_components(id) on delete set null,
  active boolean not null default true,
  updated_at timestamptz not null default now(),
  unique (catalog_id, material_key)
);

alter table public.budget_material_mappings enable row level security;
create policy "signed in users read budget material mappings" on public.budget_material_mappings
  for select to authenticated using (exists (select 1 from public.budget_catalogs c where c.id = catalog_id and c.active));
create policy "catalog admins manage budget material mappings" on public.budget_material_mappings
  for all to authenticated using ((select private.is_catalog_admin()))
  with check ((select private.is_catalog_admin()));
revoke all on public.budget_material_mappings from anon, authenticated;
grant select on public.budget_material_mappings to authenticated;

create or replace function public.save_budget_material_mapping(
  p_catalog_id uuid,
  p_material_key text,
  p_material_name text,
  p_material_unit text,
  p_component_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (select private.is_catalog_admin()) then
    raise exception 'Catalog admin access required' using errcode = '42501';
  end if;
  if not exists (select 1 from public.budget_catalogs where id = p_catalog_id and active) then
    raise exception 'Budget catalog not found' using errcode = 'P0002';
  end if;
  if p_component_id is not null and not exists (
    select 1 from public.budget_components where id = p_component_id and catalog_id = p_catalog_id and active
  ) then
    raise exception 'Component does not belong to this catalog' using errcode = '22023';
  end if;
  insert into public.budget_material_mappings (catalog_id, material_key, material_name, material_unit, component_id, active, updated_at)
  values (p_catalog_id, p_material_key, p_material_name, coalesce(p_material_unit, ''), p_component_id, true, now())
  on conflict (catalog_id, material_key) do update set
    material_name = excluded.material_name, material_unit = excluded.material_unit,
    component_id = excluded.component_id, active = true, updated_at = now();
end;
$$;
revoke all on function public.save_budget_material_mapping(uuid, text, text, text, uuid) from public, anon, authenticated;
grant execute on function public.save_budget_material_mapping(uuid, text, text, text, uuid) to authenticated;

-- A small set of unambiguous starter mappings; all other items can be mapped by an admin in Master Harga.
insert into public.budget_material_mappings (catalog_id, material_key, material_name, material_unit, component_id)
select c.id, m.material_key, m.material_name, m.material_unit, comp.id
from public.budget_catalogs c
cross join (values
  ('kusen|m''', 'kusen', 'm''', 'KUSEN / M'''),
  ('tapin|m''', 'tapin', 'm''', 'TAPIN / M'''),
  ('pintu|m''', 'pintu', 'm''', 'PINTU / M'''),
  ('kaca/acp/spndrel/pintu|m"', 'kaca/acp/spndrel/pintu', 'm"', 'SPANDRELL / M2'),
  ('silicone|m''', 'silicone', 'm''', 'SEALANT / M''')
) as m(material_key, material_name, material_unit, component_label)
join public.budget_components comp on comp.catalog_id = c.id and lower(comp.label) = lower(m.component_label)
where c.slug in ('alexindo', 'hpm-inka-dacon')
on conflict (catalog_id, material_key) do nothing;

create table public.project_line_price_snapshots (
  project_id uuid not null references public.projects(id) on delete cascade,
  material_code integer not null references public.materials(code) on delete restrict,
  catalog_id uuid not null references public.budget_catalogs(id) on delete restrict,
  variant_id uuid not null references public.budget_variants(id) on delete restrict,
  name_snapshot text not null,
  unit_snapshot text not null,
  unit_price numeric(16,2) check (unit_price is null or unit_price >= 0),
  component_id uuid references public.budget_components(id) on delete set null,
  price_version integer,
  expression_snapshot text,
  updated_at timestamptz not null default now(),
  primary key (project_id, material_code, catalog_id, variant_id)
);
alter table public.project_line_price_snapshots enable row level security;
create policy "project owners read line price snapshots" on public.project_line_price_snapshots
  for select to authenticated using (exists (select 1 from public.projects p where p.id = project_id and p.user_id = (select auth.uid())));
create policy "project owners create line price snapshots" on public.project_line_price_snapshots
  for insert to authenticated with check (exists (select 1 from public.projects p where p.id = project_id and p.user_id = (select auth.uid())));
create policy "project owners delete line price snapshots" on public.project_line_price_snapshots
  for delete to authenticated using (exists (select 1 from public.projects p where p.id = project_id and p.user_id = (select auth.uid())));
revoke all on public.project_line_price_snapshots from anon, authenticated;
grant select on public.project_line_price_snapshots to authenticated;

create or replace function public.save_project_with_budget_prices(
  p_project_id uuid,
  p_name text,
  p_location text,
  p_floor text,
  p_lines jsonb,
  p_prices jsonb,
  p_price_snapshots jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_project_id uuid;
  v_snapshot jsonb;
begin
  if jsonb_typeof(p_price_snapshots) <> 'array' then
    raise exception 'Price snapshots must be an array' using errcode = '22023';
  end if;
  v_project_id := public.save_project_with_metadata(p_project_id, p_name, p_lines, p_prices, p_location, p_floor);
  update public.project_model_lines line
  set price_catalog_id = nullif(item.value ->> 'price_catalog_id', '')::uuid,
      price_variant_id = nullif(item.value ->> 'price_variant_id', '')::uuid
  from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) item(value)
  where line.project_id = v_project_id and line.id = nullif(item.value ->> 'id', '')::uuid;
  delete from public.project_line_price_snapshots where project_id = v_project_id;
  for v_snapshot in select value from jsonb_array_elements(p_price_snapshots)
  loop
    insert into public.project_line_price_snapshots (
      project_id, material_code, catalog_id, variant_id, name_snapshot, unit_snapshot,
      unit_price, component_id, price_version, expression_snapshot, updated_at
    ) values (
      v_project_id, (v_snapshot ->> 'material_code')::integer, (v_snapshot ->> 'catalog_id')::uuid,
      (v_snapshot ->> 'variant_id')::uuid, v_snapshot ->> 'name_snapshot', v_snapshot ->> 'unit_snapshot',
      nullif(v_snapshot ->> 'unit_price', '')::numeric, nullif(v_snapshot ->> 'component_id', '')::uuid,
      nullif(v_snapshot ->> 'price_version', '')::integer, v_snapshot ->> 'expression_snapshot', now()
    ) on conflict (project_id, material_code, catalog_id, variant_id) do update set
      name_snapshot = excluded.name_snapshot, unit_snapshot = excluded.unit_snapshot,
      unit_price = excluded.unit_price, component_id = excluded.component_id,
      price_version = excluded.price_version, expression_snapshot = excluded.expression_snapshot,
      updated_at = now();
  end loop;
  return v_project_id;
end;
$$;
revoke all on function public.save_project_with_budget_prices(uuid, text, text, text, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.save_project_with_budget_prices(uuid, text, text, text, jsonb, jsonb, jsonb) to authenticated;
