# SDD ledger — plan: docs/superpowers/plans/2026-10-02-kalkulator-pintu-web.md

Ruling: workspace isolation and task scripts unavailable — this directory has no Git repository, so no Git worktree or git-backed task scripts can be used; implement in the authorized project directory and preserve all supplied source files — cost if wrong: implementation files cannot be rolled back through Git until the user initializes version control.

Task 2: Ruling: Excel qty references may point outside the selected model (models 10500, 10600, and 10800 refer to L2/code 10101, and cached sample quantities match the referenced frame qty); preserve those exact references as `qty_10101` and resolve catalog-wide using the current project inputs instead of rewriting them to model-local item codes — cost if wrong: an intentionally shared dependency will stay linked to model 10100 when a user might have expected a local material formula.

Correction: initial import filtered out the 30000 and 40000 groups in `kalkulator_Pintu.xlsx`. Workbook master inspection shows 23 + 56 + 21 = 100 models, 1,115 active material rows; include all groups. Rows 845–855 continue the 34200 item sequence but carry source codes 34104–34114; normalize to 34204–34214 while storing `sourceCode` provenance. Formula cells match workbook cached numeric quantities across the catalog using source sample inputs. Blank D321 is treated as Excel arithmetic zero — cost if this inference is wrong: item 30501's source blank-cell reference is not surfaced as a formula error.

Pre-flight: Task 1 registry is consumed by Task 4 routes/dashboard; Task 2 DoorModel and catalog seed are consumed by Tasks 3 and 4; Task 3 repository/auth is consumed by Task 4. Keep registry, domain, and repository interfaces aligned with the plan and spec.

## Task tracking

- Task 1: complete (registry test RED→GREEN; `npm test -- src/app/features.test.ts` → 1/1; `npm run build` → pass)
- Task 2: expanded to full door-workbook catalog (100 models / 1,115 active rows; 72 models with formula gaps flagged; import reconciles 34200 source-code run and blank D321 behavior; cached quantity parity revalidated)
- Task 3: implementation ready; JS/repository tests pass. Migration 003 plus expanded seed still need to be pushed to hosted Supabase; the Codex shell reports no Supabase CLI access token. Run `supabase db push --include-seed` in the PowerShell session where `supabase login` succeeded. Local migration/RLS integration verification remains pending because Docker Desktop is not running and PostgreSQL at `127.0.0.1:54322` is unavailable (`supabase db reset --local`, `supabase test db`).
- Task 4: implementation complete (`npm test` → 10 files / 37 tests pass; `npm run build` → pass; integrated calculator flow covers quantity, per-material price, save, reopen, and persisted price).
- Task 5: Vercel SPA configuration and setup documentation complete. Deployment remains pending Supabase and Vercel account/project credentials; no remote changes made.
