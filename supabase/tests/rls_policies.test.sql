create extension if not exists pgtap with schema extensions;
begin;
select extensions.plan(9);

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'owner@dj3.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'other@dj3.test', '', now(), '{}', '{}', now(), now())
on conflict (id) do nothing;

insert into public.catalog_admins(user_id)
values ('00000000-0000-0000-0000-000000000001')
on conflict (user_id) do nothing;

set local role authenticated;
set local "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated","aud":"authenticated"}';
set local "request.jwt.claim.sub" = '00000000-0000-0000-0000-000000000001';
set local "request.jwt.claim.role" = 'authenticated';

insert into public.projects (id, name)
values ('00000000-0000-0000-0000-000000000011', 'Proyek milik pemilik');
select extensions.is((select count(*)::integer from public.projects where id = '00000000-0000-0000-0000-000000000011'), 1, 'owner can read own project');

insert into public.project_model_lines (project_id, model_code, inputs, model_count)
values ('00000000-0000-0000-0000-000000000011', 10100, '{"T1":2000,"L1":1754}', 1);
select extensions.is((select count(*)::integer from public.project_model_lines where project_id = '00000000-0000-0000-0000-000000000011'), 1, 'owner can add a model line');

reset role;
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-000000000002","role":"authenticated","aud":"authenticated"}';
set local "request.jwt.claim.sub" = '00000000-0000-0000-0000-000000000002';
set local "request.jwt.claim.role" = 'authenticated';
select extensions.is((select count(*)::integer from public.projects where id = '00000000-0000-0000-0000-000000000011'), 0, 'another user cannot read the project');
select extensions.is((select count(*)::integer from public.project_model_lines where project_id = '00000000-0000-0000-0000-000000000011'), 0, 'another user cannot read project lines');
with updated as (
  update public.projects set name = 'Tidak boleh' where id = '00000000-0000-0000-0000-000000000011' returning id
)
select extensions.is((select count(*)::integer from updated), 0, 'another user cannot update the project');
select extensions.throws_ok(
  $$ insert into public.projects (user_id, name) values ('00000000-0000-0000-0000-000000000001', 'Penyusupan') $$,
  '42501', null, 'another user cannot create a project as the owner'
);
with updated as (
  update public.model_materials set current_expression = 'T1/1000' where material_code = 10101 returning material_code
)
select extensions.is((select count(*)::integer from updated), 0, 'non-admin cannot edit catalog formulas');

reset role;
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated","aud":"authenticated"}';
set local "request.jwt.claim.sub" = '00000000-0000-0000-0000-000000000001';
set local "request.jwt.claim.role" = 'authenticated';
select extensions.lives_ok(
  $$ select public.save_formula_change(10101, '(T1+L1)/1000') $$,
  'catalog admin saves formula through the versioning function'
);
select extensions.is((select formula_version from public.model_materials where material_code = 10101), 2, 'formula update advances the version');

select * from extensions.finish();
rollback;
