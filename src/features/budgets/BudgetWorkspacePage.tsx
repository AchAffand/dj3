import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { AppPageState } from "../../app/AppPageState";
import { useAppServices } from "../../app/AppServices";
import type { BudgetCatalog } from "../../domain/budgets/types";

const PROTECTED_CATALOG_SLUGS = new Set(["alexindo", "hpm-inka-dacon", "ykk", "kaca-umum", "aksesoris-umum"]);

export function BudgetWorkspacePage() {
  const { repository, isCatalogAdmin } = useAppServices();
  const navigate = useNavigate();
  const [catalogs, setCatalogs] = useState<BudgetCatalog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [brandName, setBrandName] = useState("");
  const [editingCatalog, setEditingCatalog] = useState<BudgetCatalog | null>(null);
  const [showBrandForm, setShowBrandForm] = useState(false);
  const [archivingCatalog, setArchivingCatalog] = useState<BudgetCatalog | null>(null);
  const [saving, setSaving] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: "success" | "error"; message: string } | null>(null);

  const load = useCallback(async () => {
    if (!repository) { setLoading(false); return; }
    setLoading(true);
    setError(null);
    try {
      setCatalogs(await repository.listBudgetCatalogs());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Master harga belum dapat dimuat.");
    } finally {
      setLoading(false);
    }
  }, [repository]);

  useEffect(() => { void load(); }, [load]);

  const openCreate = () => {
    setBrandName("");
    setFormError(null);
    setEditingCatalog(null);
    setShowBrandForm(true);
    setNotice(null);
  };

  const openEdit = (catalog: BudgetCatalog) => {
    setBrandName(catalog.label);
    setFormError(null);
    setEditingCatalog(catalog);
    setShowBrandForm(true);
    setNotice(null);
  };

  const closeForm = () => {
    if (saving) return;
    setEditingCatalog(null);
    setShowBrandForm(false);
    setBrandName("");
    setFormError(null);
  };

  const saveBrand = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!repository || saving) return;
    const label = brandName.trim();
    if (!label) { setFormError("Nama merk wajib diisi."); return; }
    setSaving(true);
    setFormError(null);
    setNotice(null);
    try {
      if (editingCatalog) {
        await repository.updateBudgetCatalogLabel(editingCatalog.id, label);
        setNotice({ tone: "success", message: `Nama merk berhasil diperbarui menjadi “${label}”.` });
      } else {
        const slug = label.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
          .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
        if (!slug) throw new Error("Nama merk tidak dapat dijadikan kode katalog.");
        await repository.createBudgetCatalog(label, slug);
        setNotice({ tone: "success", message: `Merk “${label}” berhasil ditambahkan ke kelompok Aluminium.` });
      }
      setEditingCatalog(null);
      setShowBrandForm(false);
      setBrandName("");
      await load();
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : "Perubahan merk gagal disimpan.");
    } finally {
      setSaving(false);
    }
  };

  const confirmArchive = async () => {
    if (!repository || !archivingCatalog || archiving) return;
    setArchiving(true);
    setNotice(null);
    try {
      await repository.archiveBudgetCatalogs([archivingCatalog.id]);
      setArchivingCatalog(null);
      setNotice({ tone: "success", message: `Merk “${archivingCatalog.label}” berhasil diarsipkan. Data dan riwayat proyek tetap disimpan.` });
      await load();
    } catch (cause) {
      setNotice({ tone: "error", message: cause instanceof Error ? cause.message : "Merk gagal diarsipkan." });
    } finally {
      setArchiving(false);
    }
  };

  if (loading) return <AppPageState title="Memuat Master Harga" detail="Katalog dan perkiraan sedang dibuka." />;
  if (error) return <AppPageState title="Master Harga belum dapat dimuat" detail={error} tone="error" actionLabel="Coba lagi" onAction={() => void load()} />;

  const aluminiumCatalogs = catalogs.filter((catalog) => !["kaca-umum", "aksesoris-umum"].includes(catalog.slug));
  const glassCatalog = catalogs.find((catalog) => catalog.slug === "kaca-umum");
  const accessoryCatalog = catalogs.find((catalog) => catalog.slug === "aksesoris-umum");

  return <section className="page-content">
    <div className="page-heading-row">
      <div className="page-intro">
        <p className="eyebrow">ANGGARAN KUSEN</p>
        <h1>Master Harga</h1>
        <p className="page-description">Kelola tarif Excel, tentukan pemetaan item, lalu gunakan otomatis saat menghitung proyek kusen.</p>
      </div>
      {isCatalogAdmin && <div className="budget-catalog-toolbar">
        <button className="primary-button" type="button" onClick={openCreate}>+ Tambah Merk</button>
      </div>}
    </div>

    {notice && <div className={`notice-banner ${notice.tone === "error" ? "error" : ""}`} role={notice.tone === "error" ? "alert" : "status"}>{notice.message}</div>}

    <div className="budget-catalog-grid budget-main-groups">
      <article className="budget-catalog-card budget-main-group-card">
        <div>
          <p className="eyebrow">KELOMPOK MASTER HARGA</p>
          <h2>Aluminium</h2>
          <p>Kelola harga berdasarkan merk aluminium. Merk tambahan akan muncul di kelompok ini.</p>
        </div>
        <div className="budget-brand-list">
          {aluminiumCatalogs.map((catalog) => {
            const protectedCatalog = PROTECTED_CATALOG_SLUGS.has(catalog.slug);
            return <div className="budget-brand-row" key={catalog.id}>
              <button className="secondary-button budget-brand-open" type="button" onClick={() => navigate(`/master-harga/${catalog.slug}?mode=prices`)}>{catalog.label}</button>
              {isCatalogAdmin && <div className="budget-brand-actions">
                {!protectedCatalog && <>
                  <button className="secondary-button" type="button" onClick={() => openEdit(catalog)}>Ubah Nama</button>
                  <button className="budget-brand-archive" type="button" onClick={() => { setArchivingCatalog(catalog); setNotice(null); }}>Arsipkan</button>
                </>}
                {protectedCatalog && <span className="budget-brand-protected">Merk utama</span>}
              </div>}
            </div>;
          })}
          {!aluminiumCatalogs.length && <p className="notice-banner">Belum ada merk Aluminium aktif.</p>}
        </div>
      </article>

      <article className="budget-catalog-card budget-main-group-card">
        <div>
          <p className="eyebrow">KELOMPOK MASTER HARGA</p>
          <h2>Aksesoris</h2>
          <p>Satu kelompok harga aksesoris yang digunakan lintas merk dan dipilih per TYPE.</p>
        </div>
        {accessoryCatalog ? <div className="budget-card-actions">
          <button className="primary-button" type="button" onClick={() => navigate(`/master-harga/${accessoryCatalog.slug}?mode=prices`)}>Kelola Aksesoris</button>
          <button className="secondary-button" type="button" onClick={() => navigate(`/master-harga/${accessoryCatalog.slug}?mode=items`)}>Tambah / Hapus Item</button>
          <button className="secondary-button" type="button" onClick={() => navigate(`/master-harga/${accessoryCatalog.slug}?mode=mappings`)}>Pemetaan item</button>
        </div> : <p className="notice-banner">Katalog Aksesoris belum tersedia.</p>}
      </article>

      <article className="budget-catalog-card budget-main-group-card">
        <div>
          <p className="eyebrow">KELOMPOK MASTER HARGA</p>
          <h2>Kaca</h2>
          <p>Satu kelompok harga kaca yang digunakan lintas merk dan dipilih per TYPE.</p>
        </div>
        {glassCatalog ? <div className="budget-card-actions">
          <button className="primary-button" type="button" onClick={() => navigate(`/master-harga/${glassCatalog.slug}?mode=prices`)}>Kelola Kaca</button>
          <button className="secondary-button" type="button" onClick={() => navigate(`/master-harga/${glassCatalog.slug}?mode=items`)}>Tambah / Hapus Item</button>
          <button className="secondary-button" type="button" onClick={() => navigate(`/master-harga/${glassCatalog.slug}?mode=mappings`)}>Pemetaan item</button>
        </div> : <p className="notice-banner">Katalog Kaca belum tersedia.</p>}
      </article>
    </div>

    {isCatalogAdmin && showBrandForm && <div className="budget-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeForm(); }}>
      <form className="budget-modal" role="dialog" aria-modal="true" aria-labelledby="budget-brand-form-title" onSubmit={(event) => void saveBrand(event)}>
        <p className="eyebrow">MASTER HARGA · ALUMINIUM</p>
        <h2 id="budget-brand-form-title">{editingCatalog ? "Ubah nama merk" : "Tambah merk baru"}</h2>
        <p>{editingCatalog ? "Nama yang ditampilkan akan berubah. Kode katalog dan tautan riwayat proyek tetap dipertahankan." : "Merk baru akan dibuat di kelompok Aluminium dengan item dan struktur harga mengikuti template HPM / INKA / DACON. Harga tetap kosong untuk diisi sendiri."}</p>
        <label htmlFor="budget-brand-name">Nama merk</label>
        <input id="budget-brand-name" autoFocus placeholder="Masukkan nama merk" value={brandName} onChange={(event) => setBrandName(event.target.value)} maxLength={80} required />
        {formError && <div className="notice-banner error" role="alert">{formError}</div>}
        <div className="budget-modal-actions">
          <button className="secondary-button" type="button" disabled={saving} onClick={closeForm}>Batal</button>
          <button className="primary-button" type="submit" disabled={saving || !brandName.trim()}>{saving ? "Menyimpan…" : editingCatalog ? "Simpan Perubahan" : "Tambah Merk"}</button>
        </div>
      </form>
    </div>}

    {isCatalogAdmin && archivingCatalog && <div className="budget-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !archiving) setArchivingCatalog(null); }}>
      <div className="budget-modal" role="dialog" aria-modal="true" aria-labelledby="budget-brand-archive-title">
        <p className="eyebrow">KONFIRMASI ARSIP</p>
        <h2 id="budget-brand-archive-title">Arsipkan merk ini?</h2>
        <p>Merk <strong>{archivingCatalog.label}</strong> akan disembunyikan dari pilihan aktif di Master Harga.</p>
        <p className="budget-delete-help">Data harga, item, pemetaan, dan snapshot proyek lama tidak dihapus. Merk utama bawaan dilindungi dari pengarsipan.</p>
        <div className="budget-modal-actions">
          <button className="secondary-button" type="button" disabled={archiving} onClick={() => setArchivingCatalog(null)}>Batal</button>
          <button className="budget-bulk-delete-button" type="button" disabled={archiving} onClick={() => void confirmArchive()}>{archiving ? "Mengarsipkan…" : "Ya, arsipkan merk"}</button>
        </div>
      </div>
    </div>}
  </section>;
}
