# Kalkulator Pintu Web Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver an Indonesian web app for door material calculations, formula administration, project recaps, and secure Supabase persistence, ready for Vercel deployment.

**Architecture:** React + TypeScript + Vite frontend with a modular feature registry powering dashboard navigation. A safe arithmetic parser computes model quantities from formulas imported from the door workbook; Supabase Auth and Postgres store versioned catalog/formulas and user-owned project estimates behind RLS.

**Tech Stack:** React, TypeScript, Vite, Supabase JS, Supabase Auth, Postgres migrations/RLS, Vitest, Vercel.

**Spec:** `docs/superpowers/specs/2026-10-02-kalkulator-pintu-web-design.md`

## Global Constraints

- Version one calculates all model groups with data in the `kalkulator_Pintu.xlsx` master; other workbooks remain out of scope until imported and reviewed.
- Model codes increment by 100 and material codes are model code plus item ordinal.
- Inputs follow workbook variables T1, L1, T2, L2, T3, L3, daun pintu, daun jendela.
- Length expressions retain the workbook’s mm-to-m divisor of 1,000 and area expressions retain its mm²-to-m² divisor of 1,000,000.
- Formula evaluation supports numeric literals, named variables, +, -, *, /, parentheses, and stable material-code quantity references; preserve explicit workbook cross-model qty references and resolve them against the catalog using the same project inputs. It must never execute arbitrary code.
- Login is required for saved data and formula changes; database tables use least-privilege grants and RLS.
- A workbook item with no qty formula stays incomplete; do not infer a formula from another model.
- The confirmed model 12100 kusen typo is mapped from the model input fields following its existing prototype expression.
- No Supabase secret/service-role key may enter browser code or public build output.
- Dashboard feature additions go through a typed feature/menu registry; no menu item may point to an unimplemented page.
- Do not claim remote deployment until connected Supabase and Vercel environments are actually configured and verified.

## Review Focus

- Missing or placeholder input values: must remain visibly missing/incomplete and never become a plausible zero result.
- Formula references to material quantities: resolve to stable material codes within the selected model and reject cycles.
- Formula edits after an estimate is saved: old estimates must retain a traceable formula version and stable result.
- Similar material names with different units: aggregate only when both material identity and unit match.
- Cross-user project reads/writes and catalog writes: denied by RLS except to the owner/admin.
- Dashboard registry entries without a valid route/component: rejected by types/tests.

---

### Task 1: Scaffold the app and modular dashboard

**Files:**
- Create: `package.json`, `index.html`, `vite.config.ts`, `tsconfig.json`, `src/main.tsx`, `src/app/App.tsx`, `src/app/routes.tsx`
- Create: `src/app/features.ts`, `src/app/DashboardPage.tsx`, `src/app/AppShell.tsx`
- Create: `src/styles/tokens.css`, `src/styles/global.css`
- Test: `src/app/features.test.ts`

**Interfaces:**
- Produces `FeatureDefinition = { id: string; label: string; path: string; icon: string; component: React.ComponentType }`.
- Produces `featureRegistry: readonly FeatureDefinition[]`, initially registering `calculator`, `projects`, and `formula-master`.
- `routes.tsx` derives route entries and dashboard menu links from the same registry.

- [x] **Step 1: Add package/test-runner configuration, then write the failing feature-registry test**
  Add Vitest and React Testing Library scripts/configuration as scaffold-only dependencies, then test that the three initial features have unique ids/paths and that every path resolves to a non-null component.

  ```ts
  it("registers each initial feature with a unique path", () => {
    expect(featureRegistry.map((feature) => feature.id)).toEqual([
      "calculator", "projects", "formula-master",
    ]);
    expect(new Set(featureRegistry.map((feature) => feature.path)).size)
      .toBe(featureRegistry.length);
    expect(featureRegistry.every((feature) => feature.component)).toBe(true);
  });
  ```
