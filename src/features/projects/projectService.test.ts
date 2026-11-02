import { describe, expect, it } from "vitest";
import { doorCatalog } from "../../domain/catalog/doorCatalog";
import type { Project, ProjectInput } from "../../domain/projects/types";
import { createProjectService } from "./projectService";

function memoryRepository() {
  const records = new Map<string, Project>();
  return {
    async saveProject(input: ProjectInput): Promise<Project> {
      const project = { ...input, id: input.id ?? "project-1" };
      records.set(project.id, structuredClone(project));
      return structuredClone(project);
    },
    async loadProject(id: string): Promise<Project | null> {
      const project = records.get(id);
      return project ? structuredClone(project) : null;
    },
  };
}

describe("project service", () => {
  it("opens, calculates, prices, saves, and reloads model 10100", async () => {
    const repository = memoryRepository();
    const service = createProjectService(repository, doorCatalog);
    const saved = await service.saveProject({
      name: "Rumah contoh",
      location: "Bandung",
      floor: "2",
      lines: [{ modelCode: 10100, inputs: { T1: 2000, L1: 1754, daunPintu: 2 }, count: 2 }],
      prices: { "manual:10101": 50000 },
    });
    expect(saved.recap.find((row) => row.materialCode === 10101)).toMatchObject({
      quantity: 11.508,
      unitPrice: 50000,
      subtotal: 575400,
    });
    expect(saved.total).toBe(575400);
    expect(saved.project).toMatchObject({ location: "Bandung", floor: "2" });
    const loaded = await service.loadProject(saved.project.id);
    expect(loaded?.lines[0].resultSnapshot.items.find((item) => item.materialCode === 10101)?.quantity).toBe(5.754);
  });

  it("preserves formula and result snapshots when a saved project is reopened", async () => {
    const repository = memoryRepository();
    const original = doorCatalog.get(10100)!;
    const service = createProjectService(repository, doorCatalog);
    const saved = await service.saveProject({
      name: "Versi awal",
      lines: [{ modelCode: 10100, inputs: { T1: 2000, L1: 1754 }, count: 1 }],
      prices: { "manual:10101": 1 },
    });
    const loaded = await service.loadProject(saved.project.id);
    const editedMaterials = original.materials.map((item) => item.code === 10101
      ? { ...item, expression: "(T1+L1)/1000", formulaVersion: 2 }
      : item);
    const changedCatalog = new Map(doorCatalog);
    changedCatalog.set(10100, { ...original, materials: editedMaterials });
    const afterFormulaChange = createProjectService(repository, changedCatalog);
    const resaved = await afterFormulaChange.saveProject({
      ...loaded!,
      prices: { "manual:10101": 1 },
    });
    expect(resaved.project.lines[0].formulaSnapshot[0].version).toBe(1);
    expect(resaved.project.lines[0].resultSnapshot.items.find((item) => item.materialCode === 10101)?.quantity).toBe(5.754);
    expect(resaved.recap.find((row) => row.materialCode === 10101)?.quantity).toBe(5.754);
  });

  it("snapshots formulas referenced from another model", async () => {
    const repository = memoryRepository();
    const service = createProjectService(repository, doorCatalog);
    const saved = await service.saveProject({
      name: "Model dengan dependensi lintas kode",
      lines: [{ modelCode: 10500, inputs: { T1: 2000, L1: 1754, daunPintu: 2 }, count: 1 }],
      prices: {},
    });
    const dependencies = saved.project.lines[0].formulaSnapshot;
    expect(dependencies.find((item) => item.materialCode === 10101)).toMatchObject({
      expression: "(T1*2+L1)/1000",
      version: 1,
    });
  });
});
