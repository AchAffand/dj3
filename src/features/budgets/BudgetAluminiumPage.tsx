import { useNavigate } from "react-router-dom";
import { AppPageState } from "../../app/AppPageState";
import { formatRupiah } from "../../app/format";
import { useAppServices } from "../../app/AppServices";

const brandOrder = ["hpm-inka-dacon", "alexindo", "ykk"];
const brandLabel = (slug: string, label: string) => slug === "hpm-inka-dacon" ? "HPM" : label;

export function BudgetAluminiumPage() {
  const { budgetCatalogs = [], budgetDetails = new Map(), loadingBudgets, budgetError } = useAppServices();
  const navigate = useNavigate();
  if (loadingBudgets) return <AppPageState title="Memuat Master Harga Aluminium" detail="Harga semua merek sedang disiapkan." />;
  if (budgetError) return <AppPageState title="Master Harga belum dapat dimuat" detail={budgetError} tone="error" actionLabel="Kembali" onAction={() => navigate("/master-harga")} />;
  const catalogs = [...budgetCatalogs]
    .filter((item) => brandOrder.includes(item.slug))
    .sort((a, b) => brandOrder.indexOf(a.slug) - brandOrder.indexOf(b.slug));
  if (!catalogs.length) return <AppPageState title="Kelompok Aluminium belum tersedia" detail="Belum ada katalog merek aluminium aktif." actionLabel="Kembali" onAction={() => navigate("/master-harga")} />;
  return <section className="page-content budget-page">
    <div className="page-heading-row">
      <div className="page-intro"><p className="eyebrow">MASTER HARGA · ALUMINIUM</p><h1>Kelola Item Aluminium</h1><p className="page-description">Susunan harga mengikuti lembar Excel: item sebagai kolom dan finishing sebagai baris, dikelompokkan per merek.</p></div>
      <button className="secondary-button" type="button" onClick={() => navigate("/master-harga")}>Kembali</button>
    </div>
    <div className="budget-price-groups budget-excel-layout">
      {catalogs.map((catalog) => {
        const detail = budgetDetails.get(catalog.id);
        if (!detail) return null;
        const components = detail.components;
        return <section className="budget-price-group" key={catalog.id}>
          <div className="budget-aluminium-brand-heading"><h2>{brandLabel(catalog.slug, catalog.label)}</h2><button className="secondary-button" type="button" onClick={() => navigate(`/master-harga/${catalog.slug}?mode=prices`)}>Atur harga {brandLabel(catalog.slug, catalog.label)}</button></div>
          <div className="budget-price-table-wrap"><table className="budget-price-table budget-price-matrix">
            <thead><tr><th>Varian / Finishing</th>{components.map((component) => <th key={component.id}><strong>{component.label}</strong><small>{component.unit || "-"}{component.sourceColumn ? ` · ${component.sourceColumn}` : ""}</small></th>)}</tr></thead>
            <tbody>{detail.variants.map((variant) => <tr key={variant.id}><th scope="row">{variant.label}</th>{components.map((component) => {
              const price = component.prices[variant.key];
              const value = price?.amount !== null && price?.amount !== undefined ? formatRupiah(price.amount) : price?.expression ? `ƒ ${price.expression}` : "Belum diisi";
              return <td key={component.id}><button className="budget-price-value" type="button" onClick={() => navigate(`/master-harga/${catalog.slug}?mode=prices`)}>{value}</button></td>;
            })}</tr>)}</tbody>
          </table></div>
        </section>;
      })}
    </div>
  </section>;
}
