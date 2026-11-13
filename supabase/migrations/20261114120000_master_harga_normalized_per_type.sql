-- DJ3: additive normalized Master Harga + per-TYPE material selections.
-- DRAFT ONLY: review and test before applying to any Supabase database.
-- Existing catalog/project/formula tables are intentionally untouched.
begin;

create table if not exists public.master_item_groups (
  id uuid primary key default gen_random_uuid(),
  group_key text not null unique,
  label text not null,
  group_type text not null check (group_type in ('product','material','supporting')),
  position integer not null default 0 check (position >= 0),
  active boolean not null default true,
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
  legacy_component_id uuid references public.budget_components(id) on delete set null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, group_id)
);

create table if not exists public.master_brands (
  id uuid primary key default gen_random_uuid(),
  brand_key text not null unique,
  label text not null,
  active boolean not null default true,
  position integer not null default 0 check (position >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.master_item_brand_options (
  item_id uuid not null references public.master_items(id) on delete cascade,
  brand_id uuid not null references public.master_brands(id) on delete restrict,
  brand_item_code text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (item_id, brand_id)
);

create table if not exists public.master_item_variants (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.master_items(id) on delete cascade,
  variant_key text not null,
  label text not null,
  attributes jsonb not null default '{}'::jsonb
    check (jsonb_typeof(attributes) = 'object'),
  position integer not null default 0 check (position >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (item_id, variant_key),
  unique (id, item_id)
);

create table if not exists public.master_item_prices (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.master_items(id) on delete restrict,
  brand_id uuid,
  variant_id uuid,
  amount numeric(18,2) check (amount is null or amount >= 0),
  version integer not null default 1 check (version > 0),
  is_current boolean not null default true,
  source_label text,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (item_id, brand_id)
    references public.master_item_brand_options(item_id, brand_id)
    on delete restrict,
  foreign key (variant_id, item_id)
    references public.master_item_variants(id, item_id)
    on delete restrict
);

-- NULL-aware uniqueness is implemented with partial indexes for broad PostgreSQL compatibility.
create unique index if not exists master_item_prices_current_item_only_uidx
  on public.master_item_prices(item_id)
  where is_current and brand_id is null and variant_id is null;
create unique index if not exists master_item_prices_current_item_brand_uidx
  on public.master_item_prices(item_id, brand_id)
  where is_current and brand_id is not null and variant_id is null;
create unique index if not exists master_item_prices_current_item_variant_uidx
  on public.master_item_prices(item_id, variant_id)
  where is_current and brand_id is null and variant_id is not null;
create unique index if not exists master_item_prices_current_item_brand_variant_uidx
  on public.master_item_prices(item_id, brand_id, variant_id)
  where is_current and brand_id is not null and variant_id is not null;

create table if not exists public.formula_material_item_options (
  id uuid primary key default gen_random_uuid(),
  material_code integer not null references public.materials(code) on delete restrict,
  model_code integer references public.door_models(code) on delete restrict,
  item_id uuid not null references public.master_items(id) on delete restrict,
  brand_id uuid,
  variant_id uuid,
  is_default boolean not null default false,
  position integer not null default 0 check (position >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (item_id, brand_id)
    references public.master_item_brand_options(item_id, brand_id)
    on delete restrict,
  foreign key (variant_id, item_id)
    references public.master_item_variants(id, item_id)
    on delete restrict
);

create unique index if not exists formula_material_item_options_general_uidx
  on public.formula_material_item_options(material_code, item_id, coalesce(brand_id, '00000000-0000-0000-0000-000000000000'::uuid), coalesce(variant_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where model_code is null;
create unique index if not exists formula_material_item_options_model_uidx
  on public.formula_material_item_options(material_code, model_code, item_id, coalesce(brand_id, '00000000-0000-0000-0000-000000000000'::uuid), coalesce(variant_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where model_code is not null;

-- Composite FK guarantees that the TYPE line belongs to the same project_id stored on the row.
create unique index if not exists project_model_lines_id_project_id_uidx
  on public.project_model_lines(id, project_id);

create table if not exists public.project_line_material_items (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  project_model_line_id uuid not null,
  source_type text not null check (source_type in ('formula','manual')),
  formula_material_code integer references public.materials(code) on delete restrict,
  master_item_id uuid references public.master_items(id) on delete restrict,
  selected_brand_id uuid,
  selected_variant_id uuid,
  foreign key (master_item_id, selected_brand_id)
    references public.master_item_brand_options(item_id, brand_id) on delete restrict,
  foreign key (selected_variant_id, master_item_id)
    references public.master_item_variants(id, item_id) on delete restrict,
  quantity numeric(18,4) not null check (quantity >= 0),
  unit_snapshot text not null,
  item_name_snapshot text not null,
  group_name_snapshot text,
  brand_name_snapshot text,
  variant_name_snapshot text,
  unit_price_snapshot numeric(18,2) check (unit_price_snapshot is null or unit_price_snapshot >= 0),
  price_version_snapshot integer check (price_version_snapshot is null or price_version_snapshot > 0),
  price_is_set boolean not null default false,
  position integer not null default 0 check (position >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (project_model_line_id, project_id)
    references public.project_model_lines(id, project_id) on delete cascade,
  constraint project_line_material_items_source_shape_check check (
    (source_type = 'formula' and formula_material_code is not null
      and (selected_brand_id is null or master_item_id is not null)
      and (selected_variant_id is null or master_item_id is not null))
    or
    (source_type = 'manual' and formula_material_code is null and master_item_id is not null)
  ),
  constraint project_line_material_items_price_state_check check (
    (price_is_set = false and unit_price_snapshot is null)
    or (price_is_set = true and unit_price_snapshot is not null)
  )
);

create unique index if not exists project_line_material_items_formula_uidx
  on public.project_line_material_items(project_model_line_id, formula_material_code)
  where source_type = 'formula';
create index if not exists project_line_material_items_project_idx
  on public.project_line_material_items(project_id);
create index if not exists project_line_material_items_line_idx
  on public.project_line_material_items(project_model_line_id);
create index if not exists master_items_group_active_idx
  on public.master_items(group_id, active, label);
create index if not exists master_item_variants_item_active_idx
  on public.master_item_variants(item_id, active, position);
create index if not exists master_item_brand_options_brand_idx
  on public.master_item_brand_options(brand_id, active);
create index if not exists master_item_prices_lookup_idx
  on public.master_item_prices(item_id, brand_id, variant_id)
  where is_current;
create index if not exists formula_material_item_options_lookup_idx
  on public.formula_material_item_options(material_code, model_code, active, position);

-- Seed only the agreed top-level groups and independently identifiable brands.
-- HPM / INKA / DACON remains legacy catalog provenance, not a presumed single brand.
insert into public.master_item_groups(group_key,label,group_type,position)
values
 ('pintu','Pintu','product',10),
 ('kusen','Kusen','product',20),
 ('jendela','Jendela','product',30),
 ('aluminium','Aluminium','material',40),
 ('kayu','Kayu','material',50),
 ('kaca','Kaca','supporting',60),
 ('aksesoris','Aksesoris','supporting',70)
on conflict (group_key) do nothing;

insert into public.master_brands(brand_key,label,position)
values
 ('alexindo','Alexindo',10),
 ('hpm-inka-dacon','HPM / INKA / DACON',20),
 ('ykk','YKK',30)
on conflict (brand_key) do nothing;

-- All new tables are protected by RLS. Master reads are limited to active records;
-- admin access uses the existing audited private helper.
alter table public.master_item_groups enable row level security;
alter table public.master_items enable row level security;
alter table public.master_brands enable row level security;
alter table public.master_item_brand_options enable row level security;
alter table public.master_item_variants enable row level security;
alter table public.master_item_prices enable row level security;
alter table public.formula_material_item_options enable row level security;
alter table public.project_line_material_items enable row level security;

revoke all on public.master_item_groups, public.master_items, public.master_brands,
  public.master_item_brand_options, public.master_item_variants, public.master_item_prices,
  public.formula_material_item_options, public.project_line_material_items from anon, public;

grant select on public.master_item_groups, public.master_items, public.master_brands,
  public.master_item_brand_options, public.master_item_variants, public.master_item_prices,
  public.formula_material_item_options to authenticated;
grant insert, update, delete on public.master_item_groups, public.master_items,
  public.master_brands, public.master_item_brand_options, public.master_item_variants,
  public.master_item_prices, public.formula_material_item_options to authenticated;
grant select, insert, update, delete on public.project_line_material_items to authenticated;

create policy master_item_groups_read_active on public.master_item_groups
  for select to authenticated using (active or (select private.is_catalog_admin()));
create policy master_item_groups_admin_write on public.master_item_groups
  for all to authenticated using ((select private.is_catalog_admin()))
  with check ((select private.is_catalog_admin()));

create policy master_items_read_active on public.master_items
  for select to authenticated using (
    active or (select private.is_catalog_admin())
  );
create policy master_items_admin_write on public.master_items
  for all to authenticated using ((select private.is_catalog_admin()))
  with check ((select private.is_catalog_admin()));

create policy master_brands_read_active on public.master_brands
  for select to authenticated using (active or (select private.is_catalog_admin()));
create policy master_brands_admin_write on public.master_brands
  for all to authenticated using ((select private.is_catalog_admin()))
  with check ((select private.is_catalog_admin()));

create policy master_item_brand_options_read_active on public.master_item_brand_options
  for select to authenticated using (
    active or (select private.is_catalog_admin())
  );
create policy master_item_brand_options_admin_write on public.master_item_brand_options
  for all to authenticated using ((select private.is_catalog_admin()))
  with check ((select private.is_catalog_admin()));

create policy master_item_variants_read_active on public.master_item_variants
  for select to authenticated using (active or (select private.is_catalog_admin()));
create policy master_item_variants_admin_write on public.master_item_variants
  for all to authenticated using ((select private.is_catalog_admin()))
  with check ((select private.is_catalog_admin()));

create policy master_item_prices_read on public.master_item_prices
  for select to authenticated using (
    is_current or (select private.is_catalog_admin())
  );
create policy master_item_prices_admin_write on public.master_item_prices
  for all to authenticated using ((select private.is_catalog_admin()))
  with check ((select private.is_catalog_admin()));

create policy formula_material_item_options_read_active on public.formula_material_item_options
  for select to authenticated using (active or (select private.is_catalog_admin()));
create policy formula_material_item_options_admin_write on public.formula_material_item_options
  for all to authenticated using ((select private.is_catalog_admin()))
  with check ((select private.is_catalog_admin()));

create policy project_line_material_items_read_owner_or_admin
  on public.project_line_material_items for select to authenticated
  using (
    exists (
      select 1 from public.projects p
      where p.id = project_line_material_items.project_id
        and (p.user_id = (select auth.uid()) or (select private.is_catalog_admin()))
    )
  );
create policy project_line_material_items_insert_owner_or_admin
  on public.project_line_material_items for insert to authenticated
  with check (
    exists (
      select 1 from public.projects p
      where p.id = project_line_material_items.project_id
        and (p.user_id = (select auth.uid()) or (select private.is_catalog_admin()))
    )
  );
create policy project_line_material_items_update_owner_or_admin
  on public.project_line_material_items for update to authenticated
  using (
    exists (
      select 1 from public.projects p
      where p.id = project_line_material_items.project_id
        and (p.user_id = (select auth.uid()) or (select private.is_catalog_admin()))
    )
  )
  with check (
    exists (
      select 1 from public.projects p
      where p.id = project_line_material_items.project_id
        and (p.user_id = (select auth.uid()) or (select private.is_catalog_admin()))
    )
  );
create policy project_line_material_items_delete_owner_or_admin
  on public.project_line_material_items for delete to authenticated
  using (
    exists (
      select 1 from public.projects p
      where p.id = project_line_material_items.project_id
        and (p.user_id = (select auth.uid()) or (select private.is_catalog_admin()))
    )
  );

commit;
