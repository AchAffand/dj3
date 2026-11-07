import { modelGroupLabel, type DoorModel, type InputVariableName, type InputVariables } from "../../domain/catalog/types";
import type { ProjectLineDraft } from "../projects/projectService";
import type { ProjectResultSnapshot } from "../../domain/projects/types";
import { MaterialResults } from "./MaterialResults";
import type { BudgetCatalog, BudgetCatalogDetail } from "../../domain/budgets/types";
import { accessoryPriceOptions } from "../../domain/budgets/pricing";

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
                  {models.filter((item) => item.active !== false || item.code === line.modelCode).map((item) => (
                    <option key={item.code} value={item.code}>{item.code} · {modelGroupLabel(item.groupCode, item.groupName)}{item.active === false ? " · Arsip (proyek lama)" : ""}</option>
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
                {(() => {
                  const accessories = model.materials.filter((material) => {
                    const name = material.name.toLocaleLowerCase("id-ID");
                    const unit = material.unit.trim().toLocaleLowerCase("id-ID");
                    if (/^handle$/.test(name) && !["pcs", "set"].includes(unit)) return false;
                    return /engsel kupu|^(handel|handle)\\s*\\+\\s*kunci$|^handle$|kunci sliding/i.test(name);
                  });
                  const detail = budgetDetails.get(line.priceCatalogId ?? "");
                  return accessories.length ? <div className="budget-source-fields accessory-source-fields">
                    {accessories.map((material) => {
                      const options = accessoryPriceOptions(detail, material.name);
                      if (options.length < 2) return null;
                      const inputKey = "__budgetAccessory_" + material.code;
                      const selected = line.inputs[inputKey];
                      const selectedOption = options.find((item) => item.sourceColumn.charCodeAt(0) - 64 === selected) ?? options[0];
                      return <label className="dimension-field" key={material.code}>
                        <span>{material.name} · Variasi</span>
                        <select aria-label={"Variasi " + material.name + " " + material.code} value={selectedOption.sourceColumn}
                          onChange={(event) => {
                            const component = options.find((item) => item.sourceColumn === event.target.value);
                            if (!component) return;
                            const inputs: InputVariables = { ...line.inputs, [inputKey]: component.sourceColumn.charCodeAt(0) - 64 };
                            onChange(lineId, { ...line, inputs });
                          }}>
                          {options.map((item) => <option key={item.id} value={item.sourceColumn}>{item.label}</option>)}
                        </select>
                      </label>;
                    })}
                  </div> : null;
                })()}
                {line.priceCatalogId && model.materials.some((material) => /doorcloser/i.test(material.name)) && (
                  <p className="empty-inline">Harga Doorcloser belum tersedia di Master Harga HPM / INKA / DACON. Harga dapat diisi manual pada Rekap Material sampai item dan harga Doorcloser ditambahkan ke master.</p>
                )}
                {line.priceCatalogId && model.materials.some((material) => /daun pintu/i.test(material.name) && ["unit", "daun"].includes(material.unit.trim().toLocaleLowerCase("id-ID"))) && (() => {
                  const options = (budgetDetails.get(line.priceCatalogId)?.components ?? [])
                    .filter((component) => /^[R-X]$/.test(component.sourceColumn))
                    .sort((a, b) => a.position - b.position);
                  const selectedColumn = line.inputs.__doorLeafSourceColumn;
                  return options.length > 0 ? (
                    <div className="budget-source-fields door-leaf-source-field">
                      <label className="dimension-field">
                        <span>Jenis daun pintu</span>
                        <select
                          value={typeof selectedColumn === "number" ? String.fromCharCode(64 + selectedColumn) : ""}
                          onChange={(event) => {
                            const inputs: InputVariables = { ...line.inputs };
                            if (!event.target.value) delete inputs.__doorLeafSourceColumn;
                            else inputs.__doorLeafSourceColumn = event.target.value.charCodeAt(0) - 64;
                            onChange(lineId, { ...line, inputs });
                          }}
                        >
                          <option value="">Pilih jenis daun pintu</option>
                          {options.map((component) => <option key={component.id} value={component.sourceColumn}>{component.label}</option>)}
                        </select>
                      </label>
                    </div>
                  ) : null;
                })()}
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
