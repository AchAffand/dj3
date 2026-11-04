alter table public.door_models
  add column if not exists is_active boolean not null default true;

comment on column public.door_models.is_active is
  'When false, the model is hidden from new calculations while saved project snapshots remain intact.';

create or replace function public.archive_formula_model(p_model_code integer)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not (select private.is_catalog_admin()) then
    raise exception 'Catalog administrator access required' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.door_models
    where code = p_model_code and is_active
  ) then
    raise exception 'Model tidak ditemukan atau sudah dinonaktifkan' using errcode = 'P0002';
  end if;

  if exists (
    select 1
    from public.model_materials dependent
    join public.model_materials target on target.model_code = p_model_code
    where dependent.model_code <> p_model_code
      and dependent.current_expression ~ ('(^|[^[:alnum:]_])qty_' || target.material_code::text || '([^[:digit:]]|$)')
  ) then
    raise exception 'Model masih dipakai oleh rumus model lain. Ubah rumus yang merujuk materialnya terlebih dahulu.' using errcode = '23503';
  end if;

  update public.door_models
  set is_active = false, updated_at = now()
  where code = p_model_code and is_active;

  if not found then
    raise exception 'Model tidak dapat dinonaktifkan' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.archive_formula_model(integer) from public, anon;
grant execute on function public.archive_formula_model(integer) to authenticated;
