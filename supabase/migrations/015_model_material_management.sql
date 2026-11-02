alter table public.model_materials
  add column if not exists is_active boolean not null default true;

comment on column public.model_materials.is_active is
  'When false, the material is hidden from active calculations while formula and project history remain intact.';
