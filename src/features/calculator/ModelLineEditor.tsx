import { modelGroupLabel, type DoorModel, type InputVariableName, type InputVariables } from "../../domain/catalog/types";
import type { ProjectLineDraft } from "../projects/projectService";
import type { ProjectResultSnapshot } from "../../domain/projects/types";
import { MaterialResults } from "./MaterialResults";
import type { BudgetCatalog, BudgetCatalogDetail, MasterItemOption } from "../../domain/budgets/types";
import { accessoryPriceOptions, excelColumnFromNumber, excelColumnToNumber, glassPriceOptions, isDoorLeafMaterial, isGlassMaterial, isTatapanMaterial, normalizeMaterialDisplayName, tatapanPriceOptions, windowPriceOptions } from "../../domain/budgets/pricing";

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
  masterItemOptions?: readonly MasterItemOption[];
  loadingMasterItems?: boolean;
};

function createMaterialSelectionId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (character) => {
    const random = Math.floor(Math.random() * 16);
    return (character === "x" ? random : (random & 0x3) | 0x8).toString(16);
  });
}

function uniqueOptions(options: readonly MasterItemOption[], key: (option: MasterItemOption) => string | null): MasterItemOption[] {
  const unique = new Map<string, MasterItemOption>();
  for (const option of options) {
    const value = key(option);
    if (value && !unique.has(value)) unique.set(value, option);
  }
  return [...unique.values()].sort((a, b) => a.position - b.position || a.itemLabel.localeCompare(b.itemLabel, "id"));
}

function selectionForOption(
  line: ProjectLineDraft,
  material: { materialCode: number; name: string; unit: string; quantity: number },
  option: MasterItemOption,
  position: number,
): ProjectLineDraft {
  const existing = line.materialItems ?? [];
  const previous = existing.find((item) => item.sourceType === "formula" && item.formulaMaterialCode === material.materialCode);
  const unit = option.unitOverride.trim() || material.unit;
  const price = option.unitPrice;
  const next = {
    id: previous?.id ?? createMaterialSelectionId(),
    sourceType: "formula" as const,
    formulaMaterialCode: material.materialCode,
    masterItemId: option.itemId,
    selectedBrandId: option.brandId,
    selectedVariantId: option.variantId,
    quantity: material.quantity,
    unitSnapshot: unit,
    itemNameSnapshot: option.itemLabel,
    groupNameSnapshot: option.groupLabel,
    brandNameSnapshot: option.brandLabel,
    variantNameSnapshot: option.variantLabel,
    unitPriceSnapshot: typeof price === "number" && Number.isFinite(price) && price >= 0 ? price : null,
    priceVersionSnapshot: option.priceVersion,
    priceIsSet: typeof price === "number" && Number.isFinite(price) && price >= 0,
    position,
  };
  return {
    ...line,
    materialItems: [
      ...existing.filter((item) => !(item.sourceType === "formula" && item.formulaMaterialCode === material.materialCode)),
      next,
    ],
  };
}

