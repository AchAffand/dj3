-- Remove confirmed unused/incomplete material rows from door-window models.
-- Model 31400 is intentionally excluded and remains untouched.
begin;

do $$
declare
  v_code integer;
  v_codes integer[] := array[
    30606, 30705, 30805, 30905,
    31109,
    31206, 31306,
    31506, 31605, 31705, 31809, 31909, 32009, 32109, 32209, 32309,
    32406, 32506, 32606, 32706, 32806, 32906, 33006, 33106, 33206, 33306,
    33406, 33506, 34308
  ];
begin
  foreach v_code in array v_codes loop
    if exists (
      select 1
      from public.model_materials other
      where other.material_code <> v_code
        and other.current_expression ~ ('(^|[^[:alnum:]_])qty_' || v_code::text || '([^[:digit:]]|$)')
    ) or exists (
      select 1
      from public.formula_versions history
      where history.material_code <> v_code
        and history.expression ~ ('(^|[^[:alnum:]_])qty_' || v_code::text || '([^[:digit:]]|$)')
    ) then
      raise exception 'Material % is referenced by another formula; refusing to remove it.', v_code;
    end if;
  end loop;
end $$;

delete from public.formula_versions
where material_code = any(array[
  30606, 30705, 30805, 30905,
  31109,
  31206, 31306,
  31506, 31605, 31705, 31809, 31909, 32009, 32109, 32209, 32309,
  32406, 32506, 32606, 32706, 32806, 32906, 33006, 33106, 33206, 33306,
  33406, 33506, 34308
]);

delete from public.model_materials
where material_code = any(array[
  30606, 30705, 30805, 30905,
  31109,
  31206, 31306,
  31506, 31605, 31705, 31809, 31909, 32009, 32109, 32209, 32309,
  32406, 32506, 32606, 32706, 32806, 32906, 33006, 33106, 33206, 33306,
  33406, 33506, 34308
]);

delete from public.materials material
where material.code = any(array[
  30606, 30705, 30805, 30905,
  31109,
  31206, 31306,
  31506, 31605, 31705, 31809, 31909, 32009, 32109, 32209, 32309,
  32406, 32506, 32606, 32706, 32806, 32906, 33006, 33106, 33206, 33306,
  33406, 33506, 34308
])
  and not exists (
    select 1 from public.project_material_prices price
    where price.material_code = material.code
  )
  and not exists (
    select 1 from public.project_line_price_snapshots snapshot
    where snapshot.material_code = material.code
  );

update public.door_models model
set status = case
  when exists (
    select 1 from public.model_materials item
    where item.model_code = model.code and item.current_expression is null
  ) then 'incomplete'
  else 'ready'
end
where model.code in (
  30600, 30700, 30800, 30900, 31100, 31200, 31300, 31500, 31600, 31700,
  31800, 31900, 32000, 32100, 32200, 32300, 32400, 32500, 32600, 32700,
  32800, 32900, 33000, 33100, 33200, 33300, 33400, 33500, 34300
);

commit;