- [x] **Step 2: Run the test and confirm it fails because the feature registry is absent**
  Run: `npm test -- src/app/features.test.ts`
  Expected: failure to resolve the missing registry module.
- [x] **Step 3: Scaffold Vite/React/TypeScript and add registry-backed shell**
  Build a responsive sidebar/dashboard shell in Indonesian; each initial route may render a clearly labeled page shell until its owning task implements the feature.
- [x] **Step 4: Run the registry test and production build**
  Run: `npm test -- src/app/features.test.ts`
  Run: `npm run build`
  Expected: test passes; Vite emits a production build with no type errors.

### Task 2: Import door catalog and build the safe formula engine

**Files:**
- Create: `src/domain/formulas/ast.ts`, `src/domain/formulas/lexer.ts`, `src/domain/formulas/parser.ts`, `src/domain/formulas/evaluate.ts`, `src/domain/formulas/calculateModel.ts`
- Create: `src/domain/catalog/types.ts`, `src/domain/catalog/doorCatalog.ts`
- Create: `scripts/extract-door-catalog.py`, `src/domain/catalog/doorCatalog.test.ts`
- Test: `src/domain/formulas/parser.test.ts`, `src/domain/formulas/calculateModel.test.ts`

**Interfaces:**
- `InputVariables = { T1?: number; L1?: number; T2?: number; L2?: number; T3?: number; L3?: number; daunPintu?: number; daunJendela?: number }`.
- `MaterialFormula = { code: number; name: string; unit: string; expression: string | null; sourceCell: string }`.
- `DoorModel = { code: number; groupCode: number; name: string; inputs: readonly (keyof InputVariables)[]; materials: readonly MaterialFormula[]; status: "ready" | "incomplete" }`.
- `evaluateModel(model, input): { items: { code: number; name: string; unit: string; quantity: number }[]; errors: { materialCode: number; reason: string }[] }`.
- Formula references to another material use `qty_10101`-style stable tokens and dependency ordering, never row-number lookup at runtime. Preserve workbook references outside the selected model (e.g. model 10500 -> material 10101) as source-coded dependencies.

- [x] **Step 1: Write failing parser/evaluator tests**
  Pin precedence and parentheses; reject unknown names, invalid syntax, division by zero, and arbitrary function/code text. Assert `10100` with T1=2000 and L1=1754 calculates frame qty 5.754 m' and two-leaf hinge qty 6 pcs; assert `10200` calculates the glass area 3.508 m² and two-leaf hinge qty 2 pcs; assert dependency cycles fail.

  ```ts
  it("calculates model 10100 from named dimensions", () => {
    const result = evaluateModel(doorCatalog.get(10100)!, {
      T1: 2000, L1: 1754, daunPintu: 2,
    });
    expect(result.items.find((item) => item.code === 10101)?.quantity).toBe(5.754);
    expect(result.items.find((item) => item.code === 10105)?.quantity).toBe(6);
  });
  ```
- [x] **Step 2: Run focused tests and verify expected failures**
  Run: `npm test -- src/domain/formulas/parser.test.ts src/domain/formulas/calculateModel.test.ts`
  Expected: missing implementation failures, not test-runner errors.
- [x] **Step 3: Implement tokenizer, precedence parser, and evaluator**
  Implement only number, identifier, unary sign, +, -, *, /, and grouping parentheses. Reject all other token forms.
