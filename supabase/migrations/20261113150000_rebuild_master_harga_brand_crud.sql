-- Rebuild Aluminium brand CRUD with guarded rename and soft-archive operations.
-- Brand rows are never hard-deleted so estimates and historical snapshots remain valid.

create or replace function public.update_budget_catalog_label(
  p_catalog_id uuid,
  p_label text
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_slug text;
begin
  if not (select private.is_catalog_admin()) then
    raise exception 'Catalog admin access required' using errcode = '42501';
  end if;

  if nullif(trim(p_label), '') is null then
    raise exception 'Nama merk wajib diisi' using errcode = '22023';
  end if;

  select slug into v_slug
  from public.budget_catalogs
  where id = p_catalog_id and active
  for update;

  if v_slug is null then
    raise exception 'Merk tidak ditemukan atau sudah diarsipkan' using errcode = 'P0002';
  end if;

  if v_slug in ('alexindo', 'hpm-inka-dacon', 'ykk', 'kaca-umum', 'aksesoris-umum') then
    raise exception 'Merk utama tidak dapat diubah namanya' using errcode = '42501';
  end if;

  if exists (
    select 1
    from public.budget_catalogs existing
    where existing.active
      and existing.id <> p_catalog_id
      and lower(trim(existing.label)) = lower(trim(p_label))
  ) then
    raise exception 'Nama merk tersebut sudah digunakan' using errcode = '23505';
  end if;

  update public.budget_catalogs
  set label = trim(p_label),
      updated_at = now()
  where id = p_catalog_id;
end;
$$;

create or replace function public.archive_budget_catalogs(p_catalog_ids uuid[])
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_ids uuid[];
  v_found integer;
  v_archived integer;
begin
  if not (select private.is_catalog_admin()) then
    raise exception 'Catalog admin access required' using errcode = '42501';
  end if;

  select coalesce(array_agg(distinct id), '{}'::uuid[])
  into v_ids
  from unnest(coalesce(p_catalog_ids, '{}'::uuid[])) as selected(id);

  if cardinality(v_ids) = 0 then
    return 0;
  end if;

  select count(*) into v_found
  from public.budget_catalogs
  where id = any(v_ids) and active;

  if v_found <> cardinality(v_ids) then
    raise exception 'Sebagian merk tidak ditemukan atau sudah diarsipkan' using errcode = 'P0002';
  end if;

  if exists (
    select 1
    from public.budget_catalogs
    where id = any(v_ids)
      and slug in ('alexindo', 'hpm-inka-dacon', 'ykk', 'kaca-umum', 'aksesoris-umum')
  ) then
    raise exception 'Merk utama tidak dapat diarsipkan' using errcode = '42501';
  end if;

  update public.budget_catalogs
  set active = false,
      updated_at = now()
  where id = any(v_ids)
    and active;

  get diagnostics v_archived = row_count;
  return v_archived;
end;
$$;

revoke all on function public.update_budget_catalog_label(uuid, text) from public, anon, authenticated;
revoke all on function public.archive_budget_catalogs(uuid[]) from public, anon, authenticated;
grant execute on function public.update_budget_catalog_label(uuid, text) to authenticated;
grant execute on function public.archive_budget_catalogs(uuid[]) to authenticated;
