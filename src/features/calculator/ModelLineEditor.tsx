import { modelGroupLabel, type DoorModel, type InputVariableName, type InputVariables } from "../../domain/catalog/types";
import type { ProjectLineDraft } from "../projects/projectService";
import type { ProjectResultSnapshot } from "../../domain/projects/types";
import { MaterialResults } from "./MaterialResults";
import type { BudgetCatalog, BudgetCatalogDetail } from "../../domain/budgets/types";

const inputLabels: Partial<Record<InputVariableName, string>> = {
  T1: "T1 · mm",
  L1: "L1 · mm",
  T2: "T2 · mm",
  L2: "L2 · mm",
  T3: "T3 · mm",
  L3: "L3 · mm",
  daunPintu: "Daun pintu",
  daunJendela: "Daun jendela",
};

type ModelLineEditorProps = {
  lines: readonly ProjectLineDraft[];
  models: readonly DoorModel[];
  results: ReadonlyMap<string, ProjectResultSnapshot>;
  onChange(lineId: string, updated: ProjectLineDraft): void;
  onRemove(lineId: string): void;
  budgetCatalogs?: readonly BudgetCatalog[];
  budgetDetails?: ReadonlyMap<string, BudgetCatalogDetail>;
};

export function ModelLineEditor({ lines, models, results, onChange, onRemove, budgetCatalogs = [], budgetDetails = new Map() }: ModelLineEditorProps) {
  return (
    <div className="model-line-list">
      {lines.map((line, index) => {
        const lineId = line.id ?? `${line.modelCode}-${index}`;
        const model = models.find((item) => item.code === line.modelCode);
        const result = results.get(lineId) ?? { items: [], errors: [] };
        return (
          <article className="model-line-card" key={lineId}>
            <div className="model-line-heading">
              <span className="line-number">{String(index + 1).padStart(2, "0")}</span>
              <div className="line-model-select">
                <label htmlFor={`model-${lineId}`}>MODEL</label>
                <select
                  id={`model-${lineId}`}
                  value={line.modelCode || ""}
                  onChange={(event) => {
                    const modelCode = Number(event.target.value);
                    onChange(lineId, { ...line, modelCode, inputs: {}, formulaSnapshot: undefined, resultSnapshot: undefined });
                  }}
                >
                  <option value="" disabled>Pilih kode model</option>
                  {models.map((item) => (
                    <option key={item.code} value={item.code}>{item.code} · {modelGroupLabel(item.groupCode, item.groupName)}</option>
                  ))}
                </select>
              </div>
              <label className="count-field" htmlFor={`count-${lineId}`}>
                <span>JUMLAH UNIT</span>
                <input
                  id={`count-${lineId}`}
                  type="number"
                  min="1"
                  step="1"
                  value={line.count}
                  onChange={(event) => onChange(lineId, { ...line, count: Math.max(1, Math.floor(Number(event.target.value) || 1)) })}
                />
              </label>
              <button className="icon-button remove-line" type="button" aria-label={`Hapus model ${line.modelCode}`} onClick={() => onRemove(lineId)}>×</button>
            </div>

            {model && (
              <>
                {budgetCatalogs.length > 0 && <div className="budget-source-fields">
                  <label className="dimension-field"><span>Sumber harga</span><select value={line.priceCatalogId ?? ""} onChange={(event) => {
                    const priceCatalogId = event.target.value || null;
                    const variants = priceCatalogId ? budgetDetails.get(priceCatalogId)?.variants ?? [] : [];
                    const defaultVariant = variants.find((variant) => variant.key === "brown") ?? variants[0];
                    onChange(lineId, { ...line, priceCatalogId, priceVariantId: defaultVariant?.id ?? null });
                  }}><option value="">Pilih katalog harga</option>{budgetCatalogs.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
                  {line.priceCatalogId && <label className="dimension-field"><span>Warna / varian harga</span><select value={line.priceVariantId ?? ""} onChange={(event) => onChange(lineId, { ...line, priceVariantId: event.target.value || null })}><option value="">Pilih varian</option>{(budgetDetails.get(line.priceCatalogId)?.variants ?? []).map((variant) => <option key={variant.id} value={variant.id}>{variant.label}</option>)}</select></label>}
                </div>}
                {model.status === "incomplete" && <div className="model-incomplete-tag">Sebagian rumus model ini belum tersedia</div>}
                {model.inputs.length > 0 && (
                  <div className="input-grid">
                    {model.inputs.map((name) => {
                      const value = line.inputs[name];
                      const isCount = name === "daunPintu" || name === "daunJendela";
                      return (
                        <label className="dimension-field" htmlFor={`input-${lineId}-${name}`} key={name}>
                          <span>{inputLabels[name] ?? name}</span>
                          <input
                            id={`input-${lineId}-${name}`}
                            type="number"
                            min="0"
                            step={isCount ? "1" : "any"}
                            inputMode="decimal"
                            value={value ?? ""}
                            placeholder="Belum diisi"
                            onChange={(event) => {
                              const inputs: InputVariables = { ...line.inputs };
                              if (event.target.value === "") delete inputs[name];
                              else {
                                const parsed = Number(event.target.value);
                                inputs[name] = isCount ? Math.max(0, Math.floor(parsed)) : Math.max(0, parsed);
                              }
                              onChange(lineId, { ...line, inputs, formulaSnapshot: undefined, resultSnapshot: undefined });
                            }}
                          />
                        </label>
                      );
                    })}
                  </div>
                )}
                <MaterialResults result={result} />
              </>
            )}
            {!model && <p className="empty-inline">Pilih model dari katalog.</p>}
          </article>
        );
      })}
    </div>
  );
}
