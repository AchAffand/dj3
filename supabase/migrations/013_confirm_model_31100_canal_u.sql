-- Confirmed from Foto 333.jpeg: model 31100 Canal U includes two L2 spans,
-- each multiplied by 2. Preserve any different formula entered by an admin.

update public.model_materials
set current_expression = '(T1*2+L1+L2*2*2)/1000',
    formula_version = case
      when current_expression is null or btrim(current_expression) = '' then formula_version
      when current_expression = '(T1*2+L1+L2*2)/1000' then formula_version + 1
      else formula_version
    end,
    source_cell = 'Foto 333.jpeg',
    source_formula = 'Canal U = T1×2 + L1 + L2×2×2'
where material_code = 31102
  and model_code = 31100
  and (
    current_expression is null
    or btrim(current_expression) = ''
    or current_expression in (
      '(T1*2+L1+L2*2)/1000',
      '(T1*2+L1+L2*2*2)/1000'
    )
  );

insert into public.formula_versions (material_code, version, expression, created_by)
select material_code, formula_version, current_expression, null
from public.model_materials
where material_code = 31102
  and model_code = 31100
  and current_expression = '(T1*2+L1+L2*2*2)/1000'
  and source_cell = 'Foto 333.jpeg'
on conflict (material_code, version) do update
set expression = excluded.expression
where public.formula_versions.expression is null
   or btrim(public.formula_versions.expression) = '';
