import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { AppPageState } from "../../app/AppPageState";
import { useAppServices } from "../../app/AppServices";
import type { BudgetCatalog } from "../../domain/budgets/types";

export function BudgetWorkspacePage() {
  const { repository, isCatalogAdmin } = useAppServices();
  const navigate = useNavigate();
  const [catalogs, setCatalogs] = useState<BudgetCatalog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newBrandName, setNewBrandName] = useState("");
  const [showBrandForm, setShowBrandForm] = useState(false);
  const [creatingBrand, setCreatingBrand] = useState(false);
  const [brandError, setBrandError] = useState<string | null>(null);
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
  const createBrand = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!repository || !newBrandName.trim()) return;
    const slug = newBrandName.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
      .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    if (!slug) { setBrandError("Nama merk tidak dapat dijadikan kode katalog."); return; }
    setCreatingBrand(true); setBrandError(null);
    try {
      await repository.createBudgetCatalog(newBrandName.trim(), slug);
      setNewBrandName(""); setShowBrandForm(false);
      await load();
    } catch (cause) {
      setBrandError(cause instanceof Error ? cause.message : "Merek baru gagal dibuat.");
    } finally { setCreatingBrand(false); }
  };
  if (loading) return <AppPageState title="Memuat Master Harga" detail="Katalog dan perkiraan sedang dibuka." />;
  if (error) return <AppPageState title="Master Harga belum dapat dimuat" detail={error} tone="error" actionLabel="Coba lagi" onAction={() => void load()} />;
  return <section className="page-content">
    <div className="page-heading-row"><div className="page-intro"><p className="eyebrow">ANGGARAN KUSEN</p><h1>Master Harga</h1><p className="page-description">Kelola tarif Excel, tentukan pemetaan item, lalu gunakan otomatis saat menghitung proyek kusen.</p></div>{isCatalogAdmin && <button className="primary-button" type="button" onClick={() => { setBrandError(null); setShowBrandForm(true); }}>+ Tambah Merk</button>}</div>
    <div className="budget-catalog-grid">{catalogs.map((catalog) => <article className="budget-catalog-card" key={catalog.id}>
      <div><p className="eyebrow">LEMBAR {String(catalog.position).padStart(2,"0")}</p><h2>{catalog.label}</h2><p>Harga, rumus, dan perhitungan untuk katalog ini.</p></div>
      <div className="budget-card-actions"><button className="secondary-button" type="button" onClick={() => navigate(`/master-harga/${catalog.slug}?mode=prices`)}>Atur harga</button><button className="secondary-button" type="button" onClick={() => navigate(`/master-harga/${catalog.slug}?mode=items`)}>Tambah / Hapus Item</button><button className="secondary-button" type="button" onClick={() => navigate(`/master-harga/${catalog.slug}?mode=mappings`)}>Pemetaan item</button><button className="primary-button" type="button" onClick={() => navigate("/calculator")}>Gunakan di kalkulator</button></div>
    </article>)}</div>
    {showBrandForm && <div className="budget-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !creatingBrand) setShowBrandForm(false); }}>
      <form className="budget-modal" role="dialog" aria-modal="true" aria-labelledby="new-budget-brand-title" onSubmit={(event) => void createBrand(event)}>
        <p className="eyebrow">MASTER HARGA</p>
        <h2 id="new-budget-brand-title">Tambah merk baru</h2>
        <p>Masukkan nama merk yang ingin kamu gunakan. Item, kategori, varian, rumus, dan pemetaan akan disalin dari template HPM / INKA / DACON. Harga tiap item tetap kosong agar bisa kamu isi sesuai merk baru.</p>
        <label htmlFor="new-budget-brand-name">Nama merk</label>
        <input id="new-budget-brand-name" autoFocus value={newBrandName} onChange={(event) => setNewBrandName(event.target.value)} placeholder="Masukkan nama merk" maxLength={80} required />
        {brandError && <div className="notice-banner" role="alert">{brandError}</div>}
        <div className="formula-modal-actions">
          <button className="secondary-button" type="button" disabled={creatingBrand} onClick={() => setShowBrandForm(false)}>Batal</button>
          <button className="primary-button" type="submit" disabled={creatingBrand || !newBrandName.trim()}>{creatingBrand ? "Menyimpan…" : "Simpan Merk"}</button>
        </div>
      </form>
    </div>}
  </section>;
}