export function ModelLineEditor({ lines, models, results, onChange, onRemove, budgetCatalogs = [], budgetDetails = new Map(), masterItemOptions = [], loadingMasterItems = false }: ModelLineEditorProps) {
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
                  <label className="dimension-field"><span>Merek aluminium</span><select value={line.priceCatalogId ?? ""} onChange={(event) => {
                    const priceCatalogId = event.target.value || null;
                    const variants = priceCatalogId ? budgetDetails.get(priceCatalogId)?.variants ?? [] : [];
                    const defaultVariant = variants.find((variant) => variant.key === "brown") ?? variants[0];
                    onChange(lineId, { ...line, priceCatalogId, priceVariantId: defaultVariant?.id ?? null });
                  }}><option value="">Pilih merek aluminium</option>{budgetCatalogs.filter((item) => !["kaca-umum", "aksesoris-umum"].includes(item.slug)).map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
                  {line.priceCatalogId && <label className="dimension-field"><span>Warna / varian harga</span><select value={line.priceVariantId ?? ""} onChange={(event) => onChange(lineId, { ...line, priceVariantId: event.target.value || null })}><option value="">Pilih varian</option>{(budgetDetails.get(line.priceCatalogId)?.variants ?? []).map((variant) => <option key={variant.id} value={variant.id}>{variant.label}</option>)}</select></label>}
                </div>}
                {model.status === "incomplete" && <div className="model-incomplete-tag">Sebagian rumus model ini belum tersedia</div>}
                {(() => {
                  const accessories = model.materials.filter((material) => {
                    const name = material.name.toLocaleLowerCase("id-ID");
                    const unit = material.unit.trim().toLocaleLowerCase("id-ID");
                    if (/^handle$/.test(name) && !["pcs", "set"].includes(unit)) return false;
                    return /engsel kupu|^(handel|handle)\s*\+\s*kunci$|^handle$|kunci sliding/i.test(name);
                  });
                  const accessoryCatalog = budgetCatalogs.find((item) => item.slug === "aksesoris-umum");
                  const detail = (accessoryCatalog ? budgetDetails.get(accessoryCatalog.id) : undefined)
                    ?? budgetDetails.get(line.priceCatalogId ?? "");
                  return accessories.length ? <div className="budget-source-fields accessory-source-fields">
                    {accessories.map((material) => {
                      const options = accessoryPriceOptions(detail, material.name);
                      if (options.length < 2) return null;
                      const inputKey = "__budgetAccessory_" + material.code;
                      const selected = line.inputs[inputKey];
                      const selectedOption = options.find((item) => excelColumnToNumber(item.sourceColumn) === selected) ?? options[0];
                      return <label className="dimension-field" key={material.materialCode}>
                        <span>{normalizeMaterialDisplayName(material.name)} · Variasi</span>
                        <select aria-label={"Variasi " + material.name + " " + material.code} value={selectedOption.sourceColumn}
                          onChange={(event) => {
                            const component = options.find((item) => item.sourceColumn === event.target.value);
                            if (!component) return;
                            const inputs: InputVariables = { ...line.inputs, [inputKey]: excelColumnToNumber(component.sourceColumn) };
                            onChange(lineId, { ...line, inputs });
                          }}>
                          {options.map((item) => <option key={item.id} value={item.sourceColumn}>{item.label}</option>)}
                        </select>
                      </label>;
                    })}
                  </div> : null;
                })()}
                {(() => {
                  const glassCatalog = budgetCatalogs.find((item) => item.slug === "kaca-umum");
                  const glassDetail = glassCatalog ? budgetDetails.get(glassCatalog.id) : undefined;
                  const glassMaterials = model.materials.filter(isGlassMaterial);
                  const options = glassPriceOptions(glassDetail);
                  if (!glassMaterials.length || !options.length) return null;
                  return <div className="budget-source-fields glass-source-fields">
                    {glassMaterials.map((material) => {
                      const inputKey = "__budgetGlass_" + material.code;
                      const selected = line.inputs[inputKey];
                      const selectedOption = options.find((item) => excelColumnToNumber(item.sourceColumn) === selected);
                      return <label className="dimension-field" key={material.materialCode}>
                        <span>{normalizeMaterialDisplayName(material.name)} · Jenis kaca</span>
                        <select aria-label={"Jenis kaca " + material.name + " " + material.code}
                          value={selectedOption?.sourceColumn ?? ""}
                          onChange={(event) => {
                            const inputs: InputVariables = { ...line.inputs };
                            if (!event.target.value) delete inputs[inputKey];
                            else inputs[inputKey] = excelColumnToNumber(event.target.value);
                            onChange(lineId, { ...line, inputs });
                          }}>
                          <option value="">Pilih jenis kaca</option>
                          {options.map((item) => <option key={item.id} value={item.sourceColumn}>{item.label}</option>)}
                        </select>
                      </label>;
                    })}
                  </div>;
                })()}

                {line.priceCatalogId && model.materials.some(isTatapanMaterial) && (() => {
                  const options = tatapanPriceOptions(budgetDetails.get(line.priceCatalogId));
                  if (options.length !== 2) return null;
                  return <div className="budget-source-fields tatapan-source-field">
                    {model.materials.filter(isTatapanMaterial).map((material) => {
                      const inputKey = "__budgetTatapan_" + material.code;
                      const selected = line.inputs[inputKey];
                      const selectedColumn = typeof selected === "number" ? excelColumnFromNumber(selected) : "";
                      return <label className="dimension-field" key={material.code}>
                        <span>{normalizeMaterialDisplayName(material.name)} · Jenis tatapan</span>
                        <select aria-label={"Jenis tatapan " + material.name + " " + material.code}
                          value={selectedColumn}
                          onChange={(event) => {
                            const inputs: InputVariables = { ...line.inputs };
                            if (!event.target.value) delete inputs[inputKey];
                            else inputs[inputKey] = excelColumnToNumber(event.target.value);
                            onChange(lineId, { ...line, inputs });
                          }}>
                          <option value="">Pilih jenis tatapan</option>
                          {options.map((item) => <option key={item.id} value={item.sourceColumn}>{item.label}</option>)}
                        </select>
                      </label>;
                    })}
                  </div>;
                })()}
                {line.priceCatalogId && model.groupCode === 20000 && model.materials.some((material) => /^jendela$/i.test(material.name.trim()) && ["m\u0027", "m’"].includes(material.unit.trim().toLocaleLowerCase("id-ID"))) && (() => {
                  const options = windowPriceOptions(budgetDetails.get(line.priceCatalogId));
                  const selectedColumn = typeof line.inputs.__windowSourceColumn === "number"
                    ? excelColumnFromNumber(line.inputs.__windowSourceColumn)
                    : "";
                  return options.length > 0 ? (
                    <div className="budget-source-fields window-source-field">
                      <label className="dimension-field">
                        <span>Jenis Jendela</span>
                        <select
                          aria-label="Jenis Jendela"
                          value={selectedColumn}
                          onChange={(event) => {
                            const inputs: InputVariables = { ...line.inputs };
                            if (!event.target.value) delete inputs.__windowSourceColumn;
                            else inputs.__windowSourceColumn = excelColumnToNumber(event.target.value);
                            onChange(lineId, { ...line, inputs });
                          }}
                        >
                          <option value="">Pilih jenis jendela</option>
                          {options.map((component) => <option key={component.id} value={component.sourceColumn}>{component.label}</option>)}
                        </select>
                      </label>
                    </div>
                  ) : null;
                })()}
                {line.priceCatalogId && model.materials.some((material) => /doorcloser/i.test(material.name)) && (
                  <p className="empty-inline">Harga Doorcloser belum diisi. Admin dapat melengkapinya melalui Master Harga → Aksesoris, atau isi sementara di Rekap Material.</p>
                )}
                {line.priceCatalogId && model.materials.some(isDoorLeafMaterial) && (() => {
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
                {model.materials.length > 0 && (
                  <div className="budget-source-fields normalized-item-source-fields">
                    <div className="dimension-field normalized-item-heading">
                      <span>Material Master Item per baris model</span>
                      <small>Pilihan item, brand, dan varian akan disimpan bersama proyek.</small>
                    </div>
                    {result.items.map((material, materialIndex) => {
                      const options = masterItemOptions.filter((option) =>
                        option.materialCode === material.materialCode
                        && (option.modelCode === null || option.modelCode === model.code),
                      );
                      if (!options.length) return null;
                      const saved = line.materialItems?.find((item) =>
                        item.sourceType === "formula" && item.formulaMaterialCode === material.materialCode,
                      );
                      const itemOptions = uniqueOptions(options, (option) => option.itemId);
                      const selectedItemId = saved?.masterItemId && itemOptions.some((option) => option.itemId === saved.masterItemId)
                        ? saved.masterItemId
                        : "";
                      const selectedItemOptions = selectedItemId ? options.filter((option) => option.itemId === selectedItemId) : [];
                      const brandOptions = uniqueOptions(selectedItemOptions, (option) => option.brandId);
                      const selectedBrandId = saved?.selectedBrandId && brandOptions.some((option) => option.brandId === saved.selectedBrandId)
                        ? saved.selectedBrandId
                        : (brandOptions.length === 1 ? brandOptions[0].brandId : "");
                      const brandScopedOptions = selectedBrandId
                        ? selectedItemOptions.filter((option) => option.brandId === selectedBrandId)
                        : selectedItemOptions;
                      const variantOptions = uniqueOptions(brandScopedOptions, (option) => option.variantId);
                      const selectedVariantId = saved?.selectedVariantId && variantOptions.some((option) => option.variantId === saved.selectedVariantId)
                        ? saved.selectedVariantId
                        : (variantOptions.length === 1 ? variantOptions[0].variantId : "");
                      const selectedOption = brandScopedOptions.find((option) => option.variantId === selectedVariantId)
                        ?? brandScopedOptions.find((option) => option.isDefault)
                        ?? brandScopedOptions[0];
                      const applyOption = (option: MasterItemOption | undefined) => {
                        if (!option) return;
                        onChange(lineId, selectionForOption(line, material, option, materialIndex));
                      };
                      return (
                        <div className="normalized-item-row" key={material.code}>
                          <strong>{normalizeMaterialDisplayName(material.name)}</strong>
                          <label className="dimension-field">
                            <span>Master Item</span>
                            <select
                              aria-label={`Master Item ${material.name} ${material.materialCode}`}
                              value={selectedItemId}
                              onChange={(event) => {
                                const nextOptions = options.filter((option) => option.itemId === event.target.value);
                                const next = nextOptions.find((option) => option.isDefault) ?? nextOptions[0];
                                applyOption(next);
                              }}
                            >
                              <option value="">Pilih item Master</option>
                              {itemOptions.map((option) => (
                                <option key={option.itemId} value={option.itemId}>{option.itemLabel}{option.unit ? ` · ${option.unit}` : ""}</option>
                              ))}
                            </select>
                          </label>
                          {brandOptions.length > 0 && (
                            <label className="dimension-field">
                              <span>Brand</span>
                              <select
                                aria-label={`Brand ${material.name} ${material.materialCode}`}
                                value={selectedBrandId}
                                onChange={(event) => {
                                  const next = selectedItemOptions.find((option) => option.brandId === event.target.value && option.isDefault)
                                    ?? selectedItemOptions.find((option) => option.brandId === event.target.value);
                                  applyOption(next);
                                }}
                              >
                                <option value="">Pilih brand</option>
                                {brandOptions.map((option) => <option key={option.brandId} value={option.brandId ?? ""}>{option.brandLabel}</option>)}
                              </select>
                            </label>
                          )}
                          {variantOptions.length > 1 && (
                            <label className="dimension-field">
                              <span>Varian / finishing</span>
                              <select
                                aria-label={`Varian ${material.name} ${material.materialCode}`}
                                value={selectedVariantId}
                                onChange={(event) => applyOption(brandScopedOptions.find((option) => option.variantId === event.target.value))}
                              >
                                <option value="">Pilih varian</option>
                                {variantOptions.map((option) => <option key={option.variantId} value={option.variantId ?? ""}>{option.variantLabel}</option>)}
                              </select>
                            </label>
                          )}
                          {selectedOption && (
                            <small className="normalized-item-price">
                              {selectedOption.unitPrice !== null
                                ? `Harga master: Rp ${new Intl.NumberFormat("id-ID").format(selectedOption.unitPrice)} / ${selectedOption.unitOverride || material.unit}`
                                : selectedOption.priceExpression
                                  ? "Harga menggunakan ekspresi master; perlu pemetaan perhitungan lanjutan."
                                  : "Harga belum diisi pada Master Harga."}
                            </small>
                          )}
                        </div>
                      );
                    })}
                    {loadingMasterItems && <small>Memuat pilihan Master Item…</small>}
                    {!loadingMasterItems && masterItemOptions.length === 0 && <small>Belum ada opsi Master Item yang dapat dipilih untuk material ini.</small>}
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
