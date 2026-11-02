alter table public.profiles enable row level security;
alter table public.catalog_admins enable row level security;
alter table public.door_models enable row level security;
alter table public.materials enable row level security;
alter table public.model_materials enable row level security;
alter table public.formula_versions enable row level security;
alter table public.projects enable row level security;
alter table public.project_model_lines enable row level security;
alter table public.project_material_prices enable row level security;

create policy "profile owner reads own profile" on public.profiles
  for select to authenticated using ((select auth.uid()) = id);
create policy "profile owner updates own profile" on public.profiles
  for update to authenticated using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

create policy "catalog admin membership is private" on public.catalog_admins
  for select to authenticated using ((select auth.uid()) = user_id);

create policy "signed in users read door models" on public.door_models
  for select to authenticated using (true);
create policy "catalog admins insert door models" on public.door_models
  for insert to authenticated with check ((select private.is_catalog_admin()));
create policy "catalog admins update door models" on public.door_models
  for update to authenticated using ((select private.is_catalog_admin()))
  with check ((select private.is_catalog_admin()));
create policy "catalog admins delete door models" on public.door_models
  for delete to authenticated using ((select private.is_catalog_admin()));

create policy "signed in users read materials" on public.materials
  for select to authenticated using (true);
create policy "catalog admins insert materials" on public.materials
  for insert to authenticated with check ((select private.is_catalog_admin()));
create policy "catalog admins update materials" on public.materials
  for update to authenticated using ((select private.is_catalog_admin()))
  with check ((select private.is_catalog_admin()));
create policy "catalog admins delete materials" on public.materials
  for delete to authenticated using ((select private.is_catalog_admin()));

create policy "signed in users read model materials" on public.model_materials
  for select to authenticated using (true);
create policy "catalog admins insert model materials" on public.model_materials
  for insert to authenticated with check ((select private.is_catalog_admin()));
create policy "catalog admins update model materials" on public.model_materials
  for update to authenticated using ((select private.is_catalog_admin()))
  with check ((select private.is_catalog_admin()));
create policy "catalog admins delete model materials" on public.model_materials
  for delete to authenticated using ((select private.is_catalog_admin()));

create policy "signed in users read formula history" on public.formula_versions
  for select to authenticated using (true);
create policy "catalog admins append formula history" on public.formula_versions
  for insert to authenticated with check ((select private.is_catalog_admin()));

create policy "project owner reads project" on public.projects
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "project owner creates project" on public.projects
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "project owner updates project" on public.projects
  for update to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "project owner deletes project" on public.projects
  for delete to authenticated using ((select auth.uid()) = user_id);

create policy "project owner reads model lines" on public.project_model_lines
  for select to authenticated using (
    exists (
      select 1 from public.projects
      where projects.id = project_model_lines.project_id
        and projects.user_id = (select auth.uid())
    )
  );
create policy "project owner creates model lines" on public.project_model_lines
  for insert to authenticated with check (
    exists (
      select 1 from public.projects
      where projects.id = project_model_lines.project_id
        and projects.user_id = (select auth.uid())
    )
  );
create policy "project owner updates model lines" on public.project_model_lines
  for update to authenticated using (
    exists (
      select 1 from public.projects
      where projects.id = project_model_lines.project_id
        and projects.user_id = (select auth.uid())
    )
  ) with check (
    exists (
      select 1 from public.projects
      where projects.id = project_model_lines.project_id
        and projects.user_id = (select auth.uid())
    )
  );
create policy "project owner deletes model lines" on public.project_model_lines
  for delete to authenticated using (
    exists (
      select 1 from public.projects
      where projects.id = project_model_lines.project_id
        and projects.user_id = (select auth.uid())
    )
  );

create policy "project owner reads material prices" on public.project_material_prices
  for select to authenticated using (
    exists (
      select 1 from public.projects
      where projects.id = project_material_prices.project_id
        and projects.user_id = (select auth.uid())
    )
  );
create policy "project owner creates material prices" on public.project_material_prices
  for insert to authenticated with check (
    exists (
      select 1 from public.projects
      where projects.id = project_material_prices.project_id
        and projects.user_id = (select auth.uid())
    )
  );
create policy "project owner updates material prices" on public.project_material_prices
  for update to authenticated using (
    exists (
      select 1 from public.projects
      where projects.id = project_material_prices.project_id
        and projects.user_id = (select auth.uid())
    )
  ) with check (
    exists (
      select 1 from public.projects
      where projects.id = project_material_prices.project_id
        and projects.user_id = (select auth.uid())
    )
  );
create policy "project owner deletes material prices" on public.project_material_prices
  for delete to authenticated using (
    exists (
      select 1 from public.projects
      where projects.id = project_material_prices.project_id
        and projects.user_id = (select auth.uid())
    )
  );

revoke all on all tables in schema public from anon, authenticated;
grant select on public.profiles to authenticated;
grant select on public.catalog_admins to authenticated;
grant select, insert, update, delete on public.door_models, public.materials, public.model_materials to authenticated;
grant select, insert on public.formula_versions to authenticated;
grant select, insert, update, delete on public.projects, public.project_model_lines, public.project_material_prices to authenticated;

alter default privileges in schema public revoke execute on functions from public, anon;
