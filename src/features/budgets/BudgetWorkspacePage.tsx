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
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedCatalogIds, setSelectedCatalogIds] = useState<string[]>([]);
  const [deletingCatalogs, setDeletingCatalogs] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteSuccess, setDeleteSuccess] = useState<string | null>(null);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
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
  const toggleCatalogSelection = (id: string) => {
    setSelectedCatalogIds((current) => current.includes(id)
      ? current.filter((item) => item !== id)
      : [...current, id]);
  };
  const deleteSelectedCatalogs = async () => {
    if (!repository || !selectedCatalogIds.length || deletingCatalogs) return;
    const selectedNames = catalogs
      .filter((catalog) => selectedCatalogIds.includes(catalog.id))
      .map((catalog) => catalog.label);
    setDeletingCatalogs(true);
    setDeleteError(null);
    setDeleteSuccess(null);
    try {
      await repository.archiveBudgetCatalogs(selectedCatalogIds);
      setSelectedCatalogIds([]);
      setSelectionMode(false);
      setConfirmDeleteOpen(false);
      setDeleteSuccess(`${selectedNames.length} merek berhasil diarsipkan dari daftar aktif.`);
      await load();
    } catch (cause) {
      setDeleteError(cause instanceof Error ? cause.message : "Merek yang dipilih gagal diarsipkan.");
    } finally {
      setDeletingCatalogs(false);
    }
  };
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
    <div className="page-heading-row"><div className="page-intro"><p className="eyebrow">ANGGARAN KUSEN</p><h1>Master Harga</h1><p className="page-description">Kelola tarif Excel, tentukan pemetaan item, lalu gunakan otomatis saat menghitung proyek kusen.</p></div>{isCatalogAdmin && <div className="budget-catalog-toolbar">{selectionMode && <button className="secondary-button" type="button" onClick={() => setSelectedCatalogIds(catalogs.filter((item) => !["hpm-inka-dacon", "kaca-umum", "aksesoris-umum"].includes(item.slug)).map((item) => item.id))}>Pilih semua</button>}<button className="secondary-button" type="button" onClick={() => { setSelectionMode((current) => !current); setSelectedCatalogIds([]); setDeleteError(null); setDeleteSuccess(null); }}>{selectionMode ? "Batal pilih" : "Pilih untuk arsipkan"}</button><button className="primary-button" type="button" onClick={() => { setBrandError(null); setShowBrandForm(true); }}>+ Tambah Merk</button></div>}</div>
    {selectionMode && <div className="budget-selection-toolbar"><span>{selectedCatalogIds.length} merek dipilih</span><button className="budget-bulk-delete-button" type="button" disabled={!selectedCatalogIds.length || deletingCatalogs} onClick={() => setConfirmDeleteOpen(true)}>{`Arsipkan Terpilih (${selectedCatalogIds.length})`}</button></div>}
    {deleteSuccess && <div className="notice-banner" role="status">{deleteSuccess}</div>}
    {deleteError && <div className="notice-banner error" role="alert">{deleteError}</div>}
    {[
      { title: "Aluminium", items: catalogs.filter((catalog) => !["kaca-umum", "aksesoris-umum"].includes(catalog.slug)) },
      { title: "Aksesoris", items: catalogs.filter((catalog) => catalog.slug === "aksesoris-umum") },
      { title: "Kaca", items: catalogs.filter((catalog) => catalog.slug === "kaca-umum") },
    ].filter((group) => group.items.length > 0).map((group) => <section className="budget-catalog-section" key={group.title}>
      <div className="section-title-row"><h2>{group.title}</h2></div>
      <div className="budget-catalog-grid">{group.items.map((catalog) => <article className={`budget-catalog-card${selectionMode && selectedCatalogIds.includes(catalog.id) ? " is-selected" : ""}`} style={selectionMode && selectedCatalogIds.includes(catalog.id) ? { outline: "2px solid var(--color-primary, #2563eb)", outlineOffset: 2 } : undefined} key={catalog.id}>
      {selectionMode && <label className="budget-catalog-select"><input type="checkbox" checked={selectedCatalogIds.includes(catalog.id)} disabled={["hpm-inka-dacon", "kaca-umum", "aksesoris-umum"].includes(catalog.slug)} onChange={() => toggleCatalogSelection(catalog.id)} /><span>{catalog.slug === "hpm-inka-dacon" ? "Template utama (dilindungi)" : ["kaca-umum", "aksesoris-umum"].includes(catalog.slug) ? "Kelompok utama (dilindungi)" : "Pilih merek"}</span></label>}
      <div><p className="eyebrow">LEMBAR {String(catalog.position).padStart(2,"0")}</p><h2>{catalog.label}</h2><p>Harga, rumus, dan perhitungan untuk katalog ini.</p></div>
      {!selectionMode && <div className="budget-card-actions"><button className="secondary-button" type="button" onClick={() => navigate(`/master-harga/${catalog.slug}?mode=prices`)}>Atur harga</button><button className="secondary-button" type="button" onClick={() => navigate(`/master-harga/${catalog.slug}?mode=items`)}>Tambah / Hapus Item</button><button className="secondary-button" type="button" onClick={() => navigate(`/master-harga/${catalog.slug}?mode=mappings`)}>Pemetaan item</button><button className="primary-button" type="button" onClick={() => navigate("/calculator")}>Gunakan di kalkulator</button></div>}
    </article>)}</div>
    </section>)}
    {confirmDeleteOpen && <div className="budget-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !deletingCatalogs) setConfirmDeleteOpen(false); }}>
      <div className="budget-modal" role="dialog" aria-modal="true" aria-labelledby="confirm-delete-catalog-title">
        <p className="eyebrow">KONFIRMASI ARSIP</p>
        <h2 id="confirm-delete-catalog-title">Arsipkan merek terpilih?</h2>
        <p>Merek berikut akan disembunyikan dari daftar Master Harga aktif:</p>
        <ul className="budget-delete-list">{catalogs.filter((catalog) => selectedCatalogIds.includes(catalog.id)).map((catalog) => <li key={catalog.id}>{catalog.label}</li>)}</ul>
        <p className="budget-delete-help">Katalog hanya diarsipkan, bukan dihapus permanen. Riwayat perkiraan dan referensi proyek lama tetap aman. Nomor lembar yang sudah tidak aktif dapat digunakan kembali oleh merek baru. Template HPM / INKA / DACON dilindungi.</p>
        <div className="budget-modal-actions">
          <button className="secondary-button" type="button" disabled={deletingCatalogs} onClick={() => setConfirmDeleteOpen(false)}>Batal</button>
          <button className="budget-bulk-delete-button" type="button" disabled={deletingCatalogs} onClick={() => void deleteSelectedCatalogs()}>{deletingCatalogs ? "Mengarsipkan…" : "Ya, arsipkan merek"}</button>
        </div>
      </div>
    </div>}
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
