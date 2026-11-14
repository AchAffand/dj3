-- Replace active normalized Master Harga rows from the 2026 workbook.
-- Legacy catalogue tables and project snapshots remain untouched.
begin;

alter table public.master_items
  add column if not exists source_sheet text,
  add column if not exists source_cell text;

create or replace function public.import_master_harga_workbook(p_payload jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public, private, pg_temp
as $$
declare
  v_item jsonb;
  v_price jsonb;
  v_group_id uuid;
  v_item_id uuid;
  v_brand_id uuid;
  v_variant_id uuid;
  v_group_key text;
  v_group_label text;
  v_group_type text;
  v_brand_key text;
  v_brand_label text;
  v_variant_key text;
  v_variant_label text;
  v_amount numeric;
  v_formula text;
  v_source_cell text;
  v_source_value text;
  v_version integer;
  v_items integer := 0;
  v_prices integer := 0;
  v_options integer := 0;
  v_variants integer := 0;
begin
  if not coalesce(private.is_catalog_admin(), false) then
    raise exception 'Hanya admin Master Harga yang dapat mengimpor workbook.';
  end if;

  if jsonb_typeof(p_payload) <> 'object'
     or jsonb_typeof(p_payload->'items') <> 'array'
     or jsonb_array_length(p_payload->'items') = 0 then
    raise exception 'Format impor tidak valid: items harus berupa array yang tidak kosong.';
  end if;

  -- Retire old active Master Item rows without deleting historical references.
  update public.master_item_prices set is_current = false where is_current;
  update public.master_item_variants set active = false where active;
  update public.master_item_brand_options set active = false where active;
  update public.master_items set active = false where active;
  update public.master_brands set active = false where active;

  insert into public.master_item_groups(group_key, label, group_type, position, active)
  values
    ('pintu','Pintu','product',10,true),
    ('kusen','Kusen','product',20,true),
    ('jendela','Jendela','product',30,true),
    ('aluminium','Aluminium','material',40,true),
    ('kayu','Kayu','material',50,true),
    ('kaca','Kaca','supporting',60,true),
    ('aksesoris','Aksesoris','supporting',70,true),
    ('finishing-pekerjaan-tambahan','Finishing dan pekerjaan tambahan','supporting',80,true)
  on conflict (group_key) do update set
    label = excluded.label, group_type = excluded.group_type,
    position = excluded.position, active = true, updated_at = now();

  insert into public.master_brands(brand_key, label, position, active)
  values ('hpm','HPM',10,true),('alexindo','Alexindo',20,true),('ykk','YKK',30,true)
  on conflict (brand_key) do update set
    label = excluded.label, position = excluded.position, active = true, updated_at = now();

  for v_item in select value from jsonb_array_elements(p_payload->'items')
  loop
    v_group_key := nullif(v_item->>'group','');
    v_group_label := case v_group_key
      when 'pintu' then 'Pintu'
      when 'kusen' then 'Kusen'
      when 'jendela' then 'Jendela'
      when 'aluminium' then 'Aluminium'
      when 'kayu' then 'Kayu'
      when 'kaca' then 'Kaca'
      when 'aksesoris' then 'Aksesoris'
      when 'finishing-pekerjaan-tambahan' then 'Finishing dan pekerjaan tambahan'
      else null
    end;
    if v_group_label is null then
      raise exception 'Kelompok item tidak dikenal: %', v_group_key;
    end if;
    v_group_type := case when v_group_key in ('pintu','kusen','jendela') then 'product'
                         when v_group_key in ('aluminium','kayu') then 'material'
                         else 'supporting' end;

    insert into public.master_item_groups(group_key,label,group_type,position,active)
    values(v_group_key,v_group_label,v_group_type,80,true)
    on conflict(group_key) do update set active=true, updated_at=now()
    returning id into v_group_id;

    insert into public.master_items(group_id,item_key,label,unit,description,source_sheet,source_cell,active)
    values(
      v_group_id,
      v_item->>'key',
      v_item->>'label',
      coalesce(v_item->>'unit',''),
      null,
      v_item->>'source_sheet',
      v_item->>'source_cell',
      true
    )
    on conflict(item_key) do update set
      group_id=excluded.group_id, label=excluded.label, unit=excluded.unit,
      source_sheet=excluded.source_sheet, source_cell=excluded.source_cell,
      active=true, updated_at=now()
    returning id into v_item_id;
    v_items := v_items + 1;

    if jsonb_typeof(v_item->'brand_prices') = 'array' then
      for v_price in select value from jsonb_array_elements(v_item->'brand_prices')
      loop
        v_brand_key := v_price->>'brand';
        v_brand_label := case v_brand_key when 'hpm' then 'HPM' when 'alexindo' then 'Alexindo' when 'ykk' then 'YKK' else null end;
        if v_brand_label is null then raise exception 'Merek tidak dikenal: %', v_brand_key; end if;
        select id into v_brand_id from public.master_brands where brand_key=v_brand_key;
        insert into public.master_item_brand_options(item_id,brand_id,active)
        values(v_item_id,v_brand_id,true)
        on conflict(item_id,brand_id) do update set active=true
        returning item_id into v_item_id;
        v_options := v_options + 1;

        v_variant_label := coalesce(v_price->>'variant','Standar');
        v_variant_key := regexp_replace(lower(v_variant_label),'[^a-z0-9]+','-','g');
        insert into public.master_item_variants(item_id,variant_key,label,attributes,position,active)
        values(v_item_id,v_variant_key,v_variant_label,jsonb_build_object('finishing',v_variant_label),0,true)
        on conflict(item_id,variant_key) do update set label=excluded.label,attributes=excluded.attributes,active=true,updated_at=now()
        returning id into v_variant_id;
        v_variants := v_variants + 1;

        v_amount := nullif(v_price->>'amount','')::numeric;
        v_formula := nullif(v_price->>'formula','');
        v_source_cell := nullif(v_price->>'cell','');
        v_source_value := case when v_price ? 'amount' then v_price->>'amount' else null end;
        update public.master_item_prices
          set is_current=false, updated_at=now()
          where item_id=v_item_id and brand_id=v_brand_id and variant_id=v_variant_id and is_current;
        select coalesce(max(version),0)+1 into v_version
          from public.master_item_prices
          where item_id=v_item_id and brand_id=v_brand_id and variant_id=v_variant_id;
        insert into public.master_item_prices(item_id,brand_id,variant_id,amount,expression,source_cell,source_formula,source_value,version,is_current,source_label)
        values(v_item_id,v_brand_id,v_variant_id,v_amount,v_formula,v_source_cell,v_formula,v_source_value,v_version,true,v_item->>'source_sheet');
        v_prices := v_prices + 1;
      end loop;
    else
      v_amount := nullif(v_item->>'price','')::numeric;
      v_formula := nullif(v_item->>'formula','');
      v_source_cell := nullif(v_item->>'price_cell','');
      v_source_value := case when v_item ? 'price' then v_item->>'price' else null end;
      update public.master_item_prices
        set is_current=false, updated_at=now()
        where item_id=v_item_id and brand_id is null and variant_id is null and is_current;
      select coalesce(max(version),0)+1 into v_version
        from public.master_item_prices
        where item_id=v_item_id and brand_id is null and variant_id is null;
      insert into public.master_item_prices(item_id,brand_id,variant_id,amount,expression,source_cell,source_formula,source_value,version,is_current,source_label)
      values(v_item_id,null,null,v_amount,v_formula,v_source_cell,v_formula,v_source_value,v_version,true,v_item->>'source_sheet');
      v_prices := v_prices + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'items_imported',v_items,
    'prices_imported',v_prices,
    'brand_options_processed',v_options,
    'variants_processed',v_variants,
    'source_workbook',p_payload->>'source_workbook'
  );
end;
$$;

revoke all on function public.import_master_harga_workbook(jsonb) from public, anon;
grant execute on function public.import_master_harga_workbook(jsonb) to authenticated;

commit;
