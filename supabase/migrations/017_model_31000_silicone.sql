-- Model 31000 uses Silicone at code 31009, calculated as Polis × 2.
-- Its price mapping points to the workbook's SEALANT / M' item.

begin;

insert into public.materials (code, name, unit)
values (31009, 'silicone', 'm''')
on conflict (code) do update
set name = excluded.name,
    unit = excluded.unit;

insert into public.model_materials as target (
  material_code,
  model_code,
  position,
  current_expression,
  formula_version,
  source_cell,
  source_formula,
  source_cached_quantity
)
values (31009, 31000, 9, 'qty_31006*2', 1, 'Rumus!C40', 'Polis ×2', null)
on conflict (material_code) do update
set model_code = excluded.model_code,
    position = excluded.position,
    formula_version = case
      when target.current_expression is distinct from excluded.current_expression
        then target.formula_version + 1
      else target.formula_version
    end,
    current_expression = excluded.current_expression,
    source_cell = excluded.source_cell,
    source_formula = excluded.source_formula,
    source_cached_quantity = null,
    updated_at = now();

insert into public.formula_versions (material_code, version, expression, created_by)
select material_code, formula_version, current_expression, null
from public.model_materials
where material_code = 31009 and model_code = 31000
on conflict (material_code, version) do nothing;

update public.door_models model
set status = case
      when exists (
        select 1 from public.model_materials item
        where item.model_code = model.code
          and nullif(btrim(item.current_expression), '') is null
      ) then 'incomplete'
      else 'ready'
    end,
    updated_at = now()
where model.code = 31000;

-- HPM/INKA/DACON SEALANT formulas referenced an unavailable base variant.
-- The workbook results are Rp12,500 for Brown, Cream, and Coating (AT14, AT17, AT20).
-- Update only untouched imported formulas so later admin edits are preserved.
with corrected_prices as (
  update public.budget_prices price
  set amount = 12500,
      expression = null,
      version = price.version + 1,
      updated_by = null,
      updated_at = now()
  from public.budget_catalogs catalog,
       public.budget_components component,
       public.budget_variants variant
  where catalog.id = component.catalog_id
    and catalog.id = variant.catalog_id
    and catalog.slug = 'hpm-inka-dacon'
    and component.component_key = 'col_at'
    and variant.variant_key in ('brown', 'cream', 'coating')
    and price.component_id = component.id
    and price.variant_id = variant.id
    and price.source_cell = case variant.variant_key
      when 'brown' then 'AT14'
      when 'cream' then 'AT17'
      else 'AT20'
    end
    and price.source_value in ('=AT11', '=AT14')
    and price.amount is null
    and price.expression is not null
    and price.version = 1
    and price.updated_by is null
  returning price.component_id, price.variant_id, price.version, price.amount, price.expression
)
insert into public.budget_price_versions (component_id, variant_id, version, amount, expression, changed_by)
select component_id, variant_id, version, amount, expression, null
from corrected_prices
on conflict (component_id, variant_id, version) do nothing;

commit;
