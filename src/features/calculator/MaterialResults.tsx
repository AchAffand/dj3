import type { ProjectResultSnapshot } from "../../domain/projects/types";
import { formatQuantity } from "../../app/format";

export function MaterialResults({ result }: { result: ProjectResultSnapshot }) {
  if (!result.items.length && !result.errors.length) {
    return <p className="empty-inline">Isi ukuran untuk melihat kebutuhan material.</p>;
  }

  return (
    <div className="line-results">
      <div className="line-results-heading">HASIL QTY PER 1 MODEL</div>
      {result.items.length > 0 && (
        <div className="line-result-list">
          {result.items.map((item) => (
            <div className="line-result-row" key={item.materialCode}>
              <span className="line-result-name">{item.name}<small>{item.materialCode}</small></span>
              <strong>{formatQuantity(item.quantity)} <small>{item.unit}</small></strong>
            </div>
          ))}
        </div>
      )}
      {result.errors.length > 0 && (
        <div className="incomplete-notice" role="status">
          <strong>Perhitungan belum lengkap</strong>
          {result.errors.map((error) => (
            <span key={error.materialCode}>#{error.materialCode} · {error.reason}</span>
          ))}
        </div>
      )}
    </div>
  );
}
