import type { SupabaseClient } from "@supabase/supabase-js";
import type { DoorModel, InputVariableName } from "../../domain/catalog/types";
import { parseFormula } from "../../domain/formulas/parser";
import type { ExpressionNode } from "../../domain/formulas/ast";
import type {
  FormulaChange,
  FormulaVersionRecord,
  Project,
  ProjectInput,
  ProjectSummary,
} from "../../domain/projects/types";
import type { BudgetCatalog, BudgetCatalogDetail, BudgetEstimate, BudgetVariant, BudgetComponent, BudgetRule, BudgetMaterialMapping } from "../../domain/budgets/types";

type ModelRow = {
  code: number;
  group_code: number;
  name: string;
  input_variables: unknown;
  status: "ready" | "incomplete";
  is_active: boolean;
  model_groups?: { group_name: string } | { group_name: string }[] | null;
  model_materials: {
    material_code: number;
    current_expression: string | null;
    formula_version: number;
    source_cell: string;
    source_formula: string | null;
    source_cached_quantity: number | null;
      materials: { name: string; unit: string; source_code?: number | null } | { name: string; unit: string; source_code?: number | null }[] | null;
  }[];
};

function mappedModel(row: ModelRow): DoorModel {
  const group = Array.isArray(row.model_groups) ? row.model_groups[0] : row.model_groups;
  const materials = (row.model_materials ?? []).flatMap((item) => {
    const related = Array.isArray(item.materials) ? item.materials[0] : item.materials;
    if (!related) return [];
    return [{
      code: item.material_code,
      sourceCode: related.source_code ?? item.material_code,
      name: related.name,
      unit: related.unit,
      expression: item.current_expression,
      sourceCell: item.source_cell,
      sourceFormula: item.source_formula,
      sourceCachedQuantity: item.source_cached_quantity,
      formulaVersion: item.formula_version,
    }];
  });
  return {
    code: row.code,
    groupCode: row.group_code,
    groupName: group?.group_name,
    name: row.name,
    inputs: Array.isArray(row.input_variables)
      ? row.input_variables.filter((item): item is InputVariableName => typeof item === "string")
      : [],
    status: materials.length > 0 && materials.every((material) => material.expression !== null)
      ? "ready"
      : "incomplete",
    active: row.is_active !== false,
    materials,
  };
}

function collectVariables(node: ExpressionNode, variables: Set<string>, references: Set<number>): void {
  if (node.type === "variable") variables.add(node.name);
  else if (node.type === "quantity") references.add(node.materialCode);
  else if (node.type === "unary") collectVariables(node.operand, variables, references);
  else if (node.type === "binary") {
    collectVariables(node.left, variables, references);
    collectVariables(node.right, variables, references);
  }
}

function deriveInputs(model: DoorModel, materials: ReadonlyMap<number, DoorModel["materials"][number]>): InputVariableName[] {
  const variables = new Set<string>();
  const visited = new Set<number>();
  let parsedExpressionCount = 0;
  let parseFailed = false;

  function visit(materialCode: number): void {
    if (visited.has(materialCode)) return;
    visited.add(materialCode);
    const material = materials.get(materialCode);
    if (!material?.expression) return;
    try {
      const references = new Set<number>();
      collectVariables(parseFormula(material.expression), variables, references);
      parsedExpressionCount += 1;
      for (const reference of references) visit(reference);
    } catch {
      parseFailed = true;
    }
  }

  for (const material of model.materials) visit(material.code);
  const derived = [...variables];
  return parseFailed || parsedExpressionCount === 0 ? [...new Set([...model.inputs, ...derived])] : derived;
}

