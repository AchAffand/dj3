-- Normalize legacy spelling variants for the Tatapan samping material.
-- Quantity formulas and model-material rows are intentionally unchanged.
update public.materials
set name = 'Tatapan samping'
where lower(trim(name)) in (
  'tatpen samping',
  'tatapn samping',
  'tatapan samping'
);