import type { DoorModel, InputVariables } from "../../domain/catalog/types";
import { calculateModel } from "../../domain/formulas/calculateModel";
import { parseFormula } from "../../domain/formulas/parser";
import type { ExpressionNode } from "../../domain/formulas/ast";
import type { Project, ProjectFormulaSnapshot, ProjectInput, ProjectModelLineInput, ProjectPriceInput } from "../../domain/projects/types";
import { aggregateMaterials, type MaterialRecapRow } from "../recap/aggregateMaterials";

export type ProjectLineDraft = {
  id?: string;
  modelCode: number;
  inputs: InputVariables;
  count: number;
  formulaSnapshot?: ProjectFormulaSnapshot[];
  resultSnapshot?: ProjectModelLineInput["resultSnapshot"];
  priceCatalogId?: string | null;
  priceVariantId?: string | null;
};

export type ProjectDraft = {
  id?: string;
  name: string;
  location?: string;
  floor?: string;
  lines: ProjectLineDraft[];
  prices: Readonly<Record<string, number | null | undefined>>;
  recap?: readonly MaterialRecapRow[];
};

type ProjectRepository = {
  saveProject(input: ProjectInput): Promise<Project>;
  loadProject(id: string): Promise<Project | null>;
};

export type ProjectSaveResult = {
  project: Project;
  recap: MaterialRecapRow[];
  total: number;
  missingPriceCount: number;
};

function modelSnapshot(
  model: DoorModel,
  inputs: InputVariables,
  catalog: ReadonlyMap<number, DoorModel>,
): ProjectModelLineInput["resultSnapshot"] {
  const result = calculateModel(model, inputs, catalog);
  return {
    items: result.items.map((item) => ({
      materialCode: item.code,
      name: item.name,
      unit: item.unit,
      quantity: item.quantity,
    })),
    errors: result.errors,
  };
}

function quantityReferences(node: ExpressionNode): number[] {
  if (node.type === "quantity") return [node.materialCode];
  if (node.type === "binary") return [...quantityReferences(node.left), ...quantityReferences(node.right)];
  if (node.type === "unary") return quantityReferences(node.operand);
  return [];
}

function snapshotFormulas(model: DoorModel, catalog: ReadonlyMap<number, DoorModel>): ProjectFormulaSnapshot[] {
  const allMaterials = new Map(
    [...catalog.values()].flatMap((catalogModel) => catalogModel.materials.map((material) => [material.code, material] as const)),
  );
  for (const material of model.materials) allMaterials.set(material.code, material);

  const snapshot = new Map<number, ProjectFormulaSnapshot>();
  function visit(materialCode: number): void {
    if (snapshot.has(materialCode)) return;
    const material = allMaterials.get(materialCode);
    if (!material) return;
    snapshot.set(materialCode, {
      materialCode,
      expression: material.expression,
      version: material.formulaVersion ?? 1,
    });
    if (!material.expression) return;
    try {
      for (const reference of quantityReferences(parseFormula(material.expression))) visit(reference);
    } catch {
      // Preserve an invalid formula in the snapshot; the line calculation records the validation error.
    }
  }

  for (const material of model.materials) visit(material.code);
  return [...snapshot.values()];
}

export function createProjectService(
  repository: ProjectRepository,
  catalog: ReadonlyMap<number, DoorModel>,
) {
  return {
    async loadProject(id: string): Promise<Project | null> {
      return repository.loadProject(id);
    },

    async saveProject(draft: ProjectDraft): Promise<ProjectSaveResult> {
      if (!draft.name.trim()) throw new Error("Nama proyek harus diisi");
      if (!draft.lines.length) throw new Error("Tambahkan minimal satu model ke proyek");

      const lines: ProjectModelLineInput[] = draft.lines.map((line) => {
        const model = catalog.get(line.modelCode);
        if (!model) throw new Error(`Model ${line.modelCode} tidak ditemukan`);
        if (!Number.isInteger(line.count) || line.count < 1) throw new Error("Jumlah model minimal 1 unit");

        const hasSavedSnapshot = Array.isArray(line.formulaSnapshot) && Array.isArray(line.resultSnapshot?.items);
        return {
          id: line.id,
          modelCode: line.modelCode,
          inputs: line.inputs,
          count: line.count,
          formulaSnapshot: hasSavedSnapshot ? line.formulaSnapshot! : snapshotFormulas(model, catalog),
          resultSnapshot: hasSavedSnapshot ? line.resultSnapshot! : modelSnapshot(model, line.inputs, catalog),
          priceCatalogId: line.priceCatalogId ?? null,
          priceVariantId: line.priceVariantId ?? null,
        };
      });

      const recap = draft.recap ? [...draft.recap] : aggregateMaterials(
        lines.map((line) => ({ materials: line.resultSnapshot.items, modelCount: line.count })),
        draft.prices,
      );
      const prices: ProjectPriceInput[] = recap.map((row) => ({
        materialCode: row.materialCode,
        name: row.name,
        unit: row.unit,
        unitPrice: row.unitPrice,
        catalogId: row.catalogId,
        variantId: row.variantId,
        priceVersion: row.priceVersion,
        expressionSnapshot: row.expressionSnapshot,
        componentId: row.componentId,
      }));
      const input: ProjectInput = {
        id: draft.id,
        name: draft.name.trim(),
        location: draft.location?.trim() ?? "",
        floor: draft.floor?.trim() ?? "",
        lines,
        prices,
      };
      const project = await repository.saveProject(input);
      return {
        project,
        recap,
        total: recap.reduce((sum, row) => sum + (row.subtotal ?? 0), 0),
        missingPriceCount: recap.filter((row) => row.unitPrice === null).length,
      };
    },
  };
}
