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
    {(() => {
      const aluminiumCatalogs = catalogs.filter((catalog) => !["kaca-umum", "aksesoris-umum"].includes(catalog.slug));
      const glassCatalog = catalogs.find((catalog) => catalog.slug === "kaca-umum");
      const accessoryCatalog = catalogs.find((catalog) => catalog.slug === "aksesoris-umum");
      const groups = [
        { key: "aluminium", title: "Aluminium", description: "Kelola harga berdasarkan merek aluminium: Alexindo, HPM / INKA / DACON, dan YKK.", catalogs: aluminiumCatalogs },
        { key: "accessories", title: "Aksesoris", description: "Satu kelompok harga aksesoris yang digunakan lintas merek dan dipilih per TYPE.", catalogs: accessoryCatalog ? [accessoryCatalog] : [] },
        { key: "glass", title: "Kaca", description: "Satu kelompok harga kaca yang digunakan lintas merek dan dipilih per TYPE.", catalogs: glassCatalog ? [glassCatalog] : [] },
      ];
      return <div className="budget-catalog-grid budget-main-groups">{groups.map((group) => <article className="budget-catalog-card budget-main-group-card" key={group.key}>
        <div><p className="eyebrow">KELOMPOK MASTER HARGA</p><h2>{group.title}</h2><p>{group.description}</p></div>
        {group.key === "aluminium" ? <div className="budget-card-actions budget-brand-actions">{group.catalogs.map((catalog) => <button className="secondary-button" type="button" key={catalog.id} onClick={() => navigate(`/master-harga/${catalog.slug}?mode=prices`)}>{catalog.label}</button>)}</div>
          : group.catalogs.length ? <div className="budget-card-actions"><button className="primary-button" type="button" onClick={() => navigate(`/master-harga/${group.catalogs[0].slug}?mode=prices`)}>Kelola {group.title}</button><button className="secondary-button" type="button" onClick={() => navigate(`/master-harga/${group.catalogs[0].slug}?mode=items`)}>Tambah / Hapus Item</button><button className="secondary-button" type="button" onClick={() => navigate(`/master-harga/${group.catalogs[0].slug}?mode=mappings`)}>Pemetaan item</button></div>
          : <p className="notice-banner">Katalog {group.title} belum tersedia.</p>}
      </article>)}</div>;
    })()}
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
