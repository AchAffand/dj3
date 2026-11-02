# Master Rumus: Create Models and Import Window Formulas Plan

**Goal:** Let catalog administrators add models and materials in Master Rumus, and add the verified window formulas from `Rumus_Jendela.xlsx` using the existing model/material code convention.

**Architecture:** Keep the current Formula Master page and repository pattern. Add admin-only transactional Supabase functions for model/material creation, and a migration that inserts the workbook's window catalog as normalized calculation expressions. Model codes stay on `xx00`; each model's material codes begin at `xx01`, following the existing calculator.

**Tech Stack:** React, TypeScript, Supabase/Postgres migrations, existing formula parser and calculator, Python/openpyxl for read-only workbook extraction and SQL generation.

## Files and responsibilities

- `supabase/migrations/009_formula_master_create.sql`: admin-only database functions to add a model and add one material with its initial formula version atomically.
- `supabase/migrations/010_window_formula_catalog.sql`: insert window models, materials, and formulas extracted from the workbook; preserve existing records on rerun.
- `scripts/generate-window-formula-migration.py`: repeatable source-to-migration generator; reads `Rumus` and records source text.
- `src/integrations/supabase/repository.ts`: repository methods and RPC calls for model/material creation.
- `src/features/formula-master/FormulaMasterPage.tsx`: admin controls and forms for adding a model or a material to the selected model; validation and refresh use the current catalog flow.
- `src/styles/*`: only the CSS file containing Formula Master styles, for modal/form layout.

## Tasks

1. Add database functions with admin checks, code/group validation, uniqueness checks, material position allocation, formula version 1 history, and transaction-safe writes.
2. Add typed repository methods for creating models and materials.
3. Add admin-only model and material creation forms. Suggest the next valid model/material code, allow editing the suggestion, validate formulas through the existing parser, and refresh the catalog after success.
4. Generate the window data migration from `Rumus_Jendela.xlsx`: 40 models represented in the sheet, omit model codes without any formula rows, offset each workbook row code by one to follow current material numbering, infer the dimension inputs from formulas, and normalize mm lengths/areas to the existing output units.
5. Run the production build and inspect the generated SQL's model/material counts, code uniqueness, and formula parse compatibility. Do not run automated tests unless the user asks.

## Review focus

- A model code must remain a multiple of 100 and map to its 10,000-series group.
- Material codes must be globally unique and match the existing convention (`model xx00`, first material `xx01`).
- A material and its initial formula version must be created together or not at all.
- References such as `kusen`, `jendela`, and `polis` must resolve to the correct material code within that model.
- Length, area, and count formulas must retain their units and conversion factors.

