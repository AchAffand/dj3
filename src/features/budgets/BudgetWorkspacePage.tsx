import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppPageState } from "../../app/AppPageState";
import { useAppServices } from "../../app/AppServices";
import type { BudgetCatalog } from "../../domain/budgets/types";

export function BudgetWorkspacePage() {
  const { repository } = useAppServices();
  const navigate = useNavigate();
  const [catalogs, setCatalogs] = useState<BudgetCatalog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    if (!repository) { setLoading(false); return; }
    setLoading(true); setError(null);
    try {
      const catalogRows = await repository.listBudgetCatalogs();
      setCatalogs(catalogRows);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Master harga belum dapat dimuat."); }
    finally { setLoading(false); }
  }, [repository]);
  useEffect(() => { void load(); }, [load]);
  if (loading) return <AppPageState title="Memuat Master Harga" detail="Katalog dan perkiraan sedang dibuka." />;
  if (error) return <AppPageState title="Master Harga belum dapat dimuat" detail={error} tone="error" actionLabel="Coba lagi" onAction={() => void load()} />;
  return <section className="page-content">
    <div className="page-heading-row"><div className="page-intro"><p className="eyebrow">ANGGARAN KUSEN</p><h1>Master Harga</h1><p className="page-description">Kelola tarif Excel, tentukan pemetaan item, lalu gunakan otomatis saat menghitung proyek kusen.</p></div></div>
    <div className="budget-catalog-grid">{catalogs.map((catalog) => <article className="budget-catalog-card" key={catalog.id}>
      <div><p className="eyebrow">LEMBAR {String(catalog.position).padStart(2,"0")}</p><h2>{catalog.label}</h2><p>Harga, rumus, dan perhitungan untuk katalog ini.</p></div>
      <div className="budget-card-actions"><button className="secondary-button" type="button" onClick={() => navigate(`/master-harga/${catalog.slug}?mode=prices`)}>Atur harga</button><button className="secondary-button" type="button" onClick={() => navigate(`/master-harga/${catalog.slug}?mode=items`)}>Tambah / Hapus Item</button><button className="secondary-button" type="button" onClick={() => navigate(`/master-harga/${catalog.slug}?mode=mappings`)}>Pemetaan item</button><button className="primary-button" type="button" onClick={() => navigate("/calculator")}>Gunakan di kalkulator</button></div>
    </article>)}</div>
  </section>;
}
