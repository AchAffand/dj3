-- Rollback-only pgTAP regression tests for migration 021.
-- Run with: supabase test db
create extension if not exists pgtap with schema extensions;

begin;
select extensions.plan(16);

-- Deterministic fixtures. The auth trigger creates corresponding profiles.
insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000101', 'authenticated', 'authenticated', 'admin-021@dj3.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000102', 'authenticated', 'authenticated', 'other-021@dj3.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000103', 'authenticated', 'authenticated', 'new-021@dj3.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now())
on conflict (id) do nothing;

insert into public.catalog_admins(user_id)
values ('00000000-0000-0000-0000-000000000101')
on conflict (user_id) do nothing;

insert into public.budget_catalogs(id, slug, label, "position", active)
values ('00000000-0000-0000-0000-000000000201', 'test-021', 'Test 021', 999, true)
on conflict (id) do nothing;

insert into public.budget_variants(id, catalog_id, variant_key, label, source_row, "position")
values ('00000000-0000-0000-0000-000000000202', '00000000-0000-0000-0000-000000000201', 'test_021', 'Test variant', 1, 999)
on conflict (id) do nothing;

insert into public.materials(code, name, unit)
values (990021, 'Test material 021', 'unit')
on conflict (code) do nothing;

-- The role used by PostgREST must have the SQL privileges as well as RLS policy.
select extensions.ok(has_table_privilege('authenticated', 'public.project_line_price_snapshots', 'INSERT'), 'authenticated has INSERT privilege on snapshots');
select extensions.ok(has_table_privilege('authenticated', 'public.project_line_price_snapshots', 'UPDATE'), 'authenticated has UPDATE privilege on snapshots');
select extensions.ok(has_table_privilege('authenticated', 'public.project_line_price_snapshots', 'DELETE'), 'authenticated has DELETE privilege on snapshots');

-- A new ordinary account can create its own project and persist a real snapshot row.
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-000000000103","role":"authenticated","aud":"authenticated"}';
set local "request.jwt.claim.sub" = '00000000-0000-0000-0000-000000000103';
set local "request.jwt.claim.role" = 'authenticated';

select extensions.lives_ok(
  $$ select public.save_project_with_budget_prices(
    null, 'Project 021 owner', 'Location', 'Floor 1', '[]'::jsonb, '[]'::jsonb,
    '[{"material_code":990021,"catalog_id":"00000000-0000-0000-0000-000000000201","variant_id":"00000000-0000-0000-0000-000000000202","name_snapshot":"Test material 021","unit_snapshot":"unit","unit_price":125.50}]'::jsonb
  ) $$,
  'new account can save a project including a price snapshot'
);
select extensions.is(
  (select count(*)::integer from public.projects where name = 'Project 021 owner'),
  1, 'owner can read the project it created'
);
select extensions.is(
  (select count(*)::integer from public.project_line_price_snapshots s join public.projects p on p.id=s.project_id where p.name='Project 021 owner'),
  1, 'owner can read the saved price snapshot'
);

-- A different ordinary user cannot see or overwrite the project.
reset role;
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-000000000102","role":"authenticated","aud":"authenticated"}';
set local "request.jwt.claim.sub" = '00000000-0000-0000-0000-000000000102';
set local "request.jwt.claim.role" = 'authenticated';

select extensions.is(
  (select count(*)::integer from public.projects where id=current_setting('test.project_021_id')::uuid),
  0, 'another regular user cannot see a project by its known id'
);
select extensions.throws_ok(
  $$ select public.save_project_with_budget_prices(
    current_setting('test.project_021_id')::uuid, 'Unauthorized overwrite', '', '', '[]'::jsonb, '[]'::jsonb, '[]'::jsonb
  ) $$,
  '42501', null, 'another regular user cannot overwrite a project by known id'
);

-- Admin can see and edit another user's project, including snapshot replacement.
reset role;
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-000000000101","role":"authenticated","aud":"authenticated"}';
set local "request.jwt.claim.sub" = '00000000-0000-0000-0000-000000000101';
set local "request.jwt.claim.role" = 'authenticated';

select extensions.is(
  (select count(*)::integer from public.projects where id=current_setting('test.project_021_id')::uuid),
  1, 'catalog admin can see another user project'
);
select extensions.lives_ok(
  $$ select public.save_project_with_budget_prices(
    current_setting('test.project_021_id')::uuid, 'Project 021 admin edit', 'Admin location', 'Floor 2', '[]'::jsonb, '[]'::jsonb,
    '[{"material_code":990021,"catalog_id":"00000000-0000-0000-0000-000000000201","variant_id":"00000000-0000-0000-0000-000000000202","name_snapshot":"Admin snapshot","unit_snapshot":"unit","unit_price":250.00}]'::jsonb
  ) $$,
  'catalog admin can edit project and replace its snapshot'
);
select extensions.is(
  (select user_id from public.projects where id=current_setting('test.project_021_id')::uuid),
  '00000000-0000-0000-0000-000000000103'::uuid,
  'admin edit preserves original project owner'
);
select extensions.is(
  (select floor from public.projects where id=current_setting('test.project_021_id')::uuid),
  'Floor 2', 'admin edit saves project metadata'
);
select extensions.is(
  (select unit_price from public.project_line_price_snapshots where project_id=current_setting('test.project_021_id')::uuid and material_code=990021),
  250.00::numeric, 'admin can replace the stored snapshot price'
);

-- Admin has no project-header delete privilege through RLS, but may edit child rows.
with deleted as (
  delete from public.projects where id=current_setting('test.project_021_id')::uuid returning id
)
select extensions.is((select count(*)::integer from deleted), 0, 'catalog admin cannot delete a project header');
select extensions.is(
  (select count(*)::integer from public.projects where id=current_setting('test.project_021_id')::uuid),
  1, 'project remains after admin delete attempt'
);

-- Confirm the original owner can still update its own project after admin access is added.
reset role;
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-000000000103","role":"authenticated","aud":"authenticated"}';
set local "request.jwt.claim.sub" = '00000000-0000-0000-0000-000000000103';
set local "request.jwt.claim.role" = 'authenticated';
select extensions.lives_ok(
  $$ select public.save_project_with_budget_prices(
    current_setting('test.project_021_id')::uuid, 'Project 021 owner edit', 'Owner location', 'Floor 3', '[]'::jsonb, '[]'::jsonb, '[]'::jsonb
  ) $$,
  'original owner can still edit its own project'
);

select * from extensions.finish();
rollback;