function throwIfError(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

function mapProject(row: Record<string, unknown>): Project {
  const lines = (row.project_model_lines as Record<string, unknown>[] | null) ?? [];
  const prices = (row.project_material_prices as Record<string, unknown>[] | null) ?? [];
  const priceSnapshots = (row.project_line_price_snapshots as Record<string, unknown>[] | null) ?? [];
  return {
    id: String(row.id),
    name: String(row.name),
    location: typeof row.location === "string" ? row.location : "",
    floor: typeof row.floor === "string" ? row.floor : "",
    createdAt: typeof row.created_at === "string" ? row.created_at : undefined,
    updatedAt: typeof row.updated_at === "string" ? row.updated_at : undefined,
    lines: lines.map((line) => ({
      id: String(line.id),
      modelCode: Number(line.model_code),
      inputs: (line.inputs ?? {}) as Project["lines"][number]["inputs"],
      count: Number(line.model_count),
      formulaSnapshot: (line.formula_snapshot ?? []) as Project["lines"][number]["formulaSnapshot"],
      resultSnapshot: (line.result_snapshot ?? { items: [], errors: [] }) as Project["lines"][number]["resultSnapshot"],
      priceCatalogId: typeof line.price_catalog_id === "string" ? line.price_catalog_id : null,
      priceVariantId: typeof line.price_variant_id === "string" ? line.price_variant_id : null,
    })),
    prices: [
      ...prices.map((price) => ({
      materialCode: Number(price.material_code),
      name: String(price.name_snapshot),
      unit: String(price.unit_snapshot),
      unitPrice: typeof price.unit_price === "number" ? price.unit_price : null,
      catalogId: null,
      variantId: null,
      })),
      ...priceSnapshots.map((price) => ({
      materialCode: Number(price.material_code), name: String(price.name_snapshot), unit: String(price.unit_snapshot),
      unitPrice: typeof price.unit_price === "number" ? price.unit_price : null,
      catalogId: String(price.catalog_id), variantId: String(price.variant_id),
      priceVersion: Number(price.price_version ?? 0), expressionSnapshot: typeof price.expression_snapshot === "string" ? price.expression_snapshot : null,
      componentId: typeof price.component_id === "string" ? price.component_id : null,
      })),
    ],
  };
}

function mapBudgetCatalog(row: Record<string, unknown>): BudgetCatalog {
  return { id: String(row.id), slug: String(row.slug), label: String(row.label), position: Number(row.position), active: Boolean(row.active) };
}

function mapBudgetDetail(catalog: BudgetCatalog, rows: Record<string, unknown>[]): BudgetCatalogDetail {
  const components: BudgetComponent[] = rows.map((row) => {
    const priceRows = (row.budget_prices as Record<string, unknown>[] | null) ?? [];
    const prices: BudgetComponent["prices"] = {};
    for (const price of priceRows) {
      const variantRow = Array.isArray(price.budget_variants) ? price.budget_variants[0] : price.budget_variants;
      if (!variantRow) continue;
      const variant = variantRow as Record<string, unknown>;
      prices[String(variant.variant_key)] = {
        amount: typeof price.amount === "number" ? price.amount : null,
        expression: typeof price.expression === "string" ? price.expression : null,
        version: Number(price.version ?? 1),
      };
    }
    return {
      id: String(row.id), key: String(row.component_key), sourceColumn: String(row.source_column),
      label: String(row.label), unit: String(row.unit ?? ""), category: String(row.category),
      groupLabel: String(row.group_label ?? ""), position: Number(row.position), prices,
    };
  });
  return { catalog, components, variants: [], rules: [], mappings: [] };
}

export function createSupabaseRepository(client: SupabaseClient) {
  return {
    async createFormulaModel(input: { code: number; name: string; groupCode: number; groupName: string; inputVariables?: InputVariableName[] }): Promise<number> {
      const { data, error } = await client.rpc("create_formula_model", {
        p_code: input.code,
        p_name: input.name,
        p_input_variables: input.inputVariables ?? [],
        p_group_code: input.groupCode,
        p_group_name: input.groupName,
      });
      throwIfError(error);
      return Number(data);
    },

    async createFormulaMaterial(input: { modelCode: number; materialCode: number; name: string; unit: string; expression?: string | null; sourceFormula?: string | null }): Promise<number> {
      const { data, error } = await client.rpc("create_formula_material", {
        p_model_code: input.modelCode,
        p_material_code: input.materialCode,
        p_name: input.name,
        p_unit: input.unit,
        p_expression: input.expression,
        p_source_formula: input.sourceFormula ?? null,
      });
      throwIfError(error);
      return Number(data);
    },

    async updateFormulaMaterialDetails(materialCode: number, name: string, unit: string): Promise<void> {
      const { error } = await client.from("materials").update({ name: name.trim(), unit: unit.trim() }).eq("code", materialCode);
      throwIfError(error);
    },

    async deleteFormulaMaterial(modelCode: number, materialCode: number): Promise<void> {
      const { error } = await client.rpc("delete_formula_material", { p_model_code: modelCode, p_material_code: materialCode });
      throwIfError(error);
    },

    async deleteFormulaModelPermanently(modelCode: number): Promise<void> {
      const { error } = await client.rpc("delete_formula_model_permanently", { p_model_code: modelCode });
      throwIfError(error);
    },

    async archiveFormulaModel(modelCode: number): Promise<void> {
      const { error } = await client.rpc("archive_formula_model", { p_model_code: modelCode });
      throwIfError(error);
    },

    async isCatalogAdmin(): Promise<boolean> {
      const { data, error } = await client
        .from("catalog_admins")
        .select("user_id")
        .eq("user_id", (await client.auth.getUser()).data.user?.id ?? "")
        .maybeSingle();
      throwIfError(error);
      return Boolean(data);
    },

    async listModels(): Promise<DoorModel[]> {
      const { data, error } = await client
        .from("door_models")
        .select("code,group_code,name,input_variables,status,is_active,model_groups(group_name),model_materials(material_code,current_expression,formula_version,source_cell,source_formula,source_cached_quantity,materials(name,unit,source_code))")
        .order("code", { ascending: true });
      throwIfError(error);
      const models = ((data ?? []) as unknown as ModelRow[]).map(mappedModel);
      const allMaterials = new Map(
        models.flatMap((model) => model.materials.map((material) => [material.code, material] as const)),
      );
      return models.map((model) => ({ ...model, inputs: deriveInputs(model, allMaterials) }));
    },

    async listProjects(): Promise<ProjectSummary[]> {
      const { data, error } = await client
        .from("projects")
        .select("id,name,user_id,created_at,updated_at,project_model_lines(model_code,model_count)")
        .order("updated_at", { ascending: false });
      throwIfError(error);
      const rows = (data ?? []) as unknown as Record<string, unknown>[];
      const userIds = [...new Set(rows.map((row) => String(row.user_id ?? "")).filter(Boolean))];
      const profilesById = new Map<string, string>();
      if (userIds.length) {
        const { data: profiles, error: profilesError } = await client
          .from("profiles")
          .select("id,display_name,email")
          .in("id", userIds);
        throwIfError(profilesError);
        for (const profile of (profiles ?? []) as unknown as Record<string, unknown>[]) {
          const id = String(profile.id);
          const label = typeof profile.display_name === "string" && profile.display_name.trim()
            ? profile.display_name.trim()
            : typeof profile.email === "string" && profile.email.trim()
              ? profile.email.trim()
              : "Pengguna";
          profilesById.set(id, label);
        }
      }
      return rows.map((row) => ({
        id: String(row.id),
        name: String(row.name),
        createdAt: typeof row.created_at === "string" ? row.created_at : "",
        updatedAt: String(row.updated_at),
        modelCount: ((row.project_model_lines as unknown[]) ?? []).length,
        createdBy: profilesById.get(String(row.user_id ?? "")) ?? "Pengguna",
      }));
    },

    async deleteProject(id: string): Promise<void> {
      const { data, error } = await client.from("projects").delete().eq("id", id).select("id").maybeSingle();
      throwIfError(error);
      if (!data) throw new Error("Proyek tidak ditemukan atau tidak dapat dihapus.");
    },

    async loadProject(id: string): Promise<Project | null> {
      const { data, error } = await client
        .from("projects")
        .select("id,name,location,floor,created_at,updated_at,project_model_lines(id,model_code,inputs,model_count,formula_snapshot,result_snapshot,price_catalog_id,price_variant_id),project_material_prices(material_code,name_snapshot,unit_snapshot,unit_price),project_line_price_snapshots(material_code,catalog_id,variant_id,name_snapshot,unit_snapshot,unit_price,component_id,price_version,expression_snapshot)")
        .eq("id", id)
        .maybeSingle();
      throwIfError(error);
      return data ? mapProject(data as unknown as Record<string, unknown>) : null;
    },

    async saveProject(input: ProjectInput): Promise<Project> {
      const { data, error } = await client.rpc("save_project_with_budget_prices", {
        p_project_id: input.id ?? null,
        p_name: input.name,
        p_location: input.location ?? "",
        p_floor: input.floor ?? "",
        p_lines: input.lines.map((line) => ({
          id: line.id ?? null,
          model_code: line.modelCode,
          inputs: line.inputs,
          model_count: line.count,
          formula_snapshot: line.formulaSnapshot,
          result_snapshot: line.resultSnapshot,
          price_catalog_id: line.priceCatalogId ?? null,
          price_variant_id: line.priceVariantId ?? null,
        })),
        p_prices: [...new Map(input.prices.filter((price) => !price.catalogId).map((price) => [price.materialCode, price])).values()].map((price) => ({
          material_code: price.materialCode,
          name_snapshot: price.name,
          unit_snapshot: price.unit,
          unit_price: price.unitPrice,
        })),
        p_price_snapshots: [...new Map(input.prices.filter((price) => price.catalogId && price.variantId).map((price) => [`${price.materialCode}:${price.catalogId}:${price.variantId}:${price.componentId ?? "legacy"}`, price])).values()].map((price) => ({
          material_code: price.materialCode, catalog_id: price.catalogId, variant_id: price.variantId,
          name_snapshot: price.name, unit_snapshot: price.unit, unit_price: price.unitPrice,
          component_id: price.componentId ?? null, price_version: price.priceVersion ?? null, expression_snapshot: price.expressionSnapshot ?? null,
        })),
      });
      throwIfError(error);
      const id = typeof data === "string" ? data : input.id;
      if (!id) throw new Error("Supabase tidak mengembalikan ID proyek");
      return { ...input, id };
    },

    async saveFormulaChange(change: FormulaChange): Promise<void> {
      const { error } = await client.rpc("save_formula_change", {
        p_material_code: change.materialCode,
        p_expression: change.expression,
      });
      throwIfError(error);
    },

    async listFormulaVersions(materialCode: number): Promise<FormulaVersionRecord[]> {
      const { data, error } = await client
        .from("formula_versions")
        .select("id,material_code,version,expression,created_by,created_at")
        .eq("material_code", materialCode)
        .order("version", { ascending: false });
      throwIfError(error);
      return ((data ?? []) as unknown as Record<string, unknown>[]).map((row) => ({
        id: String(row.id),
        materialCode: Number(row.material_code),
        version: Number(row.version),
        expression: typeof row.expression === "string" ? row.expression : null,
        createdBy: typeof row.created_by === "string" ? row.created_by : null,
        createdAt: String(row.created_at),
      }));
    },

    async listBudgetCatalogs(): Promise<BudgetCatalog[]> {
      const { data, error } = await client.from("budget_catalogs").select("id,slug,label,position,active").eq("active", true).order("position");
      throwIfError(error);
      return ((data ?? []) as unknown as Record<string, unknown>[]).map(mapBudgetCatalog);
    },

    async createBudgetCatalog(label: string, slug: string): Promise<string> {
      const { data, error } = await client.rpc("create_budget_catalog", {
        p_label: label.trim(),
        p_slug: slug,
      });
      throwIfError(error);
      if (typeof data !== "string") throw new Error("Supabase tidak mengembalikan ID merek baru.");
      return data;
    },

    async archiveBudgetCatalogs(ids: string[]): Promise<void> {
      const uniqueIds = [...new Set(ids)].filter(Boolean);
      if (!uniqueIds.length) return;
      const { data, error } = await client
        .from("budget_catalogs")
        .update({ active: false, updated_at: new Date().toISOString() })
        .in("id", uniqueIds)
        .neq("slug", "hpm-inka-dacon")
        .select("id");
      throwIfError(error);
      if ((data ?? []).length !== uniqueIds.length) {
        throw new Error("Sebagian merek tidak dapat dihapus. Template HPM / INKA / DACON dilindungi.");
      }
    },

    async loadBudgetCatalog(slug: string): Promise<BudgetCatalogDetail | null> {
      const { data: catalogData, error: catalogError } = await client.from("budget_catalogs").select("id,slug,label,position,active").eq("slug", slug).eq("active", true).maybeSingle();
      throwIfError(catalogError);
      if (!catalogData) return null;
      const catalog = mapBudgetCatalog(catalogData as unknown as Record<string, unknown>);
      const [{ data: componentData, error: componentError }, { data: variantData, error: variantError }, { data: ruleData, error: ruleError }] = await Promise.all([
        client.from("budget_components").select("id,component_key,source_column,label,unit,category,group_label,position,budget_prices(id,amount,expression,version,budget_variants(variant_key))").eq("catalog_id", catalog.id).eq("active", true).order("position"),
        client.from("budget_variants").select("id,variant_key,label,position").eq("catalog_id", catalog.id).order("position"),
        client.from("budget_calculation_rules").select("line_position,component_id,variant_id,source_formula").eq("catalog_id", catalog.id).order("line_position"),
      ]);
      throwIfError(componentError); throwIfError(variantError); throwIfError(ruleError);
      const mapped = mapBudgetDetail(catalog, (componentData ?? []) as unknown as Record<string, unknown>[]);
      mapped.variants = ((variantData ?? []) as unknown as Record<string, unknown>[]).map((row): BudgetVariant => ({
        id: String(row.id), key: String(row.variant_key), label: String(row.label), position: Number(row.position),
      }));
      mapped.rules = ((ruleData ?? []) as unknown as Record<string, unknown>[]).map((row): BudgetRule => ({
        linePosition: Number(row.line_position), componentId: String(row.component_id), variantId: String(row.variant_id), sourceFormula: String(row.source_formula),
      }));
      const { data: mappingData, error: mappingError } = await client.from("budget_material_mappings").select("material_key,material_name,material_unit,component_id,active").eq("catalog_id", catalog.id).order("material_name");
      throwIfError(mappingError);
      mapped.mappings = ((mappingData ?? []) as unknown as Record<string, unknown>[]).map((row): BudgetMaterialMapping => ({
        materialKey: String(row.material_key), materialName: String(row.material_name), materialUnit: String(row.material_unit ?? ""), componentId: typeof row.component_id === "string" ? row.component_id : null, active: Boolean(row.active),
      }));
      return mapped;
    },

    async saveBudgetMaterialMapping(catalogId: string, materialKey: string, materialName: string, materialUnit: string, componentId: string | null): Promise<void> {
      const { error } = await client.rpc("save_budget_material_mapping", { p_catalog_id: catalogId, p_material_key: materialKey, p_material_name: materialName, p_material_unit: materialUnit, p_component_id: componentId });
      throwIfError(error);
    },

    async saveBudgetComponent(input: { catalogId: string; id?: string; key?: string; label: string; unit: string; category: string; groupLabel: string }): Promise<string> {
      const { data, error } = await client.rpc("save_budget_component", {
        p_catalog_id: input.catalogId, p_component_id: input.id ?? null, p_component_key: input.key ?? null,
        p_label: input.label, p_unit: input.unit, p_category: input.category, p_group_label: input.groupLabel,
      });
      throwIfError(error);
      if (typeof data !== "string") throw new Error("Supabase tidak mengembalikan ID item harga");
      return data;
    },

    async archiveBudgetComponent(catalogId: string, componentId: string): Promise<void> {
      const { error } = await client.rpc("archive_budget_component", { p_catalog_id: catalogId, p_component_id: componentId });
      throwIfError(error);
    },

    async saveBudgetPriceChange(componentId: string, variantId: string, amount: number | null, expression: string | null): Promise<number> {
      const { data, error } = await client.rpc("save_budget_price_change", { p_component_id: componentId, p_variant_id: variantId, p_amount: amount, p_expression: expression });
      throwIfError(error);
      return Number(data);
    },

    async listBudgetEstimates(): Promise<(Pick<BudgetEstimate, "id" | "projectName" | "location" | "floor" | "grandTotal"> & { updatedAt: string; catalogLabel: string })[]> {
      const { data, error } = await client.from("budget_estimates").select("id,project_name,location,floor,grand_total,updated_at,budget_catalogs(label)").order("updated_at", { ascending: false });
      throwIfError(error);
      return ((data ?? []) as unknown as Record<string, unknown>[]).map((row) => {
        const related = Array.isArray(row.budget_catalogs) ? row.budget_catalogs[0] : row.budget_catalogs;
        return { id: String(row.id), projectName: String(row.project_name), location: String(row.location ?? ""), floor: String(row.floor ?? ""), grandTotal: Number(row.grand_total), updatedAt: String(row.updated_at), catalogLabel: String((related as Record<string, unknown> | null)?.label ?? "") };
      });
    },

    async loadBudgetEstimate(id: string): Promise<BudgetEstimate | null> {
      const { data, error } = await client.from("budget_estimates").select("id,catalog_id,project_name,location,floor,report_date,author_label,grand_total,snapshot,budget_estimate_lines(position,description,unit_count,quantities,subtotal,result_snapshot)").eq("id", id).maybeSingle();
      throwIfError(error);
      if (!data) return null;
      const row = data as unknown as Record<string, unknown>;
      return {
        id: String(row.id), catalogId: String(row.catalog_id), projectName: String(row.project_name), location: String(row.location ?? ""), floor: String(row.floor ?? ""), reportDate: String(row.report_date), authorLabel: String(row.author_label ?? ""), grandTotal: Number(row.grand_total), snapshot: (row.snapshot ?? {}) as Record<string, unknown>,
        lines: ((row.budget_estimate_lines as Record<string, unknown>[] | null) ?? []).map((line) => ({ position: Number(line.position), description: String(line.description ?? ""), unitCount: Number(line.unit_count), quantities: (line.quantities ?? {}) as Record<string, number> })),
      };
    },

    async saveBudgetEstimate(input: BudgetEstimate, calculatedLines: { position: number; subtotal: number; resultSnapshot: Record<string, unknown> }[]): Promise<BudgetEstimate> {
      const { data, error } = await client.rpc("save_budget_estimate", {
        p_estimate_id: input.id ?? null, p_catalog_id: input.catalogId, p_project_name: input.projectName, p_location: input.location,
        p_floor: input.floor, p_report_date: input.reportDate, p_author_label: input.authorLabel, p_grand_total: input.grandTotal,
        p_snapshot: input.snapshot,
        p_lines: input.lines.map((line) => {
          const result = calculatedLines.find((item) => item.position === line.position);
          return { ...line, subtotal: result?.subtotal ?? 0, result_snapshot: result?.resultSnapshot ?? {} };
        }),
      });
      throwIfError(error);
      const id = typeof data === "string" ? data : input.id;
      if (!id) throw new Error("Supabase tidak mengembalikan ID perkiraan");
      return { ...input, id };
    },
  };
}
