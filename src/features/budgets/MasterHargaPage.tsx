import { useCallback, useEffect, useState } from "react";
import { AppPageState } from "../../app/AppPageState";
import { useAppServices } from "../../app/AppServices";
import type { MasterPriceEntry, MasterPriceGroup } from "../../domain/budgets/types";

const rupiah = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 });
const formatPrice = (price: MasterPriceEntry | undefined) => {
  if (!price) return "—";
  if (price.amount !== null) return rupiah.format(price.amount);
  return price.expression ? `ƒ ${price.expression}` : "Belum diisi";
};

export function MasterHargaPage() {
  const { repository, isCatalogAdmin } = useAppServices();
  const [groups, setGroups] = useState<MasterPriceGroup[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!repository) { setLoading(false); return; }
    setLoading(true);
    setError(null);
    try {
      const rows = await repository.listMasterPriceGroups();
      setGroups(rows);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Master Harga belum dapat dimuat.");
    } finally {
      setLoading(false);
    }
  }, [repository]);

  useEffect(() => { void load(); }, [load]);

  const activeGroup = selectedGroup
    ? (() => {
        const base = groups.find((group) => group.key === selectedGroup);
        if (!base) return null;
        if (selectedGroup !== "aluminium") return base;
        return { ...base, items: groups.filter((group) => ["aluminium", "jendela", "pintu"].includes(group.key)).flatMap((group) => group.items) };
      })()
    : null;
  const totalItems = groups.reduce((sum, group) => sum + group.items.length, 0);

  if (loading) return <AppPageState title="Memuat Master Harga" detail="Membaca daftar item dan harga." />;
  if (error) return <AppPageState title="Master Harga belum dapat dimuat" detail={error} tone="error" actionLabel="Coba lagi" onAction={() => void load()} />;

  const homeGroups = [
    { key: "aluminium", title: "Aluminium", description: "Kelola harga aluminium mengikuti susunan merek dan finishing pada Excel.", dataKeys: ["aluminium", "jendela", "pintu"], actions: ["Kelola Item", "Hapus Kelompok"] },
    { key: "aksesoris", title: "Aksesoris", description: "Satu kelompok harga aksesoris yang digunakan lintas merek dan dipilih per TYPE.", dataKeys: ["aksesoris"], actions: ["Kelola Aksesoris", "Tambah / Hapus Item", "Pemetaan item"] },
    { key: "kaca", title: "Kaca", description: "Satu kelompok harga kaca yang digunakan lintas merek dan dipilih per TYPE.", dataKeys: ["kaca"], actions: ["Kelola Kaca", "Tambah / Hapus Item", "Pemetaan item"] },
  ];
  const groupItems = activeGroup?.items ?? [];
  const isAluminium = activeGroup?.key === "aluminium";

  return <section className="page-content">
    <div className="page-heading-row">
      <div className="page-intro">
        <p className="eyebrow">ANGGARAN KUSEN</p>
        <h1>Master Harga</h1>
        <p className="page-description">Kelola tarif Excel, tentukan pemetaan item, lalu gunakan otomatis saat menghitung proyek kusen.</p>
      </div>
      <div className="budget-catalog-toolbar">
        <span className="budget-list-total">{totalItems} item dari workbook 2026</span>
      </div>
    </div>

    {activeGroup ? <>
      <div className="page-heading-row">
        <div className="page-intro">
          <p className="eyebrow">MASTER HARGA · {activeGroup.label.toUpperCase()}</p>
          <h1>Kelola Item {activeGroup.label}</h1>
          <p className="page-description">Data bersumber dari workbook Master Harga 2026.</p>
        </div>
        <button className="secondary-button" type="button" onClick={() => setSelectedGroup(null)}>Kembali</button>
      </div>
      {isAluminium ? <div className="budget-price-groups budget-excel-layout">
        {Array.from(groupItems.reduce((brands, item) => {
          for (const price of item.prices) {
            const key = price.brandKey ?? "umum";
            if (!brands.has(key)) brands.set(key, { label: price.brandLabel ?? "Umum", items: new Map<string, MasterPriceGroup["items"][number]>() });
            brands.get(key)!.items.set(item.id, item);
          }
          return brands;
        }, new Map<string, { label: string; items: Map<string, MasterPriceGroup["items"][number]> }>() )).map(([brandKey, brand]) => {
          const items = Array.from(brand.items.values());
          const variants = Array.from(new Map(items.flatMap((item) => item.prices.filter((p) => p.brandKey === brandKey).map((p) => [p.variantKey ?? "standar", p.variantLabel ?? "Standar"] as const))).entries());
          return <section className="budget-price-group" key={brandKey}>
            <h2>{brand.label}</h2>
            <div className="budget-price-table-wrap">
              <table className="budget-price-table budget-price-matrix">
                <thead><tr><th>Varian / Finishing</th>{items.map((item) => <th key={item.id}><strong>{item.label}</strong><small>{item.unit || "—"}</small></th>)}</tr></thead>
                <tbody>{variants.map(([variantKey, variantLabel]) => <tr key={variantKey}><th scope="row">{variantLabel}</th>{items.map((item) => {
                  const price = item.prices.find((p) => p.brandKey === brandKey && (p.variantKey ?? "standar") === variantKey);
                  return <td key={item.id}><span className="budget-price-value">{formatPrice(price)}</span></td>;
                })}</tr>)}</tbody>
              </table>
            </div>
          </section>;
        })}
      </div> : <section className="budget-price-group">
        <div className="budget-price-table-wrap">
          <table className="budget-price-table">
            <thead><tr><th>Nama item</th><th>Satuan</th><th>Varian / Finishing</th><th>Harga</th><th>Sumber Excel</th></tr></thead>
            <tbody>{groupItems.flatMap((item) => item.prices.length ? item.prices.map((price) => <tr key={price.id}>
              <td><strong>{item.label}</strong></td><td>{item.unit || "—"}</td><td>{price.variantLabel ?? "—"}</td><td>{formatPrice(price)}</td><td>{item.sourceSheet ?? "—"} · {price.sourceCell ?? item.sourceCell ?? "—"}</td>
            </tr>) : [<tr key={item.id}><td><strong>{item.label}</strong></td><td>{item.unit || "—"}</td><td>—</td><td>—</td><td>{item.sourceSheet ?? "—"}</td></tr>])}</tbody>
          </table>
        </div>
      </section>}
    </> : <div className="budget-catalog-grid budget-main-groups">
      {homeGroups.map((group) => {
        const count = groups.filter((item) => group.dataKeys.includes(item.key)).reduce((sum, item) => sum + item.items.length, 0);
        return <article className="budget-catalog-card budget-main-group-card" key={group.key}>
          <div>
            <p className="eyebrow">KELOMPOK MASTER HARGA</p>
            <h2>{group.title}</h2>
            <p>{group.description}</p>
          </div>
          <div className="budget-card-actions">
            <button className="primary-button" type="button" onClick={() => setSelectedGroup(group.key)}>{group.actions[0]}{count ? ` · ${count}` : ""}</button>
            {group.key === "aluminium" ? <button className="secondary-button" type="button" disabled={!isCatalogAdmin} onClick={() => window.alert("Penghapusan kelompok akan disediakan setelah aturan arsip Master Harga baru ditetapkan.")}>Hapus Kelompok</button> :
              <><button className="secondary-button" type="button" onClick={() => setSelectedGroup(group.key)}>{group.actions[1]}</button><button className="secondary-button" type="button" onClick={() => setSelectedGroup(group.key)}>{group.actions[2]}</button></>}
          </div>
        </article>;
      })}
    </div>}
  </section>;
}
