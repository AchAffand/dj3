import { formatQuantity, formatRupiah } from "../../app/format";
import type { MasterItemOption } from "../../domain/budgets/types";
import type { MaterialRecapRow } from "./aggregateMaterials";

type MaterialRecapProps = {
  rows: readonly MaterialRecapRow[];
  total: number;
  masterItemOptions?: readonly MasterItemOption[];
  loadingMasterItems?: boolean;
  onPriceChange(priceKey: string, unitPrice: number | undefined): void;
  onMasterItemChange(row: MaterialRecapRow, option: MasterItemOption): void;
};

function uniqueOptions(options: readonly MasterItemOption[], key: (option: MasterItemOption) => string | null): MasterItemOption[] {
  const values = new Map<string, MasterItemOption>();
  for (const option of options) {
    const value = key(option);
    if (value && !values.has(value)) values.set(value, option);
  }
  return [...values.values()].sort((a, b) => a.position - b.position || a.itemLabel.localeCompare(b.itemLabel, "id"));
}

export function MaterialRecap({ rows, total, masterItemOptions = [], loadingMasterItems = false, onPriceChange, onMasterItemChange }: MaterialRecapProps) {
  const missingPrices = rows.filter((row) => row.unitPrice === null).length;
  return (
    <section className="recap-card">
      <div className="recap-heading">
        <div><p className="eyebrow">RINGKASAN KEBUTUHAN</p><h2>Rekap material</h2></div>
        <span className="recap-count">{rows.length} item</span>
      </div>
      {rows.length === 0 ? (
        <div className="recap-empty"><span className="recap-empty-mark">↗</span><strong>Rekap akan muncul di sini</strong><p>Pilih model dan isi ukuran untuk melihat total bahan.</p></div>
      ) : (
        <div className="recap-table-wrap">
          <table className="recap-table">
            <thead><tr><th>Material / Master Item</th><th>Kebutuhan</th><th>Harga satuan</th><th>Jumlah</th></tr></thead>
            <tbody>
              {rows.map((row) => {
                const sourceModels = [...new Set(row.sources.map((source) => source.modelCode))];
                const options = masterItemOptions.filter((option) =>
                  option.materialCode === row.materialCode
                  && (option.modelCode === null || (sourceModels.length === 1 && option.modelCode === sourceModels[0])),
                );
                const itemOptions = uniqueOptions(options, (option) => option.itemId);
                const keyParts = row.priceKey.startsWith("normalized:") ? row.priceKey.split(":") : [];
                const selectedItemId = keyParts[1] ?? "";
                const selectedItemOptions = selectedItemId ? options.filter((option) => option.itemId === selectedItemId) : [];
                const brandOptions = uniqueOptions(selectedItemOptions, (option) => option.brandId);
                const savedBrandId = keyParts[2] ?? "";
                const selectedBrandId = brandOptions.some((option) => option.brandId === savedBrandId)
                  ? savedBrandId : (brandOptions.length === 1 ? brandOptions[0].brandId ?? "" : "");
                const brandScoped = selectedBrandId ? selectedItemOptions.filter((option) => option.brandId === selectedBrandId) : selectedItemOptions;
                const variantOptions = uniqueOptions(brandScoped, (option) => option.variantId);
                const savedVariantId = keyParts[3] ?? "";
                const selectedVariantId = variantOptions.some((option) => option.variantId === savedVariantId)
                  ? savedVariantId : (variantOptions.length === 1 ? variantOptions[0].variantId ?? "" : "");
                const needsBrandChoice = brandOptions.length > 1 && !selectedBrandId;
                const needsVariantChoice = variantOptions.length > 1 && !selectedVariantId;
                const selectedOption = needsBrandChoice || needsVariantChoice ? undefined
                  : brandScoped.find((option) => option.variantId === selectedVariantId)
                    ?? brandScoped.find((option) => option.isDefault) ?? brandScoped[0];
                const chooseItem = (itemId: string) => {
                  const candidates = options.filter((option) => option.itemId === itemId);
                  if (!candidates.length) return;
                  const brands = uniqueOptions(candidates, (option) => option.brandId);
                  const variants = uniqueOptions(candidates, (option) => option.variantId);
                  const first = candidates.find((option) => option.isDefault) ?? candidates[0];
                  if (brands.length > 1) onMasterItemChange(row, { ...first, brandId: null, brandLabel: null, variantId: null, variantLabel: null, unitPrice: null, priceVersion: null });
                  else if (variants.length > 1) onMasterItemChange(row, { ...first, variantId: null, variantLabel: null, unitPrice: null, priceVersion: null });
                  else onMasterItemChange(row, first);
                };
                return (
                  <tr key={`${row.materialCode}-${row.unit}-${row.priceKey}`}>
                    <td>
                      <span className="recap-material-name">{row.name}</span>
                      <small className="recap-material-code">{row.materialCode} · {row.unit} · {row.priceSourceLabel}</small>
                      {options.length > 0 && <div className="normalized-item-source-fields">
                        <label className="dimension-field"><span>Master Item</span><select aria-label={`Master Item ${row.name}`} value={selectedItemId} onChange={(event) => chooseItem(event.target.value)}>
                          <option value="">Pilih item Master</option>{itemOptions.map((option) => <option key={option.itemId} value={option.itemId}>{option.itemLabel}{option.unit ? ` · ${option.unit}` : ""}</option>)}
                        </select></label>
                        {brandOptions.length > 0 && <label className="dimension-field"><span>Brand</span><select aria-label={`Brand ${row.name}`} value={selectedBrandId} onChange={(event) => {
                          const scoped = selectedItemOptions.filter((option) => option.brandId === event.target.value);
                          const next = scoped.find((option) => option.isDefault) ?? scoped[0];
                          if (next) {
                            const variants = uniqueOptions(scoped, (option) => option.variantId);
                            onMasterItemChange(row, variants.length > 1 ? { ...next, variantId: null, variantLabel: null, unitPrice: null, priceVersion: null } : next);
                          }
                        }}><option value="">Pilih brand</option>{brandOptions.map((option) => <option key={option.brandId} value={option.brandId ?? ""}>{option.brandLabel}</option>)}</select></label>}
                        {variantOptions.length > 1 && <label className="dimension-field"><span>Varian / finishing</span><select aria-label={`Varian ${row.name}`} value={selectedVariantId} disabled={brandOptions.length > 1 && !selectedBrandId} onChange={(event) => {
                          const next = brandScoped.find((option) => option.variantId === event.target.value);
                          if (next) onMasterItemChange(row, next);
                        }}><option value="">Pilih varian</option>{variantOptions.map((option) => <option key={option.variantId} value={option.variantId ?? ""}>{option.variantLabel}</option>)}</select></label>}
                        {selectedOption && <small className="normalized-item-price">{selectedOption.unitPrice !== null ? `Harga master: ${formatRupiah(selectedOption.unitPrice)} / ${selectedOption.unitOverride || row.unit}` : selectedOption.priceExpression ? "Rumus harga Master Item belum dapat dihitung; periksa referensi harga Master Harga." : "Harga belum diisi pada Master Harga."}</small>}
                      </div>}
                    </td>
                    <td className="recap-quantity">{formatQuantity(row.quantity)} <span>{row.unit}</span></td>
                    <td><label className="price-field"><span className="sr-only">Harga satuan {row.name} ({row.unit})</span><span className="price-prefix">Rp</span><input type="number" min="0" step="any" inputMode="decimal" placeholder="Isi harga" value={row.unitPrice ?? ""} onChange={(event) => onPriceChange(row.priceKey, event.target.value === "" ? undefined : Math.max(0, Number(event.target.value)))} /></label></td>
                    <td className="recap-subtotal">{row.subtotal === null ? <span className="unpriced-label">Belum diisi</span> : formatRupiah(row.subtotal)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {loadingMasterItems && <small>Memuat pilihan Master Item…</small>}
      <div className="recap-total-row"><div><strong>Total sementara</strong>{missingPrices > 0 && <span>{missingPrices} harga satuan belum diisi</span>}</div><strong className="grand-total">{formatRupiah(total)}</strong></div>
    </section>
  );
}
