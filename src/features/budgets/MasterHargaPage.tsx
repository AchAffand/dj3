import { useCallback, useEffect, useMemo, useState, type ChangeEvent } from "react";
import { AppPageState } from "../../app/AppPageState";
import { useAppServices } from "../../app/AppServices";
import type { MasterPriceGroup, MasterPriceWorkbookPayload } from "../../domain/budgets/types";

const rupiah = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0,
});

function priceLabel(amount: number | null, expression: string | null): string {
  if (amount !== null) return rupiah.format(amount);
  return expression ? `ƒ ${expression}` : "Belum diisi";
}

export function MasterHargaPage() {
  const { repository, isCatalogAdmin } = useAppServices();
  const [groups, setGroups] = useState<MasterPriceGroup[]>([]);
  const [selectedGroup, setSelectedGroup] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!repository) { setLoading(false); return; }
    setLoading(true);
    setError(null);
    try {
      const rows = await repository.listMasterPriceGroups();
      setGroups(rows);
      setSelectedGroup((current) => rows.some((group) => group.key === current) ? current : rows[0]?.key ?? "");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Master Harga baru belum dapat dimuat.");
    } finally {
      setLoading(false);
    }
  }, [repository]);

  useEffect(() => { void load(); }, [load]);

  const activeGroup = groups.find((group) => group.key === selectedGroup) ?? groups[0];
  const visibleRows = useMemo(() => {
    const rows: { key: string; item: MasterPriceGroup["items"][number]; price: MasterPriceEntry | null }[] = [];
    if (!activeGroup) return rows;
    const term = search.trim().toLocaleLowerCase("id-ID");
    for (const item of activeGroup.items) {
      if (term && ![item.label, item.unit, item.sourceSheet, item.sourceCell].some((value) => value?.toLocaleLowerCase("id-ID").includes(term))) continue;
      if (!item.prices.length) rows.push({ key: item.id, item, price: null });
      else for (const price of item.prices) rows.push({ key: price.id, item, price });
    }
    return rows;
  }, [activeGroup, search]);

  const importWorkbook = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !repository) return;
    setImporting(true);
    setError(null);
    setNotice(null);
    try {
      const parsed: unknown = JSON.parse(await file.text());
      if (!parsed || typeof parsed !== "object" || !("items" in parsed) || !Array.isArray((parsed as { items: unknown }).items)) {
        throw new Error("Format file tidak sesuai. Gunakan file JSON hasil ekstraksi workbook Master Harga 2026.");
      }
      const payload = parsed as MasterPriceWorkbookPayload;
      if (payload.version !== 1 || payload.items.length < 1 || payload.items.length > 1000) {
        throw new Error("Versi atau jumlah item pada file impor tidak valid.");
      }
      const result = await repository.importMasterHargaWorkbook(payload);
      const itemCount = Number(result.items_imported ?? payload.items.length);
      const priceCount = Number(result.prices_imported ?? 0);
      setNotice(`Impor berhasil: ${itemCount} item dan ${priceCount} harga dari ${String(payload.source_workbook ?? file.name)}. Item Master Harga lama sudah dinonaktifkan, bukan dihapus.`);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Impor workbook gagal.");
    } finally {
      setImporting(false);
    }
  };

  if (loading) return <AppPageState title="Memuat Master Harga baru" detail="Membaca item dan harga dari tabel Master Item." />;
  if (error && !groups.length) return <AppPageState title="Master Harga belum dapat dimuat" detail={error} tone="error" actionLabel="Coba lagi" onAction={() => void load()} />;

  const totalItems = groups.reduce((total, group) => total + group.items.length, 0);
  const totalPrices = groups.reduce((total, group) => total + group.items.reduce((sum, item) => sum + item.prices.length, 0), 0);

  return <section className="page-content master-price-page">
    <div className="page-heading-row">
      <div className="page-intro">
        <p className="eyebrow">SUMBER DATA MASTER BARU</p>
        <h1>Master Harga</h1>
        <p className="page-description">Daftar ini membaca langsung tabel Master Item baru. Katalog Master Harga lama tidak digunakan sebagai sumber tampilan halaman ini.</p>
      </div>
      {isCatalogAdmin && <label className="primary-button master-price-import-button">
        {importing ? "Mengimpor…" : "Impor Excel 2026"}
        <input type="file" accept=".json,application/json" disabled={importing} onChange={(event) => void importWorkbook(event)} />
      </label>}
    </div>

    <div className="master-price-summary">
      <div><span>Kelompok aktif</span><strong>{groups.length}</strong></div>
      <div><span>Item aktif</span><strong>{totalItems}</strong></div>
      <div><span>Harga aktif</span><strong>{totalPrices}</strong></div>
      <div><span>Sumber</span><strong>Workbook 2026</strong></div>
    </div>

    {notice && <div className="notice-banner" role="status">{notice}</div>}
    {error && <div className="notice-banner error" role="alert">{error}</div>}

    {!totalItems ? <div className="notice-banner">Belum ada data workbook 2026 yang diimpor. Impor file JSON hasil ekstraksi Excel untuk mengaktifkan Master Harga baru.</div> : <>
      <nav className="master-price-group-tabs" aria-label="Kelompok Master Harga">
        {groups.filter((group) => group.items.length > 0).map((group) => <button key={group.id} type="button" className={activeGroup?.id === group.id ? "active" : ""} onClick={() => setSelectedGroup(group.key)}>
          {group.label}<span>{group.items.length}</span>
        </button>)}
      </nav>
      {activeGroup && <section className="master-price-sheet">
        <div className="master-price-sheet-heading">
          <div><p className="eyebrow">LEMBAR MASTER</p><h2>{activeGroup.label}</h2><p>{activeGroup.items.length} item · {activeGroup.items.reduce((sum, item) => sum + item.prices.length, 0)} harga aktif</p></div>
          <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cari item…" aria-label="Cari item Master Harga" />
        </div>
        <div className="budget-price-table-wrap master-price-table-wrap">
          <table className="budget-price-table master-price-table">
            <thead><tr><th>Nama item</th><th>Satuan</th><th>Merek</th><th>Varian / Finishing</th><th>Harga</th><th>Sumber Excel</th></tr></thead>
            <tbody>{visibleRows.map(({ key, item, price }) => <tr key={key}>
              <td><strong>{item.label}</strong></td>
              <td>{item.unit || "—"}</td>
              <td>{price?.brandLabel ?? "Umum"}</td>
              <td>{price?.variantLabel ?? "—"}</td>
              <td className="master-price-amount">{price ? priceLabel(price.amount, price.expression) : "Belum diisi"}</td>
              <td><small>{item.sourceSheet ?? "—"}{price?.sourceCell ? ` · ${price.sourceCell}` : item.sourceCell ? ` · ${item.sourceCell}` : ""}</small></td>
            </tr>)}</tbody>
          </table>
          {!visibleRows.length && <p className="master-price-empty">Tidak ada item yang cocok dengan pencarian.</p>}
        </div>
      </section>}
    </>}
    <p className="master-price-footnote">Data lama tetap disimpan untuk referensi dan snapshot proyek historis. Mengimpor ulang workbook hanya mengganti status aktif dan versi harga pada Master Item baru.</p>
  </section>;
}
