# Master Harga dan Anggaran Kusen Implementation Plan

> **For agentic workers:** Follow this plan task by task in the current session. Do not delegate unless the user explicitly requests it.

**Goal:** Add a responsive Master Harga module with ALEXINDO and HPM/INKA/DACON price books, editable rates/formulas, saved estimates, and print output faithful to the two Excel sheets.

**Architecture:** Extend the existing dashboard with a Master Harga item below Master Rumus and data-driven price-book subroutes. Store catalog definitions, rates/rules, and owner-scoped estimates in Supabase; calculate in a typed browser domain layer using a restricted formula evaluator and persist price/formula snapshots with each estimate.

**Tech Stack:** React, TypeScript, Vite, React Router, Supabase Postgres/Auth/RLS, existing restricted formula parser, CSS print media.

**Spec:** `docs/superpowers/specs/2026-10-05-master-harga-anggaran-kusen-design.md`

## Global Constraints

- “Aplikasi tetap memakai React, TypeScript, Vite, Supabase Auth/Postgres, dan pola navigasi fitur yang sudah ada.”
- “Ini bukan dashboard atau beranda baru.”
- “Setiap submenu adalah satu lembar kerja anggaran lengkap, bukan hanya daftar harga.”
- “Evaluasi rumus menggunakan parser aritmetika terbatas; tidak menggunakan `eval` atau menjalankan kode bebas.”
- “Anggaran menyimpan snapshot daftar komponen, harga, rumus, dan hasil saat disimpan. Perubahan master berikutnya tidak mengubah anggaran lama.”
- “Harga master hanya bisa diubah katalog admin.”
- “Seluruh komponen sampai kolom terakhir sumber harus dijumlahkan pada setiap baris: ALEXINDO sampai BT dan HPM sampai BU.”
- Do not alter the existing door calculator, its formulas, or saved project records as part of this feature.
- Add no dependencies and do not initialize Git; this workspace is not currently a Git repository.

## Review Focus

- Catalog and variant price formulas must reference registered components/variants, and must reject cycles and division by zero.
- HPM's BU component must participate in every line subtotal.
- ALEXINDO and HPM component lists, variants, and line rules differ and must be checked against their own source sheet.
- An old estimate must remain unchanged after a master price/formula update.
- Supabase RLS must limit estimate access to its owner and price changes to catalog admins.

---

## File Map

- Modify `src/app/features.ts`, `src/app/AppShell.tsx`, and `src/app/routes.tsx` for the new parent menu, its child links, and parameterized pages.
- Add `src/domain/budgets/types.ts`, `calculateBudget.ts`, and `priceFormula.ts` for catalog, estimate, formula evaluation, and totals.
- Add `src/features/budget-master/BudgetMasterPage.tsx`, `BudgetCatalogPage.tsx`, `BudgetEstimatePage.tsx`, `BudgetPrintPage.tsx`, and focused child components for price tables and grouped estimate inputs.
- Extend `src/integrations/supabase/repository.ts` and `src/app/AppServices.tsx` with typed budget catalog/estimate methods and loading state.
- Add `supabase/migrations/006_kusen_budget.sql` and extend `supabase/seed.sql` with workbook-derived catalogs/rules.
- Add scoped styles to `src/styles/global.css` (or a feature CSS file imported by the feature) for grouped fields, compact mobile layout, and print layout.

## Interfaces

```ts
export type BudgetComponent = {
  key: string; label: string; unit: string; group: string; position: number;
};
export type BudgetVariant = { key: string; label: string; position: number };
export type BudgetCatalog = {
  id: string; slug: string; label: string; position: number;
  components: BudgetComponent[]; variants: BudgetVariant[];
  prices: BudgetPrice[]; rules: BudgetCalculationRule[];
};
export type BudgetPrice = {
  componentKey: string; variantKey: string; value: number | null;
  expression: string | null; version: number;
};
export type BudgetCalculationRule = {
  linePosition: number; componentKey: string; priceVariantKey: string;
};
export type BudgetEstimateLine = {
  position: number; description: string; unitCount: number;
  quantities: Readonly<Record<string, number>>;
};
export type BudgetEstimate = {
  id?: string; catalogId: string; projectName: string; location: string;
  floor: string; lines: BudgetEstimateLine[];
  snapshot: BudgetEstimateSnapshot;
};
export function calculateBudget(catalog: BudgetCatalog, lines: readonly BudgetEstimateLine[]): BudgetEstimateResult;
```

