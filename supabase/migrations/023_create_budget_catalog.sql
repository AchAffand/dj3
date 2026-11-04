create or replace function public.create_budget_catalog(p_label text, p_slug text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_catalog_id uuid;
  v_position integer;
begin
  if not (select private.is_catalog_admin()) then
    raise exception 'Catalog admin access required' using errcode = '42501';
  end if;

  if nullif(trim(p_label), '') is null then
    raise exception 'Nama merek wajib diisi' using errcode = '22023';
  end if;
  if p_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then
    raise exception 'Format kode merek tidak valid' using errcode = '22023';
  end if;
  if exists (select 1 from public.budget_catalogs where slug = p_slug) then
    raise exception 'Merek dengan nama tersebut sudah ada' using errcode = '23505';
  end if;

  select coalesce(max(position), 0) + 1 into v_position
  from public.budget_catalogs;

  insert into public.budget_catalogs (slug, label, position, active)
  values (p_slug, trim(p_label), v_position, true)
  returning id into v_catalog_id;

  insert into public.budget_variants (catalog_id, variant_key, label, source_row, position)
  values (v_catalog_id, 'standar', 'Standar', 1, 1);

  return v_catalog_id;
end;
$$;

revoke all on function public.create_budget_catalog(text, text) from public, anon, authenticated;
grant execute on function public.create_budget_catalog(text, text) to authenticated;
