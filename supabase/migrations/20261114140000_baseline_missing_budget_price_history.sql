-- DJ3: baseline missing version-1 history for populated legacy budget prices.
-- Scope: current budget_prices rows with a real amount or expression and no
-- matching budget_price_versions row. Empty placeholders are intentionally skipped.
-- Zero-valued amounts are real values and are intentionally included.
-- This migration is idempotent and does not modify budget_prices.

begin;

insert into public.budget_price_versions (
  component_id,
  variant_id,
  version,
  amount,
  expression,
  changed_by,
  created_at
)
select
  p.component_id,
  p.variant_id,
  p.version,
  p.amount,
  p.expression,
  null,
  coalesce(p.updated_at, now())
from public.budget_prices p
where p.version = 1
  and (p.amount is not null or p.expression is not null)
  and not exists (
    select 1
    from public.budget_price_versions h
    where h.component_id = p.component_id
      and h.variant_id = p.variant_id
      and h.version = p.version
  )
on conflict (component_id, variant_id, version) do nothing;

do $$
begin
  if exists (
    select 1
    from public.budget_prices p
    where p.version = 1
      and (p.amount is not null or p.expression is not null)
      and not exists (
        select 1
        from public.budget_price_versions h
        where h.component_id = p.component_id
          and h.variant_id = p.variant_id
          and h.version = p.version
      )
  ) then
    raise exception 'Budget price history baseline incomplete: populated version-1 prices still lack matching history.';
  end if;
end
$$;

commit;