Repository methods to add:

```ts
listBudgetCatalogs(): Promise<BudgetCatalogSummary[]>;
loadBudgetCatalog(slug: string): Promise<BudgetCatalog | null>;
saveBudgetPriceChange(change: BudgetPriceChange): Promise<void>;
listBudgetEstimates(catalogId?: string): Promise<BudgetEstimateSummary[]>;
loadBudgetEstimate(id: string): Promise<BudgetEstimate | null>;
saveBudgetEstimate(input: BudgetEstimate): Promise<BudgetEstimate>;
```

## Tasks

### Task 1: Extract and seed both price books from the latest workbook

**Files:**
- Modify: `supabase/seed.sql`
- Create: `supabase/seed_kusen_budget.sql` (included from the project seed workflow)
- Create: `src/domain/budgets/workbook-source.json` only if a source map is needed for audit; never load this file in the browser as a replacement for Supabase data.

**Steps:**

- Read `Master budget_DJ3 bengkel.xlsx` from the project folder; use the bundled Python/openpyxl runtime for extraction only. Apply the complete range through BT to every ALEXINDO work line and through BU to every HPM work line; the screenshot-confirmed HPM pattern is `SUM(F23:BU23)*C22`.
- Extract component key, source cell, exact label, unit, category, position, variant labels, static prices, and variant formulas from `ALEXINDO` and `Hpm-inka-dacon dll`.
- Extract all 21 line positions and per-line/per-component price-variant references from each sheet's detail formulas; store explicit rules so different source mappings remain different.
- Write idempotent SQL seed records. Do not change the workbook or manufacture sample project quantities.

### Task 2: Add Supabase catalog, formula, price history, and estimate storage

**Files:**
- Create: `supabase/migrations/006_kusen_budget.sql`
- Modify: `supabase/seed.sql`

**Steps:**

- Create `budget_catalogs`, `budget_components`, `budget_variants`, `budget_prices`, `budget_price_versions`, `budget_calculation_rules`, `budget_estimates`, and `budget_estimate_lines` with stable keys, source-cell trace fields, nonnegative money checks, JSON shape checks, and timestamps.
- Add policies: authenticated users can read active catalogs; only `private.is_catalog_admin()` can mutate catalogs/prices/rules; estimate select/insert/update/delete requires `auth.uid()` to match estimate owner.
- Store a complete immutable estimate snapshot of component labels/units, selected source-derived rate values and formulas, rule mapping, row results, and total.
- Seed catalogs and rules idempotently from Task 1 data; grant only the operations used by the client.

### Task 3: Implement restricted price expression evaluation and budget arithmetic

**Files:**
- Create: `src/domain/budgets/types.ts`
- Create: `src/domain/budgets/priceFormula.ts`
- Create: `src/domain/budgets/calculateBudget.ts`
- Modify: `src/domain/formulas/ast.ts`, `lexer.ts`, and parser/evaluator only if a safe extension is required.

**Steps:**

- Define registered `price_<componentKey>_<variantKey>` references and arithmetic expressions using the existing parser's allowed numeric operators; normalize Excel percent factors into equivalent multipliers.
- Resolve price references in dependency order, reject unknown keys/cycles/division by zero, and preserve exact decimal calculation until display formatting.
- Implement component amount = entered quantity × configured rate; line subtotal = sum of component amounts × unit count; grand total = sum of line subtotals.
- Apply each row/component rule independently, including final HPM BU component; return explicit errors for missing prices or invalid formulas rather than a false zero.

### Task 4: Add typed Supabase repository and app service integration

**Files:**
- Modify: `src/integrations/supabase/repository.ts`
- Modify: `src/app/AppServices.tsx`

**Steps:**

