import { formatQuantity, formatRupiah } from "../../app/format";
import type { MaterialRecapRow } from "./aggregateMaterials";

type MaterialRecapProps = {
  rows: readonly MaterialRecapRow[];
  total: number;
  onPriceChange(priceKey: string, unitPrice: number | undefined): void;
};

export function MaterialRecap({ rows, total, onPriceChange }: MaterialRecapProps) {
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
            <thead><tr><th>Material</th><th>Kebutuhan</th><th>Harga satuan</th><th>Jumlah</th></tr></thead>
            <tbody>
              {rows.map((row) => (
                <tr key={`${row.materialCode}-${row.unit}-${row.priceKey}`}>
                  <td><span className="recap-material-name">{row.name}</span><small className="recap-material-code">{row.materialCode} · {row.unit} · {row.priceSourceLabel}</small></td>
                  <td className="recap-quantity">{formatQuantity(row.quantity)} <span>{row.unit}</span></td>
                  <td>
                    <label className="price-field">
                      <span className="sr-only">Harga satuan {row.name} ({row.unit})</span>
                      <span className="price-prefix">Rp</span>
                      <input
                        type="number"
                        min="0"
                        step="any"
                        inputMode="decimal"
                        placeholder="Isi harga"
                        value={row.unitPrice ?? ""}
                        onChange={(event) => {
                          if (event.target.value === "") onPriceChange(row.priceKey, undefined);
                          else onPriceChange(row.priceKey, Math.max(0, Number(event.target.value)));
                        }}
                      />
                    </label>
                  </td>
                  <td className="recap-subtotal">{row.subtotal === null ? <span className="unpriced-label">Belum diisi</span> : formatRupiah(row.subtotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="recap-total-row">
        <div><strong>Total sementara</strong>{missingPrices > 0 && <span>{missingPrices} harga satuan belum diisi</span>}</div>
        <strong className="grand-total">{formatRupiah(total)}</strong>
      </div>
    </section>
  );
}
