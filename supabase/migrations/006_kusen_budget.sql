create table public.budget_catalogs (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]+$'),
  label text not null check (length(trim(label)) > 0),
  position integer not null check (position > 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.budget_components (
  id uuid primary key default gen_random_uuid(),
  catalog_id uuid not null references public.budget_catalogs(id) on delete cascade,
  component_key text not null check (component_key ~ '^[a-z0-9_]+$'),
  source_column text not null,
  label text not null check (length(trim(label)) > 0),
  unit text not null default '',
  category text not null,
  position integer not null check (position > 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (catalog_id, component_key),
  unique (catalog_id, position)
);

create table public.budget_variants (
  id uuid primary key default gen_random_uuid(),
  catalog_id uuid not null references public.budget_catalogs(id) on delete cascade,
  variant_key text not null check (variant_key ~ '^[a-z0-9_]+$'),
  label text not null check (length(trim(label)) > 0),
  source_row integer not null,
  position integer not null check (position > 0),
  unique (catalog_id, variant_key),
  unique (catalog_id, position)
);

create table public.budget_prices (
  id uuid primary key default gen_random_uuid(),
  component_id uuid not null references public.budget_components(id) on delete cascade,
  variant_id uuid not null references public.budget_variants(id) on delete cascade,
  amount numeric(18, 4) check (amount is null or amount >= 0),
  expression text,
  source_cell text not null,
  source_formula text,
  source_value text,
  version integer not null default 1 check (version > 0),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  check (amount is null or expression is null),
  unique (component_id, variant_id)
);

create table public.budget_price_versions (
  id uuid primary key default gen_random_uuid(),
  component_id uuid not null references public.budget_components(id) on delete cascade,
  variant_id uuid not null references public.budget_variants(id) on delete cascade,
  version integer not null check (version > 0),
  amount numeric(18, 4) check (amount is null or amount >= 0),
  expression text,
  changed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  check (amount is null or expression is null),
  unique (component_id, variant_id, version)
);

create table public.budget_calculation_rules (
  id uuid primary key default gen_random_uuid(),
  catalog_id uuid not null references public.budget_catalogs(id) on delete cascade,
  line_position integer not null check (line_position between 1 and 21),
  component_id uuid not null references public.budget_components(id) on delete cascade,
  variant_id uuid not null references public.budget_variants(id) on delete restrict,
  source_formula text not null,
  updated_at timestamptz not null default now(),
  unique (catalog_id, line_position, component_id)
);

create table public.budget_estimates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  catalog_id uuid not null references public.budget_catalogs(id) on delete restrict,
  project_name text not null check (length(trim(project_name)) > 0),
  location text not null default '',
  floor text not null default '',
  report_date date not null default current_date,
  author_label text not null default '',
  grand_total numeric(18, 4) not null default 0 check (grand_total >= 0),
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index budget_estimates_owner_idx on public.budget_estimates(user_id, updated_at desc);
create index budget_estimates_catalog_idx on public.budget_estimates(catalog_id, updated_at desc);

create table public.budget_estimate_lines (
  id uuid primary key default gen_random_uuid(),
  estimate_id uuid not null references public.budget_estimates(id) on delete cascade,
  position integer not null check (position between 1 and 21),
  description text not null default '',
  unit_count numeric(12, 4) not null default 1 check (unit_count >= 0),
  quantities jsonb not null default '{}'::jsonb check (jsonb_typeof(quantities) = 'object'),
  subtotal numeric(18, 4) not null default 0 check (subtotal >= 0),
  result_snapshot jsonb not null default '{}'::jsonb check (jsonb_typeof(result_snapshot) = 'object'),
  unique (estimate_id, position)
);

alter table public.budget_catalogs enable row level security;
alter table public.budget_components enable row level security;
alter table public.budget_variants enable row level security;
alter table public.budget_prices enable row level security;
alter table public.budget_price_versions enable row level security;
alter table public.budget_calculation_rules enable row level security;
alter table public.budget_estimates enable row level security;
alter table public.budget_estimate_lines enable row level security;

create policy "signed in users read active budget catalogs" on public.budget_catalogs
  for select to authenticated using (active or (select private.is_catalog_admin()));
create policy "catalog admins manage budget catalogs" on public.budget_catalogs
  for all to authenticated using ((select private.is_catalog_admin()))
  with check ((select private.is_catalog_admin()));

create policy "signed in users read active budget components" on public.budget_components
  for select to authenticated using (
    active or (select private.is_catalog_admin()) or exists (
      select 1 from public.budget_catalogs c where c.id = catalog_id and c.active
    )
  );
create policy "catalog admins manage budget components" on public.budget_components
  for all to authenticated using ((select private.is_catalog_admin()))
  with check ((select private.is_catalog_admin()));

create policy "signed in users read budget variants" on public.budget_variants
  for select to authenticated using (
    (select private.is_catalog_admin()) or exists (
      select 1 from public.budget_catalogs c where c.id = catalog_id and c.active
    )
  );
create policy "catalog admins manage budget variants" on public.budget_variants
  for all to authenticated using ((select private.is_catalog_admin()))
  with check ((select private.is_catalog_admin()));

create policy "signed in users read budget prices" on public.budget_prices
  for select to authenticated using (true);
create policy "catalog admins manage budget prices" on public.budget_prices
  for all to authenticated using ((select private.is_catalog_admin()))
  with check ((select private.is_catalog_admin()));
create policy "catalog admins read budget price history" on public.budget_price_versions
  for select to authenticated using ((select private.is_catalog_admin()));
create policy "catalog admins append budget price history" on public.budget_price_versions
  for insert to authenticated with check ((select private.is_catalog_admin()));

create policy "signed in users read active budget rules" on public.budget_calculation_rules
  for select to authenticated using (
    (select private.is_catalog_admin()) or exists (
      select 1 from public.budget_catalogs c where c.id = catalog_id and c.active
    )
  );
create policy "catalog admins manage budget rules" on public.budget_calculation_rules
  for all to authenticated using ((select private.is_catalog_admin()))
  with check ((select private.is_catalog_admin()));

create policy "estimate owner reads budget estimates" on public.budget_estimates
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "estimate owner reads budget lines" on public.budget_estimate_lines
  for select to authenticated using (exists (
    select 1 from public.budget_estimates e
    where e.id = estimate_id and e.user_id = (select auth.uid())
  ));

create policy "catalog admins manage budget estimate data" on public.budget_estimates
  for all to authenticated using ((select private.is_catalog_admin()))
  with check ((select private.is_catalog_admin()));
create policy "catalog admins manage budget estimate lines" on public.budget_estimate_lines
  for all to authenticated using ((select private.is_catalog_admin()))
  with check ((select private.is_catalog_admin()));

create policy "budget owners create estimates" on public.budget_estimates
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "budget owners update estimates" on public.budget_estimates
  for update to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "budget owners create estimate lines" on public.budget_estimate_lines
  for insert to authenticated with check (exists (
    select 1 from public.budget_estimates e where e.id = estimate_id and e.user_id = (select auth.uid())
  ));
create policy "budget owners update estimate lines" on public.budget_estimate_lines
  for update to authenticated using (exists (
    select 1 from public.budget_estimates e where e.id = estimate_id and e.user_id = (select auth.uid())
  )) with check (exists (
    select 1 from public.budget_estimates e where e.id = estimate_id and e.user_id = (select auth.uid())
  ));
create policy "budget owners delete estimate lines" on public.budget_estimate_lines
  for delete to authenticated using (exists (
    select 1 from public.budget_estimates e where e.id = estimate_id and e.user_id = (select auth.uid())
  ));

revoke all on public.budget_catalogs, public.budget_components, public.budget_variants,
  public.budget_prices, public.budget_price_versions, public.budget_calculation_rules,
  public.budget_estimates, public.budget_estimate_lines from anon, authenticated;
grant select on public.budget_catalogs, public.budget_components, public.budget_variants,
  public.budget_prices, public.budget_calculation_rules to authenticated;
grant select on public.budget_price_versions to authenticated;
grant select on public.budget_estimates, public.budget_estimate_lines to authenticated;

create or replace function public.save_budget_price_change(
  p_component_id uuid,
  p_variant_id uuid,
  p_amount numeric,
  p_expression text
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_version integer;
begin
  if not (select private.is_catalog_admin()) then
    raise exception 'Catalog admin access required' using errcode = '42501';
  end if;
  if p_amount is not null and p_amount < 0 then
    raise exception 'Price cannot be negative' using errcode = '22023';
  end if;
  if p_amount is not null and nullif(trim(p_expression), '') is not null then
    raise exception 'Provide either an amount or a formula' using errcode = '22023';
  end if;

  update public.budget_prices
  set amount = p_amount,
      expression = nullif(trim(p_expression), ''),
      version = version + 1,
      updated_by = (select auth.uid()),
      updated_at = now()
  where component_id = p_component_id and variant_id = p_variant_id
  returning version into v_version;

  if v_version is null then
    raise exception 'Budget price not found' using errcode = 'P0002';
  end if;

  insert into public.budget_price_versions (component_id, variant_id, version, amount, expression, changed_by)
  select component_id, variant_id, version, amount, expression, updated_by
  from public.budget_prices where component_id = p_component_id and variant_id = p_variant_id;

  return v_version;
end;
$$;

create or replace function public.save_budget_estimate(
  p_estimate_id uuid,
  p_catalog_id uuid,
  p_project_name text,
  p_location text,
  p_floor text,
  p_report_date date,
  p_author_label text,
  p_grand_total numeric,
  p_snapshot jsonb,
  p_lines jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_estimate_id uuid;
  v_line jsonb;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if nullif(trim(p_project_name), '') is null then
    raise exception 'Project name is required' using errcode = '22023';
  end if;
  if p_grand_total is null or p_grand_total < 0 then
    raise exception 'Grand total must be zero or greater' using errcode = '22023';
  end if;
  if jsonb_typeof(p_snapshot) <> 'object' or jsonb_typeof(p_lines) <> 'array'
     or jsonb_array_length(p_lines) > 21 then
    raise exception 'Estimate snapshot or line list is invalid' using errcode = '22023';
  end if;
  if not exists (select 1 from public.budget_catalogs c where c.id = p_catalog_id and c.active) then
    raise exception 'Budget catalog is unavailable' using errcode = '22023';
  end if;

  if p_estimate_id is null then
    insert into public.budget_estimates (
      user_id, catalog_id, project_name, location, floor, report_date,
      author_label, grand_total, snapshot
    ) values (
      (select auth.uid()), p_catalog_id, trim(p_project_name),
      coalesce(trim(p_location), ''), coalesce(trim(p_floor), ''),
      coalesce(p_report_date, current_date), coalesce(trim(p_author_label), ''),
      p_grand_total, p_snapshot
    ) returning id into v_estimate_id;
  else
    update public.budget_estimates
    set catalog_id = p_catalog_id,
        project_name = trim(p_project_name),
        location = coalesce(trim(p_location), ''),
        floor = coalesce(trim(p_floor), ''),
        report_date = coalesce(p_report_date, current_date),
        author_label = coalesce(trim(p_author_label), ''),
        grand_total = p_grand_total,
        snapshot = p_snapshot,
        updated_at = now()
    where id = p_estimate_id and user_id = (select auth.uid())
    returning id into v_estimate_id;
    if v_estimate_id is null then
      raise exception 'Estimate not found or not owned by this user' using errcode = '42501';
    end if;
    delete from public.budget_estimate_lines where estimate_id = v_estimate_id;
  end if;

  for v_line in select value from jsonb_array_elements(p_lines) as line(value)
  loop
    if jsonb_typeof(v_line -> 'quantities') <> 'object'
       or jsonb_typeof(v_line -> 'result_snapshot') <> 'object'
       or coalesce((v_line ->> 'position')::integer, 0) not between 1 and 21
       or coalesce(nullif(v_line ->> 'unit_count', '')::numeric, 1) < 0
       or coalesce(nullif(v_line ->> 'subtotal', '')::numeric, 0) < 0 then
      raise exception 'Estimate line data is invalid' using errcode = '22023';
    end if;
    insert into public.budget_estimate_lines (
      estimate_id, position, description, unit_count, quantities, subtotal, result_snapshot
    ) values (
      v_estimate_id,
      (v_line ->> 'position')::integer,
      coalesce(v_line ->> 'description', ''),
      coalesce(nullif(v_line ->> 'unit_count', '')::numeric, 1),
      v_line -> 'quantities',
      coalesce(nullif(v_line ->> 'subtotal', '')::numeric, 0),
      v_line -> 'result_snapshot'
    );
  end loop;

  return v_estimate_id;
end;
$$;

revoke all on function public.save_budget_price_change(uuid, uuid, numeric, text) from public, anon, authenticated;
grant execute on function public.save_budget_price_change(uuid, uuid, numeric, text) to authenticated;
revoke all on function public.save_budget_estimate(uuid, uuid, text, text, text, date, text, numeric, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.save_budget_estimate(uuid, uuid, text, text, text, date, text, numeric, jsonb, jsonb) to authenticated;
