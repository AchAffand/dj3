-- Additive normalized Master Item schema and legacy catalogue import.
-- Legacy catalogues remain untouched; ambiguous combined HPM/INKA/DACON prices
-- are deliberately not assigned to any one of those three brands.
-- Formula quantities and existing meter formulas are not modified.

create table if not exists public.master_item_groups (
  id uuid primary key default gen_random_uuid(),
  group_key text not null unique,
  label text not null,
  group_type text not null check (group_type in ('product','material','supporting')),
  position integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.master_brands (
  id uuid primary key default gen_random_uuid(),
  brand_key text not null unique,
  label text not null,
  active boolean not null default true,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.master_items (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.master_item_groups(id) on delete restrict,
  item_key text not null unique,
  label text not null,
  unit text not null default '',
  description text,
  legacy_catalog_id uuid references public.budget_catalogs(id) on delete set null,
  legacy_component_id uuid unique references public.budget_components(id) on delete set null,
  legacy_source_label text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.master_item_variants (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.master_items(id) on delete cascade,
  variant_key text not null,
  label text not null,
  attributes jsonb not null default '{}'::jsonb,
  position integer not null default 0,
  legacy_variant_id uuid references public.budget_variants(id) on delete set null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (item_id, variant_key),
  unique (id, item_id)
);

create table if not exists public.master_item_brand_options (
  item_id uuid not null references public.master_items(id) on delete cascade,
  brand_id uuid not null references public.master_brands(id) on delete restrict,
  brand_item_code text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (item_id, brand_id)
);

create table if not exists public.master_item_prices (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.master_items(id) on delete restrict,
  brand_id uuid,
  variant_id uuid,
  amount numeric check (amount is null or amount >= 0),
  expression text,
  source_cell text,
  source_formula text,
  source_value text,
  version integer not null check (version > 0),
  is_current boolean not null default true,
  source_label text,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (item_id, brand_id)
    references public.master_item_brand_options(item_id, brand_id) on delete restrict,
  foreign key (variant_id, item_id)
    references public.master_item_variants(id, item_id) on delete restrict
);

create unique index if not exists master_item_prices_item_brand_variant_version_uidx
  on public.master_item_prices (item_id, brand_id, variant_id, version) nulls not distinct;

create unique index if not exists master_item_prices_one_current_uidx
  on public.master_item_prices (item_id, brand_id, variant_id) nulls not distinct
  where is_current;

create table if not exists public.formula_material_item_options (
  id uuid primary key default gen_random_uuid(),
  material_code integer not null references public.materials(code) on delete restrict,
  model_code integer references public.door_models(code) on delete cascade,
  item_id uuid not null references public.master_items(id) on delete cascade,
  brand_id uuid,
  variant_id uuid,
  unit_override text not null default '',
  is_default boolean not null default false,
  position integer not null default 0,
  legacy_mapping_id uuid references public.budget_material_mappings(id) on delete set null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (item_id, brand_id)
    references public.master_item_brand_options(item_id, brand_id) on delete restrict,
  foreign key (variant_id, item_id)
    references public.master_item_variants(id, item_id) on delete restrict
);

create unique index if not exists formula_material_item_options_identity_uidx
  on public.formula_material_item_options (
    material_code,
    (coalesce(model_code, -1)),
    item_id,
    (coalesce(brand_id, '00000000-0000-0000-0000-000000000000'::uuid)),
    (coalesce(variant_id, '00000000-0000-0000-0000-000000000000'::uuid)),
    unit_override
  );

create unique index if not exists project_model_lines_id_project_id_uidx
  on public.project_model_lines (id, project_id);

create table if not exists public.project_line_material_items (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  project_model_line_id uuid not null,
  source_type text not null check (source_type in ('formula','manual')),
  formula_material_code integer references public.materials(code) on delete restrict,
  master_item_id uuid references public.master_items(id) on delete restrict,
  selected_brand_id uuid references public.master_brands(id) on delete set null,
  selected_variant_id uuid references public.master_item_variants(id) on delete set null,
  quantity numeric not null check (quantity >= 0),
  unit_snapshot text not null,
  item_name_snapshot text not null,
  group_name_snapshot text,
  brand_name_snapshot text,
  variant_name_snapshot text,
  unit_price_snapshot numeric check (unit_price_snapshot is null or unit_price_snapshot >= 0),
  price_version_snapshot integer check (price_version_snapshot is null or price_version_snapshot > 0),
  price_is_set boolean not null default false,
  position integer not null default 0 check (position >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (project_model_line_id, project_id)
    references public.project_model_lines(id, project_id) on delete cascade,
  check (
    (source_type = 'formula' and formula_material_code is not null)
    or
    (source_type = 'manual' and formula_material_code is null and master_item_id is not null)
  ),
  check (price_is_set = (unit_price_snapshot is not null))
);

create unique index if not exists project_line_material_items_formula_identity_uidx
  on public.project_line_material_items (project_model_line_id, formula_material_code)
  where source_type = 'formula';

create index if not exists project_line_material_items_project_id_idx
  on public.project_line_material_items (project_id);
create index if not exists project_line_material_items_model_line_id_idx
  on public.project_line_material_items (project_model_line_id);
create index if not exists project_line_material_items_master_item_id_idx
  on public.project_line_material_items (master_item_id);
create index if not exists formula_material_item_options_material_active_idx
  on public.formula_material_item_options (material_code, active, position);
create index if not exists master_item_prices_item_current_idx
  on public.master_item_prices (item_id, is_current);

-- Seed the flexible groups and brand directory. HPM/INKA/DACON are separate
-- brand records, but legacy combined-catalog prices are not attributed to them.
insert into public.master_item_groups (group_key, label, group_type, position)
values
  ('pintu', 'Pintu', 'product', 10),
  ('kusen', 'Kusen', 'product', 20),
  ('jendela', 'Jendela', 'product', 30),
  ('aluminium', 'Aluminium', 'material', 40),
  ('kayu', 'Kayu', 'material', 50),
  ('kaca', 'Kaca', 'supporting', 60),
  ('aksesoris', 'Aksesoris', 'supporting', 70),
  ('finishing-pekerjaan-tambahan', 'Finishing dan pekerjaan tambahan', 'supporting', 80),
  ('pekerjaan-awal', 'Pekerjaan awal', 'supporting', 90)
on conflict (group_key) do nothing;

insert into public.master_brands (brand_key, label, position)
values
  ('alexindo', 'Alexindo', 10),
  ('hpm', 'HPM', 20),
  ('inka', 'INKA', 30),
  ('dacon', 'DACON', 40),
  ('ykk', 'YKK', 50)
on conflict (brand_key) do nothing;

-- Import each active legacy component as its own traceable master item. This
-- deliberately avoids merging similarly named but not yet proven equivalent
-- products from different legacy workbooks.
insert into public.master_items (
  group_id, item_key, label, unit, legacy_catalog_id, legacy_component_id,
  legacy_source_label, active
)
select
  grp.id,
  'legacy:' || catalog.slug || ':' || component.component_key,
  component.label,
  component.unit,
  catalog.id,
  component.id,
  catalog.label,
  component.active
from public.budget_components component
join public.budget_catalogs catalog on catalog.id = component.catalog_id
join public.master_item_groups grp
  on grp.group_key = case
    when component.category in ('Aksesori', 'Aksesoris') then 'aksesoris'
    when component.category = 'Kaca' then 'kaca'
    when component.category = 'Daun pintu' then 'pintu'
    when component.category = 'Pintu dan jendela' and component.label ilike '%jendela%' then 'jendela'
    when component.category = 'Pintu dan jendela' and component.label ilike '%kaca%' then 'kaca'
    when component.category = 'Pintu dan jendela' then 'pintu'
    when component.category = 'Profil aluminium' and component.label ilike '%kayu%' then 'kayu'
    when component.category = 'Profil aluminium' then 'aluminium'
    when component.category = 'Pekerjaan awal' and component.label ilike '%kusen%' then 'kusen'
    when component.category = 'Pekerjaan awal' and component.label ilike '%tapin%' then 'kusen'
    when component.category = 'Pekerjaan awal'
      and (component.label ilike '%tatapan%' or component.label ilike '%hollow%') then 'aluminium'
    when component.category = 'Pekerjaan awal' then 'pekerjaan-awal'
    when component.category = 'Finishing dan pekerjaan tambahan' then 'finishing-pekerjaan-tambahan'
    else 'pekerjaan-awal'
  end
where catalog.active = true
on conflict (legacy_component_id) do nothing;

-- Only explicit single-brand legacy catalogues create brand options. The
-- combined HPM/INKA/DACON catalogue remains unassigned pending source proof.
insert into public.master_item_brand_options (item_id, brand_id, brand_item_code)
select item.id, brand.id, component.component_key
from public.master_items item
join public.budget_components component on component.id = item.legacy_component_id
join public.budget_catalogs catalog on catalog.id = item.legacy_catalog_id
join public.master_brands brand
  on brand.brand_key = catalog.slug
where catalog.slug in ('alexindo','ykk')
on conflict (item_id, brand_id) do nothing;

insert into public.master_item_variants (
  item_id, variant_key, label, attributes, position, legacy_variant_id
)
select
  item.id,
  variant.variant_key,
  variant.label,
  case
    when variant.variant_key in ('brown','cream','coating','base')
      then jsonb_build_object('finish', variant.label)
    else jsonb_build_object('type', variant.label)
  end,
  variant.position,
  variant.id
from public.master_items item
join public.budget_variants variant on variant.catalog_id = item.legacy_catalog_id
on conflict (item_id, variant_key) do nothing;

-- Import immutable legacy price history, then fill any current legacy rows
-- that intentionally have no history (including empty placeholders).
with price_rows as (
  select
    history.component_id,
    history.variant_id,
    history.version,
    history.amount,
    history.expression,
    history.changed_by as updated_by,
    history.created_at,
    current_price.source_cell,
    current_price.source_formula,
    current_price.source_value,
    current_price.updated_at,
    (current_price.version = history.version) as is_current
  from public.budget_price_versions history
  left join public.budget_prices current_price
    on current_price.component_id = history.component_id
   and current_price.variant_id = history.variant_id
   and current_price.version = history.version

  union all

  select
    current_price.component_id,
    current_price.variant_id,
    current_price.version,
    current_price.amount,
    current_price.expression,
    current_price.updated_by,
    current_price.updated_at as created_at,
    current_price.source_cell,
    current_price.source_formula,
    current_price.source_value,
    current_price.updated_at,
    true as is_current
  from public.budget_prices current_price
  where not exists (
    select 1
    from public.budget_price_versions history
    where history.component_id = current_price.component_id
      and history.variant_id = current_price.variant_id
      and history.version = current_price.version
  )
)
insert into public.master_item_prices (
  item_id, brand_id, variant_id, amount, expression,
  source_cell, source_formula, source_value, version, is_current,
  source_label, updated_by, created_at, updated_at
)
select
  item.id,
  brand_option.brand_id,
  item_variant.id,
  price_rows.amount,
  price_rows.expression,
  price_rows.source_cell,
  price_rows.source_formula,
  price_rows.source_value,
  price_rows.version,
  price_rows.is_current,
  catalog.label,
  price_rows.updated_by,
  coalesce(price_rows.created_at, now()),
  coalesce(price_rows.updated_at, price_rows.created_at, now())
from price_rows
join public.master_items item
  on item.legacy_component_id = price_rows.component_id
join public.budget_components component on component.id = item.legacy_component_id
join public.budget_catalogs catalog on catalog.id = component.catalog_id
join public.master_item_variants item_variant
  on item_variant.item_id = item.id
 and item_variant.legacy_variant_id = price_rows.variant_id
left join public.master_item_brand_options brand_option on brand_option.item_id = item.id
on conflict do nothing;

-- Convert existing explicit formula-to-component mappings into selectable
-- options. The source mapping's exact material name/unit is retained; no
-- heuristic matching or formula/QTY edits are performed.
insert into public.formula_material_item_options (
  material_code, model_code, item_id, brand_id, variant_id,
  unit_override, is_default, position, legacy_mapping_id, active
)
select distinct
  material.code,
  null,
  item.id,
  brand_option.brand_id,
  item_variant.id,
  mapping.material_unit,
  false,
  0,
  mapping.id,
  true
from public.budget_material_mappings mapping
join public.materials material
  on lower(regexp_replace(trim(material.name), '[[:space:]]+', ' ', 'g')) =
     lower(regexp_replace(trim(mapping.material_name), '[[:space:]]+', ' ', 'g'))
 and lower(trim(material.unit)) = lower(trim(mapping.material_unit))
join public.master_items item on item.legacy_component_id = mapping.component_id
left join public.master_item_brand_options brand_option on brand_option.item_id = item.id
left join public.master_item_variants item_variant on item_variant.item_id = item.id
where mapping.active
  and mapping.component_id is not null
  and item.active
on conflict do nothing;

-- New master tables are exposed only to authenticated users. RLS grants
-- active reads and reserves mutations for catalog admins.
alter table public.master_item_groups enable row level security;
alter table public.master_brands enable row level security;
alter table public.master_items enable row level security;
alter table public.master_item_variants enable row level security;
alter table public.master_item_brand_options enable row level security;
alter table public.master_item_prices enable row level security;
alter table public.formula_material_item_options enable row level security;
alter table public.project_line_material_items enable row level security;

create policy "authenticated read active master item groups"
  on public.master_item_groups for select to authenticated
  using (active or (select private.is_catalog_admin()));
create policy "catalog admins manage master item groups"
  on public.master_item_groups for all to authenticated
  using ((select private.is_catalog_admin()))
  with check ((select private.is_catalog_admin()));

create policy "authenticated read active master brands"
  on public.master_brands for select to authenticated
  using (active or (select private.is_catalog_admin()));
create policy "catalog admins manage master brands"
  on public.master_brands for all to authenticated
  using ((select private.is_catalog_admin()))
  with check ((select private.is_catalog_admin()));

create policy "authenticated read active master items"
  on public.master_items for select to authenticated
  using (active or (select private.is_catalog_admin()));
create policy "catalog admins manage master items"
  on public.master_items for all to authenticated
  using ((select private.is_catalog_admin()))
  with check ((select private.is_catalog_admin()));

create policy "authenticated read active master item variants"
  on public.master_item_variants for select to authenticated
  using (active or (select private.is_catalog_admin()));
create policy "catalog admins manage master item variants"
  on public.master_item_variants for all to authenticated
  using ((select private.is_catalog_admin()))
  with check ((select private.is_catalog_admin()));

create policy "authenticated read active item brand options"
  on public.master_item_brand_options for select to authenticated
  using (
    active
    and exists (select 1 from public.master_items item where item.id = item_id and item.active)
    or (select private.is_catalog_admin())
  );
create policy "catalog admins manage item brand options"
  on public.master_item_brand_options for all to authenticated
  using ((select private.is_catalog_admin()))
  with check ((select private.is_catalog_admin()));

create policy "authenticated read active master item prices"
  on public.master_item_prices for select to authenticated
  using (
    exists (select 1 from public.master_items item where item.id = item_id and item.active)
    or (select private.is_catalog_admin())
  );
create policy "catalog admins manage master item prices"
  on public.master_item_prices for all to authenticated
  using ((select private.is_catalog_admin()))
  with check ((select private.is_catalog_admin()));

create policy "authenticated read active formula material options"
  on public.formula_material_item_options for select to authenticated
  using (
    active
    and exists (select 1 from public.master_items item where item.id = item_id and item.active)
    or (select private.is_catalog_admin())
  );
create policy "catalog admins manage formula material options"
  on public.formula_material_item_options for all to authenticated
  using ((select private.is_catalog_admin()))
  with check ((select private.is_catalog_admin()));

create policy "project owners and admins read line material items"
  on public.project_line_material_items for select to authenticated
  using (
    exists (
      select 1 from public.projects project
      where project.id = project_id
        and (project.user_id = (select auth.uid()) or (select private.is_catalog_admin()))
    )
  );
create policy "project owners and admins insert line material items"
  on public.project_line_material_items for insert to authenticated
  with check (
    exists (
      select 1 from public.projects project
      where project.id = project_id
        and (project.user_id = (select auth.uid()) or (select private.is_catalog_admin()))
    )
  );
create policy "project owners and admins update line material items"
  on public.project_line_material_items for update to authenticated
  using (
    exists (
      select 1 from public.projects project
      where project.id = project_id
        and (project.user_id = (select auth.uid()) or (select private.is_catalog_admin()))
    )
  )
  with check (
    exists (
      select 1 from public.projects project
      where project.id = project_id
        and (project.user_id = (select auth.uid()) or (select private.is_catalog_admin()))
    )
  );
create policy "project owners and admins delete line material items"
  on public.project_line_material_items for delete to authenticated
  using (
    exists (
      select 1 from public.projects project
      where project.id = project_id
        and (project.user_id = (select auth.uid()) or (select private.is_catalog_admin()))
    )
  );

revoke all on public.master_item_groups, public.master_brands, public.master_items,
  public.master_item_variants, public.master_item_brand_options, public.master_item_prices,
  public.formula_material_item_options, public.project_line_material_items
from public, anon;

grant select, insert, update, delete on public.master_item_groups, public.master_brands,
  public.master_items, public.master_item_variants, public.master_item_brand_options,
  public.master_item_prices, public.formula_material_item_options,
  public.project_line_material_items to authenticated;

-- Preserve TYPE-level material selections and snapshots when saving a project.
-- This RPC replaces the legacy delete-and-recreate line flow for this client.
-- Existing RPCs remain available for older deployed clients.

create or replace function public.save_project_with_material_items(
  p_project_id uuid,
  p_name text,
  p_location text,
  p_floor text,
  p_lines jsonb,
  p_prices jsonb,
  p_price_snapshots jsonb,
  p_material_items jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_project_id uuid;
  v_line jsonb;
  v_item jsonb;
  v_price jsonb;
  v_snapshot jsonb;
  v_line_id uuid;
  v_item_id uuid;
  v_line_ids uuid[] := array[]::uuid[];
  v_item_ids uuid[] := array[]::uuid[];
begin
  if (select auth.uid()) is null then
    raise exception 'Sign in required' using errcode = '42501';
  end if;
  if length(trim(coalesce(p_name, ''))) = 0 then
    raise exception 'Project name is required' using errcode = '22023';
  end if;
  if jsonb_typeof(coalesce(p_lines, '[]'::jsonb)) <> 'array'
     or jsonb_typeof(coalesce(p_prices, '[]'::jsonb)) <> 'array'
     or jsonb_typeof(coalesce(p_price_snapshots, '[]'::jsonb)) <> 'array'
     or jsonb_typeof(coalesce(p_material_items, '[]'::jsonb)) <> 'array' then
    raise exception 'Project payload collections must be arrays' using errcode = '22023';
  end if;

  if p_project_id is null then
    insert into public.projects (user_id, name, location, floor)
    values ((select auth.uid()), trim(p_name), trim(coalesce(p_location, '')), trim(coalesce(p_floor, '')))
    returning id into v_project_id;
  else
    update public.projects
      set name = trim(p_name),
          location = trim(coalesce(p_location, '')),
          floor = trim(coalesce(p_floor, '')),
          updated_at = now()
      where id = p_project_id
        and (
          user_id = (select auth.uid())
          or (select private.is_catalog_admin())
        )
      returning id into v_project_id;
    if v_project_id is null then
      raise exception 'Project not found or not owned by this user' using errcode = '42501';
    end if;
  end if;

  -- Upsert existing TYPE lines in place. Only lines omitted from the submitted
  -- project are deleted, so their child material rows survive ordinary saves.
  for v_line in
    select value from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) as line(value)
  loop
    v_line_id := nullif(v_line ->> 'id', '')::uuid;
    if v_line_id is null then
      raise exception 'Every project model line must have a stable id' using errcode = '22023';
    end if;
    v_line_ids := array_append(v_line_ids, v_line_id);

    insert into public.project_model_lines (
      id, project_id, model_code, inputs, model_count,
      formula_snapshot, result_snapshot, price_catalog_id, price_variant_id
    ) values (
      v_line_id,
      v_project_id,
      (v_line ->> 'model_code')::integer,
      coalesce(v_line -> 'inputs', '{}'::jsonb),
      coalesce((v_line ->> 'model_count')::integer, 1),
      coalesce(v_line -> 'formula_snapshot', '[]'::jsonb),
      coalesce(v_line -> 'result_snapshot', '{"items":[],"errors":[]}'::jsonb),
      nullif(v_line ->> 'price_catalog_id', '')::uuid,
      nullif(v_line ->> 'price_variant_id', '')::uuid
    )
    on conflict (id) do update set
      model_code = excluded.model_code,
      inputs = excluded.inputs,
      model_count = excluded.model_count,
      formula_snapshot = excluded.formula_snapshot,
      result_snapshot = excluded.result_snapshot,
      price_catalog_id = excluded.price_catalog_id,
      price_variant_id = excluded.price_variant_id
    where public.project_model_lines.project_id = v_project_id;

    if not found then
      raise exception 'Project model line does not belong to this project' using errcode = '42501';
    end if;
  end loop;

  delete from public.project_model_lines
  where project_id = v_project_id
    and not (id = any(v_line_ids));

  delete from public.project_material_prices where project_id = v_project_id;
  for v_price in
    select value from jsonb_array_elements(coalesce(p_prices, '[]'::jsonb)) as price(value)
  loop
    insert into public.project_material_prices (
      project_id, material_code, name_snapshot, unit_snapshot, unit_price, updated_at
    ) values (
      v_project_id,
      (v_price ->> 'material_code')::integer,
      v_price ->> 'name_snapshot',
      v_price ->> 'unit_snapshot',
      nullif(v_price ->> 'unit_price', '')::numeric,
      now()
    );
  end loop;

  delete from public.project_line_price_snapshots where project_id = v_project_id;
  for v_snapshot in
    select value from jsonb_array_elements(coalesce(p_price_snapshots, '[]'::jsonb)) as snapshot(value)
  loop
    insert into public.project_line_price_snapshots (
      project_id, material_code, catalog_id, variant_id, name_snapshot, unit_snapshot,
      unit_price, component_id, price_version, expression_snapshot, updated_at
    ) values (
      v_project_id,
      (v_snapshot ->> 'material_code')::integer,
      (v_snapshot ->> 'catalog_id')::uuid,
      (v_snapshot ->> 'variant_id')::uuid,
      v_snapshot ->> 'name_snapshot',
      v_snapshot ->> 'unit_snapshot',
      nullif(v_snapshot ->> 'unit_price', '')::numeric,
      nullif(v_snapshot ->> 'component_id', '')::uuid,
      nullif(v_snapshot ->> 'price_version', '')::integer,
      v_snapshot ->> 'expression_snapshot',
      now()
    )
    on conflict (
      project_id, material_code, catalog_id, variant_id, snapshot_component_key
    ) do update set
      name_snapshot = excluded.name_snapshot,
      unit_snapshot = excluded.unit_snapshot,
      unit_price = excluded.unit_price,
      component_id = excluded.component_id,
      price_version = excluded.price_version,
      expression_snapshot = excluded.expression_snapshot,
      updated_at = now();
  end loop;

  -- Preserve row identity for existing formula/manual material rows as well.
  for v_item in
    select value from jsonb_array_elements(coalesce(p_material_items, '[]'::jsonb)) as material(value)
  loop
    v_item_id := nullif(v_item ->> 'id', '')::uuid;
    if v_item_id is null then
      raise exception 'Every project material row must have a stable id' using errcode = '22023';
    end if;
    v_item_ids := array_append(v_item_ids, v_item_id);

    insert into public.project_line_material_items (
      id, project_id, project_model_line_id, source_type, formula_material_code,
      master_item_id, selected_brand_id, selected_variant_id, quantity, unit_snapshot,
      item_name_snapshot, group_name_snapshot, brand_name_snapshot, variant_name_snapshot,
      unit_price_snapshot, price_version_snapshot, price_is_set, position, updated_at
    ) values (
      v_item_id,
      v_project_id,
      (v_item ->> 'project_model_line_id')::uuid,
      v_item ->> 'source_type',
      nullif(v_item ->> 'formula_material_code', '')::integer,
      nullif(v_item ->> 'master_item_id', '')::uuid,
      nullif(v_item ->> 'selected_brand_id', '')::uuid,
      nullif(v_item ->> 'selected_variant_id', '')::uuid,
      (v_item ->> 'quantity')::numeric,
      v_item ->> 'unit_snapshot',
      v_item ->> 'item_name_snapshot',
      v_item ->> 'group_name_snapshot',
      v_item ->> 'brand_name_snapshot',
      v_item ->> 'variant_name_snapshot',
      nullif(v_item ->> 'unit_price_snapshot', '')::numeric,
      nullif(v_item ->> 'price_version_snapshot', '')::integer,
      coalesce((v_item ->> 'price_is_set')::boolean, false),
      coalesce((v_item ->> 'position')::integer, 0),
      now()
    )
    on conflict (id) do update set
      project_model_line_id = excluded.project_model_line_id,
      source_type = excluded.source_type,
      formula_material_code = excluded.formula_material_code,
      master_item_id = excluded.master_item_id,
      selected_brand_id = excluded.selected_brand_id,
      selected_variant_id = excluded.selected_variant_id,
      quantity = excluded.quantity,
      unit_snapshot = excluded.unit_snapshot,
      item_name_snapshot = excluded.item_name_snapshot,
      group_name_snapshot = excluded.group_name_snapshot,
      brand_name_snapshot = excluded.brand_name_snapshot,
      variant_name_snapshot = excluded.variant_name_snapshot,
      unit_price_snapshot = excluded.unit_price_snapshot,
      price_version_snapshot = excluded.price_version_snapshot,
      price_is_set = excluded.price_is_set,
      position = excluded.position,
      updated_at = now()
    where public.project_line_material_items.project_id = v_project_id;

    if not found then
      raise exception 'Project material row does not belong to this project' using errcode = '42501';
    end if;
  end loop;

  delete from public.project_line_material_items
  where project_id = v_project_id
    and not (id = any(v_item_ids));

  return v_project_id;
end;
$function$;

revoke all on function public.save_project_with_material_items(uuid, text, text, text, jsonb, jsonb, jsonb, jsonb)
  from public, anon;
grant execute on function public.save_project_with_material_items(uuid, text, text, text, jsonb, jsonb, jsonb, jsonb)
  to authenticated;