- [x] **Step 4: Extract workbook formulas into stable model/item data**
  Read the workbook in an import script and write a deterministic catalog seed. Map master coordinates C2:H2/I2:J2 to named dimensions/counts, convert L-cell dependencies to stable material-code tokens (including the source's explicit cross-model refs), preserve source cells, units, source codes and formula expressions. Mark formula-less rows incomplete and omit placeholder dash items. For model 12100 kusen, use the confirmed prototype formula pattern mapped to the model inputs; retain source-code provenance when reconciling the 34200 item-code sequence.
- [x] **Step 5: Test source-derived model records and calculation outputs**
  Include an independent fixture from the cached workbook values for 10100, 10200, and 12100, plus a formula-less model/item case. Formula-less cases must return an incomplete error and no fake zero quantity.
- [x] **Step 6: Run focused formula/catalog tests**
  Run: `npm test -- src/domain/formulas src/domain/catalog/doorCatalog.test.ts`
  Expected: all pass, including formula cycle, missing input, and source parity checks.

### Task 3: Add Supabase schema, authentication, versioning, and RLS

**Files:**
- Create: `src/integrations/supabase/client.ts`, `src/integrations/supabase/repository.ts`
- Create: `src/auth/AuthProvider.tsx`, `src/auth/SignInPage.tsx`, `src/auth/ProtectedRoute.tsx`
- Create: `supabase/config.toml`, `supabase/migrations/001_initial_schema.sql`, `supabase/migrations/002_rls_policies.sql`, `supabase/seed.sql`, `supabase/tests/rls_policies.test.sql`
- Create: `.env.example`, `src/integrations/supabase/repository.test.ts`

**Interfaces:**
- Repository methods: `listModels(): Promise<DoorModel[]>`, `saveProject(input: ProjectInput): Promise<Project>`, `loadProject(id: string): Promise<Project | null>`, `saveFormulaChange(change: FormulaChange): Promise<void>`.
- Initial tables: profiles, catalog_admins, door_models, materials, model_materials, formula_versions, projects, project_model_lines, project_material_prices.
- Each project row owns `user_id`; formulas/catalog are writable only by a row in `catalog_admins` and readable to authenticated users. Add the first admin once through trusted Supabase SQL after creating the owner's Auth account; never grant admin to arbitrary public signups.

- [x] **Step 1: Write failing repository contract tests**
  Assert that repository methods scope project calls to the current authenticated user and preserve stable model/material IDs.

  ```ts
  it("does not return a project owned by another user", async () => {
    await asUser(ownerA, () => repository.saveProject(projectInput));
    const result = await asUser(ownerB, () => repository.loadProject(savedProjectId));
    expect(result).toBeNull();
  });
  ```
- [x] **Step 2: Run repository tests to confirm they fail without the repository**
  Run: `npm test -- src/integrations/supabase/repository.test.ts`
  Expected: module-not-found failure.
- [x] **Step 3: Add database migrations and RLS policies**
  Create foreign keys, unique model/material codes, versioned formula records, nonnegative numeric constraints where valid, and RLS policies that isolate project data and protect catalog writes.
- [x] **Step 4: Add Auth and Supabase repository client**
  Read only `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` from environment; protect application routes; never include a secret key in client code.
- [x] **Step 5: Seed the source-derived catalog through trusted migration/seed data**
  Keep source provenance and formula versions; apply the confirmed model 12100 correction.
- [ ] **Step 6: Verify repository tests, migration application, and RLS behavior**
  Run: `npm test -- src/integrations/supabase/repository.test.ts`
  Run: `supabase db reset`
  Run: `supabase test db`
  Expected: migrations and seed apply; separate authenticated users cannot read/write each other's projects; non-admin catalog/formula writes are denied.

### Task 4: Implement projects, calculator, formula master, and material recap

**Files:**
- Create: `src/features/projects/ProjectsPage.tsx`, `src/features/projects/projectService.ts`, `src/features/projects/projectService.test.ts`
- Create: `src/features/calculator/CalculatorPage.tsx`, `src/features/calculator/ModelLineEditor.tsx`, `src/features/calculator/MaterialResults.tsx`
- Create: `src/features/formula-master/FormulaMasterPage.tsx`, `src/features/formula-master/FormulaEditor.tsx`, `src/features/formula-master/FormulaMasterPage.test.tsx`
- Create: `src/features/recap/MaterialRecap.tsx`, `src/features/recap/aggregateMaterials.ts`, `src/features/recap/aggregateMaterials.test.ts`
- Modify: `src/app/features.ts`, `src/app/routes.tsx`, `src/app/DashboardPage.tsx`

**Interfaces:**
- `ProjectModelLineInput = { id?: string; modelCode: number; inputs: InputVariables; count: number }`.
- `ProjectInput = { id?: string; name: string; lines: ProjectModelLineInput[]; prices: Record<number, number> }`.
- `aggregateMaterials(lines: { materials: { materialCode: number; name: string; unit: string; quantity: number }[]; modelCount: number }[], prices: Record<number, number>): { materialCode: number; name: string; unit: string; quantity: number; unitPrice: number; subtotal: number }[]`.
- `FormulaMasterPage` edits an expression for one model/material at a time, previews against sample inputs, and saves a new formula version only after validation succeeds.

- [x] **Step 1: Write failing project aggregation, editor, and app-flow tests**
  Assert two model lines with shared material code+unit aggregate quantities before price multiplication; same-name items with different units remain separate; a 10100 line count 2 at price 50,000 yields 11.508 m' and subtotal 575,400; invalid expressions are not saved; formula version changes do not rewrite already-saved results; incomplete formulas show an incomplete status. Add an integrated test with a memory repository: a signed-in user opens a project, adds a 10100 line, sees 5.754 m' frame per unit, sets a price, and sees the subtotal/grand total update.

  ```ts
  it("aggregates matching material code and unit before pricing", () => {
    const frame = { materialCode: 10101, name: "kusen", unit: "m'", quantity: 5.754 };
    const rows = aggregateMaterials([
      { materials: [frame], modelCount: 2 },
      { materials: [frame], modelCount: 1 },
    ], { 10101: 50_000 });
    expect(rows.find((row) => row.materialCode === 10101)).toMatchObject({
      quantity: 17.262, unitPrice: 50_000, subtotal: 863_100,
    });
  });
  ```
- [x] **Step 2: Run tests and verify the expected missing-feature failures**
  Run: `npm test -- src/features/projects/projectService.test.ts src/features/recap/aggregateMaterials.test.ts src/features/formula-master/FormulaMasterPage.test.tsx src/app/App.integration.test.tsx`
  Expected: failures because services/components do not exist.
- [x] **Step 3: Implement project/model-line persistence and calculator UI**
  Provide add/remove model rows, model selector, only-required inputs, unit count, live material qty results, save/open project, and a visible incomplete state for models lacking formulas.
- [x] **Step 4: Implement formula master**
  Provide model and item selectors, expression input, list of available named variables/material references, parser feedback, sample-input preview, and save/history UI.
- [x] **Step 5: Implement rekap and price editing**
  Aggregate by stable material code and unit, retain price per project, calculate line subtotals and total, and display missing/invalid prices distinctly.
- [x] **Step 6: Connect routes to the feature registry**
  Replace the placeholder route components for Kalkulator Pintu, Proyek, and Master Rumus. Verify new feature registration adds a dashboard link and route from one definition.
- [x] **Step 7: Run focused UI/domain tests and production build**
  Run: `npm test`
  Run: `npm run build`
  Expected: all tests pass; app builds with no leaked server secrets or type errors.

### Task 5: Finish Vercel setup and acceptance

**Files:**
- Create: `README.md`, `vercel.json` if SPA route fallback requires it
- Modify: `.env.example`, `package.json`

**Interfaces:**
- Deployment relies on `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`; Supabase migrations and seed apply separately via Supabase CLI.
- README documents local setup, database reset/seed, test/build commands, Vercel environment variables, and the Free-plan inactivity limitation.

- [x] **Step 1: Add Vercel SPA configuration and setup documentation**
  Configure fallback routing only if direct navigation to nested routes fails in preview; document Supabase project setup and environment variable names.
- [ ] **Step 2: Run complete verification**
  Run: `npm test`
  Run: `npm run build`
  Run: `supabase db reset`
  Run: `supabase test db`
  Expected: test suite and production build pass; RLS and known formula cases behave as specified. Remote deploy is reported as pending until account credentials and project links are configured.

