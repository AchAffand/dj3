-- Photo reference confirms the 32400 Kusen term is T3, not a second T2.
-- Model 33000 refers to 32400, so its Kusen calculation follows the correction.
-- Update only formulas that are blank or still equal the previous catalog value.
update public.model_materials
set current_expression = '(T1*2+T3+T2*3+L1*2+L2*3)/1000',
    formula_version = case
      when current_expression = '(T1*2+T2+T2*3+L1*2+L2*3)/1000'
        then formula_version + 1
      else formula_version
    end,
    source_cell = 'Rumus!C188',
    source_formula = 'T1×2 + T3 + T2×3 + L1×2 + L2×3'
where material_code = 32401
  and model_code = 32400
  and (current_expression is null or btrim(current_expression) = ''
       or current_expression = '(T1*2+T2+T2*3+L1*2+L2*3)/1000');

update public.model_materials
set current_expression = '(T1*2+T3+T2*3+L1*2+L2*3)/1000',
    formula_version = case
      when current_expression = '(T1*2+T2+T2*3+L1*2+L2*3)/1000'
        then formula_version + 1
      else formula_version
    end,
    source_cell = 'Rumus!C254',
    source_formula = 'sama dengan 32400'
where material_code = 33001
  and model_code = 33000
  and (current_expression is null or btrim(current_expression) = ''
       or current_expression = '(T1*2+T2+T2*3+L1*2+L2*3)/1000');

-- The workbook's 32500 Kaca row had omitted multiplication signs. The
-- application already uses the area expression; align its source description.
update public.model_materials
set source_cell = 'Rumus!C203',
    source_formula = '(T1+T2)×L1 + L2×(T2+T3)'
where material_code = 32502
  and model_code = 32500
  and current_expression = '((T1+T2)*L1+L2*(T2+T3))/1000000';

insert into public.formula_versions (material_code, version, expression, created_by)
select material_code, formula_version, current_expression, null
from public.model_materials
where (model_code, material_code) in ((32400, 32401), (33000, 33001))
  and current_expression = '(T1*2+T3+T2*3+L1*2+L2*3)/1000'
on conflict (material_code, version) do update
set expression = excluded.expression
where public.formula_versions.expression is null
   or btrim(public.formula_versions.expression) = '';
