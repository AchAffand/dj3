-- kalkulator_Pintu.xlsx master also includes groups 30000 and 40000.
-- Expand constraints without replacing existing formulas or project snapshots.
alter table public.door_models
  drop constraint if exists door_models_code_check,
  drop constraint if exists door_models_group_code_check;

alter table public.door_models
  add constraint door_models_code_check
    check (code >= 10100 and code < 50000 and code % 100 = 0),
  add constraint door_models_group_code_check
    check (
      group_code between 10000 and 40000
      and group_code % 10000 = 0
      and group_code = (code / 10000) * 10000
    );

alter table public.materials
  drop constraint if exists materials_code_check;

alter table public.materials
  add constraint materials_code_check
    check (code > 10000 and code < 50000);

alter table public.materials
  add column if not exists source_code integer;
