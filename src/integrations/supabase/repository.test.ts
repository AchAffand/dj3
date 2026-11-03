import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseRepository } from "./repository";

function makeClient(
  rows: unknown = [],
  single: unknown = null,
) {
  const resolved = (data: unknown) => Promise.resolve({ data, error: null });
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    order: vi.fn(() => resolved(rows)),
    maybeSingle: vi.fn(() => resolved(single)),
  };
  const client = {
    from: vi.fn(() => query),
    rpc: vi.fn(() => Promise.resolve({ data: "project-1", error: null })),
    auth: { getUser: vi.fn(() => Promise.resolve({ data: { user: { id: "user-1" } }, error: null })) },
  } as unknown as SupabaseClient;
  return { client, query };
}

describe("Supabase repository", () => {
  it("maps catalog rows without losing stable material codes or formulas", async () => {
    const { client } = makeClient([{
      code: 10100,
      group_code: 10000,
      name: "Model 10100",
      input_variables: ["T1", "L1"],
      status: "ready",
      model_materials: [{
        material_code: 10101,
        current_expression: "(T1*2+L1)/1000",
        source_cell: "L2",
        source_formula: "=(C2*2+D2)/1000",
        materials: { name: "kusen", unit: "m'" },
      }],
    }]);
    const repository = createSupabaseRepository(client);
    const models = await repository.listModels();
    expect(models[0]).toMatchObject({ code: 10100, groupCode: 10000, status: "ready" });
    expect(models[0].materials[0]).toMatchObject({
      code: 10101,
      name: "kusen",
      unit: "m'",
      expression: "(T1*2+L1)/1000",
      sourceCell: "L2",
    });
  });

  it("loads expanded product groups and retains original mistyped item codes", async () => {
    const { client } = makeClient([{
      code: 34200,
      group_code: 30000,
      name: "Model 34200",
      input_variables: [],
      status: "incomplete",
      model_materials: [{
        material_code: 34204,
        current_expression: null,
        formula_version: 1,
        source_cell: "L845",
        source_formula: null,
        source_cached_quantity: null,
        materials: { name: "coak", unit: "pcs", source_code: 34104 },
      }],
    }]);
    const [model] = await createSupabaseRepository(client).listModels();
    expect(model).toMatchObject({ code: 34200, groupCode: 30000 });
    expect(model.materials[0]).toMatchObject({ code: 34204, sourceCode: 34104, name: "coak" });
  });

  it("derives readiness from current formulas instead of the imported status", async () => {
    const { client } = makeClient([{
      code: 30100,
      group_code: 30000,
      name: "Model 30100",
      input_variables: ["T1", "L1"],
      status: "incomplete",
      model_materials: [
        { material_code: 30101, current_expression: "T1/1000", formula_version: 2, source_cell: "L1", materials: { name: "kusen", unit: "m'" } },
        { material_code: 30102, current_expression: "L1/1000", formula_version: 1, source_cell: "L2", materials: { name: "tapin", unit: "m'" } },
      ],
    }]);
    const [model] = await createSupabaseRepository(client).listModels();
    expect(model.status).toBe("ready");
  });

  it("derives visible inputs from the current formula after an admin edit", async () => {
    const { client } = makeClient([{
      code: 10100,
      group_code: 10000,
      name: "Model 10100",
      input_variables: ["T1", "L1"],
      status: "ready",
      model_materials: [{
        material_code: 10101,
        current_expression: "T2/1000",
        formula_version: 2,
        source_cell: "L2",
        source_formula: "=(C2*2+D2)/1000",
        source_cached_quantity: 0.5,
        materials: { name: "kusen", unit: "m'" },
      }],
    }]);
    const models = await createSupabaseRepository(client).listModels();
    expect(models[0].inputs).toEqual(["T2"]);
  });

  it("treats an inaccessible project as absent after the owner policy filters it", async () => {
    const { client, query } = makeClient([], null);
    const repository = createSupabaseRepository(client);
    await expect(repository.loadProject("foreign-project")).resolves.toBeNull();
    expect(client.from).toHaveBeenCalledWith("projects");
    expect(query.eq).toHaveBeenCalledWith("id", "foreign-project");
    expect(query.maybeSingle).toHaveBeenCalledOnce();
  });

  it("includes the creator profile in the saved project list", async () => {
    const projectRows = [{
      id: "project-1",
      name: "Rumah Contoh",
      user_id: "user-1",
      updated_at: "2026-10-01T00:00:00.000Z",
      project_model_lines: [{ model_code: 10100, model_count: 2 }],
    }];
    const profileRows = [{ id: "user-1", display_name: "Admin DJ3", email: "admin@dj3.local" }];
    const projectQuery = {
      select: vi.fn(() => projectQuery),
      order: vi.fn(() => Promise.resolve({ data: projectRows, error: null })),
    };
    const profileQuery = {
      select: vi.fn(() => profileQuery),
      in: vi.fn(() => Promise.resolve({ data: profileRows, error: null })),
    };
    const client = {
      from: vi.fn((table: string) => table === "profiles" ? profileQuery : projectQuery),
      rpc: vi.fn(() => Promise.resolve({ data: "project-1", error: null })),
      auth: { getUser: vi.fn(() => Promise.resolve({ data: { user: { id: "user-1" } }, error: null })) },
    } as unknown as SupabaseClient;
    const projects = await createSupabaseRepository(client).listProjects();
    expect(projects[0]).toMatchObject({ id: "project-1", createdBy: "Admin DJ3", modelCount: 1 });
    expect(client.from).toHaveBeenNthCalledWith(1, "projects");
    expect(client.from).toHaveBeenNthCalledWith(2, "profiles");
    expect(profileQuery.in).toHaveBeenCalledWith("id", ["user-1"]);
  });

  it("saves stable project model and material codes through the atomic database function", async () => {
    const { client } = makeClient();
    const repository = createSupabaseRepository(client);
    await repository.saveProject({
      name: "Rumah contoh",
      location: "Bandung",
      floor: "2",
      lines: [{
        modelCode: 10100,
        inputs: { T1: 2000, L1: 1754 },
        count: 1,
        formulaSnapshot: [{ materialCode: 10101, expression: "(T1*2+L1)/1000", version: 1 }],
        resultSnapshot: { items: [{ materialCode: 10101, name: "kusen", quantity: 5.754, unit: "m'" }], errors: [] },
      }],
      prices: [{ materialCode: 10101, unitPrice: 50000, name: "kusen", unit: "m'" }],
    });
    expect(client.rpc).toHaveBeenCalledWith("save_project_with_budget_prices", expect.objectContaining({
      p_name: "Rumah contoh",
      p_location: "Bandung",
      p_floor: "2",
      p_lines: [expect.objectContaining({ model_code: 10100 })],
      p_prices: [expect.objectContaining({ material_code: 10101 })],
      p_price_snapshots: [],
      p_project_id: null,
    }));
  });

  it("loads the saved project location and floor fields", async () => {
    const { client } = makeClient([], {
      id: "project-1",
      name: "Rumah contoh",
      location: "Bandung",
      floor: "2",
      project_model_lines: [],
      project_material_prices: [],
    });
    const project = await createSupabaseRepository(client).loadProject("project-1");
    expect(project).toMatchObject({ name: "Rumah contoh", location: "Bandung", floor: "2" });
  });

  it("records formula changes through the versioning function", async () => {
    const { client } = makeClient();
    const repository = createSupabaseRepository(client);
    await repository.saveFormulaChange({ materialCode: 10101, expression: "T1/1000" });
    expect(client.rpc).toHaveBeenCalledWith("save_formula_change", {
      p_material_code: 10101,
      p_expression: "T1/1000",
    });
  });

  it("uses the protected admin-membership row to identify formula editors", async () => {
    const { client, query } = makeClient([], null);
    const repository = createSupabaseRepository(client);
    await expect(repository.isCatalogAdmin()).resolves.toBe(false);
    expect(client.from).toHaveBeenCalledWith("catalog_admins");
    expect(query.select).toHaveBeenCalledWith("user_id");
    expect(query.eq).toHaveBeenCalledWith("user_id", "user-1");
  });
});