- Implement the exact repository signatures in the Interfaces section with explicit column selection and row mapping.
- Load active budget catalogs and their ordered components, variants, prices, and line rules.
- Implement append-only price/formula updates with version increments through a constrained Supabase RPC; do not permit client-side direct updates that bypass history.
- Save estimates and lines transactionally through an RPC, update existing estimates only for their owner, and include full snapshots.
- Expose catalog admin status and catalog loading/error state through `AppServices` without changing existing door catalog behavior.

### Task 5: Add Master Harga navigation and extensible catalog pages

**Files:**
- Modify: `src/app/features.ts`
- Modify: `src/app/AppShell.tsx`
- Modify: `src/app/routes.tsx`
- Create: `src/features/budget-master/BudgetMasterPage.tsx`
- Create: `src/features/budget-master/BudgetCatalogPage.tsx`
- Create: `src/features/budget-master/PriceTableEditor.tsx`

**Steps:**

- Add the **Master Harga** navigation item directly below **Master Rumus** in the existing sidebar; do not add or replace a dashboard/home page.
- Load submenu labels/routes from active catalog records and render ALEXINDO and HPM/INKA/DACON through the same generic catalog page.
- Display the full price matrix grouped by component category, with variant columns/tabs, source price, and active formula preview.
- Show edit controls only to catalog admins; validate and preview formula changes before saving, display version history, and show clear errors on denied changes.
- Keep the component groups usable on narrow screens without horizontal page overflow.

### Task 6: Build saveable 21-line budget estimator

**Files:**
- Create: `src/features/budget-master/BudgetEstimatePage.tsx`
- Create: `src/features/budget-master/BudgetEstimateLineEditor.tsx`
- Create: `src/features/budget-master/BudgetComponentGroup.tsx`
- Modify: `src/app/routes.tsx`

**Steps:**

- Add catalog-specific estimate list/create/edit routes using the current Master Harga parent navigation.
- Render project name, location, floor, report date, and author identity in the estimate header.
- Render 21 fixed work rows with editable description and unit count; group all component inputs by category and show the applied rate, calculated component amount, line subtotal, and grand total.
- Recalculate locally on every input/change using `calculateBudget`; show missing price/formula errors adjacent to affected component.
- Save, reopen, and update estimates through repository methods; reload old estimates from snapshots without reading current prices into their historical result.
- Preserve the active catalog slug when returning to the catalog page and when navigating between estimates.

### Task 7: Add print/PDF output for saved estimates

**Files:**
- Create: `src/features/budget-master/BudgetPrintPage.tsx`
- Modify: `src/app/routes.tsx`
- Modify: feature styles for `@media print`

**Steps:**

- Render estimate metadata, catalog/variant, used work lines, used component quantity/rate/amount, line subtotals, and grand total from the saved snapshot.
- Add a print action that calls the browser print dialog; use print CSS to hide navigation and controls, use compact readable typography and balanced all-border tables, and set landscape only where component detail requires it.
- Confirm output does not depend on the currently active master prices and that long labels wrap without clipping.

### Task 8: Integrate styles and complete application handoff

**Files:**
- Modify: `src/styles/global.css` or feature-local styles
- Modify: `README.md` for the new Supabase migration/seed steps

**Steps:**

- Match the approved black-and-white visual system, existing compact sidebar, and mobile field behavior.
- Run the production build and resolve TypeScript/Vite errors.
- Prepare the migration and seed for deployment; do not push changes to the external Supabase project in this implementation plan.
- Update the README with local migration/seed and feature usage instructions.

## Plan self-review

- Spec coverage: menu location/extensibility (Task 5), both source catalogs and exact formulas (Tasks 1–3), admin edits and history (Tasks 2, 4–5), responsive estimate creation/editing and snapshots (Tasks 2, 4, 6), print/PDF (Task 7), access policies (Task 2), styling/docs/build (Task 8).
- Source correction is applied consistently in the web calculation: every ALEXINDO row includes BT and every HPM row includes BU, matching the user's requirement that all components count.
- Formula references stay typed as component and variant keys from import through calculation, UI, snapshots, and repository.
- The project directory is not a Git repository, so this plan does not add Git initialization or commit steps.
