-- Allow catalog administrators to archive selected price catalogs from the UI.
-- Catalogs are soft-deleted so estimates and historical references remain intact.
grant update (active, updated_at) on public.budget_catalogs to authenticated;
