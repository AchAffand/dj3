import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { AppPageState } from "../../app/AppPageState";
import { formatRupiah } from "../../app/format";
import { useAppServices } from "../../app/AppServices";
import { useAuth } from "../../auth/AuthProvider";
import { calculateBudget } from "../../domain/budgets/calculateBudget";
import { calculateExpression } from "../../domain/formulas/evaluate";
import type { BudgetCatalogDetail, BudgetEstimate } from "../../domain/budgets/types";
import { validateBudgetPriceFormula } from "../../domain/budgets/priceFormula";
import { normalizeMaterialKey } from "../../domain/budgets/pricing";

const today = () => new Date().toISOString().slice(0, 10);
const initial = (detail: BudgetCatalogDetail, authorLabel = ""): BudgetEstimate => ({
  catalogId: detail.catalog.id, projectName: "", location: "", floor: "", reportDate: today(), authorLabel, grandTotal: 0, snapshot: {},
  lines: Array.from({ length: 21 }, (_, index) => ({ position: index + 1, description: "", unitCount: 1, quantities: {} })),
});

export function BudgetEstimatePage() {
  const { repository, isCatalogAdmin, catalog: doorModels, reloadBudgets } = useAppServices();
  const { user } = useAuth();
  const { catalogSlug = "", estimateId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [detail, setDetail] = useState<BudgetCatalogDetail | null>(null);
  const [estimate, setEstimate] = useState<BudgetEstimate | null>(null);
  const [busy, setBusy] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ componentId: string; variantKey: string; amount: string; expression: string } | null>(null);
  const [componentEditor, setComponentEditor] = useState<{ id?: string; key?: string; label: string; unit: string; category: string; groupLabel: string } | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<string | null>(null);
  const pricesMode = searchParams.get("mode") === "prices";
  const mappingsMode = searchParams.get("mode") === "mappings";
  const itemsMode = searchParams.get("mode") === "items";
  const materialOptions = useMemo(() => {
    const distinct = new Map<string, { key: string; name: string; unit: string }>();
    for (const model of doorModels.values()) for (const material of model.materials) {
      const key = normalizeMaterialKey(material.name, material.unit);
      if (!distinct.has(key)) distinct.set(key, { key, name: material.name, unit: material.unit });
    }
    return [...distinct.values()].sort((left, right) => left.name.localeCompare(right.name, "id") || left.unit.localeCompare(right.unit, "id"));
  }, [doorModels]);

  const load = useCallback(async (showBusy = true) => {
    if (!repository) { setBusy(false); return; }
    if (showBusy) setBusy(true); setError(null);
    try {
      const loaded = await repository.loadBudgetCatalog(catalogSlug);
      if (!loaded) throw new Error("Lembar anggaran tidak ditemukan.");
      setDetail(loaded);
      if (estimateId) {
        const saved = await repository.loadBudgetEstimate(estimateId);
        if (!saved || saved.catalogId !== loaded.catalog.id) throw new Error("Perkiraan tidak ditemukan.");
        setEstimate({ ...saved, lines: Array.from({ length: 21 }, (_, index) => saved.lines.find((line) => line.position === index + 1) ?? { position: index + 1, description: "", unitCount: 1, quantities: {} }) });
      } else setEstimate(initial(loaded, user?.email ?? ""));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Data anggaran gagal dibuka."); }
    finally { if (showBusy) setBusy(false); }
  }, [repository, catalogSlug, estimateId, user?.email]);
  useEffect(() => { void load(); }, [load]);

  const calculation = useMemo(() => detail && estimate ? calculateBudget(detail, estimate) : null, [detail, estimate]);
  if (busy) return <AppPageState title="Membuka anggaran" detail="Data komponen dan aturan harga sedang dimuat." />;
  if (error || !detail || !estimate) return <AppPageState title="Anggaran belum dapat dibuka" detail={error ?? "Data anggaran tidak tersedia."} tone="error" actionLabel="Coba lagi" onAction={() => void load()} />;
  const changeLine = (position: number, patch: Partial<BudgetEstimate["lines"][number]>) => setEstimate((current) => current ? { ...current, lines: current.lines.map((line) => line.position === position ? { ...line, ...patch } : line) } : current);
  const saveEstimate = async () => {
    if (!repository || !calculation || !estimate.projectName.trim()) { setMessage("Isi Nama Project terlebih dahulu."); return; }
    setSaving(true); setMessage(null);
    try {
      const saved = await repository.saveBudgetEstimate({ ...estimate, grandTotal: calculation.grandTotal, snapshot: { catalogLabel: detail.catalog.label, components: detail.components, variants: detail.variants, rules: detail.rules } }, calculation.lines.map((line) => ({ position: line.position, subtotal: line.subtotal, resultSnapshot: { components: line.components } })));
      navigate(`/master-harga/${catalogSlug}/estimates/${saved.id}`, { replace: true }); setMessage("Perkiraan tersimpan.");
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : "Perkiraan gagal disimpan."); }
    finally { setSaving(false); }
  };
  const savePrice = async () => {
    if (!repository || !editing) return;
    const amount = editing.amount.trim() ? Number(editing.amount.replaceAll(",", "")) : null;
    if (amount !== null && (!Number.isFinite(amount) || amount < 0)) { setMessage("Masukkan harga nol atau lebih."); return; }
    if (amount === null && !editing.expression.trim()) { setMessage("Isi harga angka atau rumus."); return; }
    if (editing.expression.trim()) {
      try {
        const variables = Object.fromEntries(detail.components.flatMap((component) => detail.variants.flatMap((variant) => {
          const price = component.prices[variant.key];
          const value = price?.amount ?? (price?.expression ? calculateExpression(price.expression, {}) : null);
          return value === null ? [] : [[`price_${component.key}_${variant.key}`, value] as const];
        })));
        const validation = validateBudgetPriceFormula(editing.expression, Object.entries(variables).map(([key, value]) => ({ key, value })));
        if (validation.error) { setMessage(validation.error); return; }
      } catch (cause) { setMessage(cause instanceof Error ? cause.message : "Rumus harga tidak valid"); return; }
    }
    setMessage(null);
    setSaving(true);
    try {
      const variantId = detail.variants.find((item) => item.key === editing.variantKey)?.id;
      if (!variantId) throw new Error("Varian harga tidak ditemukan.");
      const version = await repository.saveBudgetPriceChange(editing.componentId, variantId, amount, editing.expression.trim() || null);
      const expression = editing.expression.trim() || null;
      setDetail((current) => current ? ({ ...current, components: current.components.map((component) => component.id === editing.componentId ? {
        ...component, prices: { ...component.prices, [editing.variantKey]: { amount, expression, version } },
      } : component) }) : current);
      setEditing(null); setMessage("Harga tersimpan dan versi baru tercatat.");
      void reloadBudgets?.();
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : "Harga tidak dapat disimpan."); }
    finally { setSaving(false); }
  };
  const saveComponent = async () => {
    if (!repository || !componentEditor) return;
    if (!componentEditor.label.trim() || !componentEditor.category.trim()) { setMessage("Nama item dan kelompok wajib diisi."); return; }
    const key = componentEditor.key ?? `manual_${crypto.randomUUID().replaceAll("-", "").slice(0, 16)}`;
    setSaving(true); setMessage(null);
    try {
      await repository.saveBudgetComponent({ ...componentEditor, key, catalogId: detail.catalog.id });
      setComponentEditor(null); setMessage(componentEditor.id ? "Item diperbarui." : "Item ditambahkan. Isi harganya pada menu Atur harga.");
      await load(false); await reloadBudgets?.();
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : "Item tidak dapat disimpan."); }
    finally { setSaving(false); }
  };
  const archiveComponent = async (componentId: string) => {
    if (!repository) return;
    setSaving(true); setMessage(null);
    try {
      await repository.archiveBudgetComponent(detail.catalog.id, componentId);
      setArchiveTarget(null); setMessage("Item dihapus dari daftar aktif. Proyek lama tetap menyimpan snapshot harganya.");
      await load(false); await reloadBudgets?.();
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : "Item tidak dapat dihapus."); }
    finally { setSaving(false); }
  };
  const categories = [...new Set(detail.components.map((item) => item.category))];
  const saveMapping = async (item: { key: string; name: string; unit: string }, componentId: string | null) => {
    if (!repository) return;
    setSaving(true); setMessage(null);
    try {
      await repository.saveBudgetMaterialMapping(detail.catalog.id, item.key, item.name, item.unit, componentId);
      setMessage("Pemetaan tersimpan.");
      await load(false);
      await reloadBudgets?.();
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : "Pemetaan tidak dapat disimpan."); }
    finally { setSaving(false); }
  };
  return <section className="page-content budget-page">
    <div className="page-heading-row"><div className="page-intro"><p className="eyebrow">MASTER HARGA · {detail.catalog.label.toUpperCase()}</p><h1>{mappingsMode ? "Pemetaan material" : itemsMode ? "Kelola item harga" : pricesMode ? "Atur harga komponen" : "Perkiraan pekerjaan"}</h1><p className="page-description">{mappingsMode ? "Tentukan komponen di lembar harga yang dipakai untuk setiap item kalkulator. Pemetaan bisa berbeda untuk tiap sumber harga." : itemsMode ? "Tambah, ubah, atau keluarkan item dari daftar aktif. Harga dan varian dikelola terpisah." : pricesMode ? "Ubah harga atau rumus. Perubahan disimpan sebagai versi baru dan dipakai oleh perhitungan selanjutnya." : "Masukkan jumlah tiap item pekerjaan. Total mengikuti pilihan varian harga dan aturan di lembar Excel."}</p></div>{!(pricesMode || mappingsMode || itemsMode) && <button className="secondary-button" onClick={() => navigate("/master-harga")} type="button">Kembali</button>}</div>
    {(pricesMode || mappingsMode || itemsMode) && <div className="budget-estimate-toolbar budget-mode-actions"><span>{detail.catalog.label}</span><div><button className="secondary-button" type="button" onClick={() => navigate("/master-harga")}>Kembali</button><button className="primary-button" type="button" onClick={() => navigate("/calculator")}>Gunakan di kalkulator</button></div></div>}
    {itemsMode ? <>
      {!isCatalogAdmin && <div className="notice-banner">Akun ini hanya dapat melihat item. Perubahan memerlukan hak admin katalog.</div>}
      {message && <div className="notice-banner" role="status">{message}</div>}
      <div className="budget-items-toolbar"><p>Setiap item mempunyai harga sendiri untuk semua varian katalog.</p><button className="primary-button" disabled={!isCatalogAdmin} type="button" onClick={() => { setComponentEditor({ label: "", unit: "pcs", category: "Aksesori", groupLabel: "ASSESORIS / PCS" }); setMessage(null); }}>Tambah item</button></div>
      <div className="budget-price-groups">{categories.map((category) => <section className="budget-price-group" key={category}><h2>{category}</h2><div className="budget-price-table-wrap"><table className="budget-price-table"><thead><tr><th>Item</th><th>Satuan</th><th>Kelompok</th><th>Tindakan</th></tr></thead><tbody>{detail.components.filter((component) => component.category === category).map((component) => <tr key={component.id}><td><strong>{component.label}</strong><small>{component.sourceColumn}</small></td><td>{component.unit || "-"}</td><td>{component.groupLabel || category}</td><td className="budget-item-actions"><button className="secondary-button" disabled={!isCatalogAdmin || saving} onClick={() => { setComponentEditor({ id: component.id, key: component.key, label: component.label, unit: component.unit, category: component.category, groupLabel: component.groupLabel ?? "" }); setMessage(null); }} type="button">Ubah</button>{archiveTarget === component.id ? <><button className="secondary-button" disabled={saving} onClick={() => void archiveComponent(component.id)} type="button">Ya, hapus</button><button className="secondary-button" onClick={() => setArchiveTarget(null)} type="button">Batal</button></> : <button className="secondary-button" disabled={!isCatalogAdmin || saving} onClick={() => setArchiveTarget(component.id)} type="button">Hapus</button>}</td></tr>)}</tbody></table></div></section>)}</div>
      {componentEditor && <div className="budget-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setComponentEditor(null); }}><form className="budget-modal" role="dialog" aria-modal="true" aria-labelledby="budget-component-title" onSubmit={(event) => { event.preventDefault(); void saveComponent(); }}><p className="eyebrow">{componentEditor.id ? "UBAH ITEM" : "ITEM BARU"}</p><h2 id="budget-component-title">{componentEditor.id ? "Ubah item harga" : "Tambah item harga"}</h2><label className="budget-input"><span>Nama item</span><input autoFocus required value={componentEditor.label} onChange={(event) => setComponentEditor({ ...componentEditor, label: event.target.value })} placeholder="Contoh: Rambuncis" /></label><label className="budget-input"><span>Satuan</span><input required value={componentEditor.unit} onChange={(event) => setComponentEditor({ ...componentEditor, unit: event.target.value })} placeholder="Contoh: pcs" /></label><label className="budget-input"><span>Kelompok item</span><input required value={componentEditor.category} onChange={(event) => setComponentEditor({ ...componentEditor, category: event.target.value })} placeholder="Contoh: Aksesori" /></label><label className="budget-input"><span>Judul kelompok di Excel</span><input value={componentEditor.groupLabel} onChange={(event) => setComponentEditor({ ...componentEditor, groupLabel: event.target.value })} placeholder="Contoh: ASSESORIS / PCS" /></label><div className="budget-modal-actions"><button className="secondary-button" onClick={() => setComponentEditor(null)} type="button">Batal</button><button className="primary-button" disabled={saving} type="submit">{saving ? "Menyimpan…" : "Simpan item"}</button></div></form></div>}
    </> : mappingsMode ? <>
      {!isCatalogAdmin && <div className="notice-banner">Akun ini hanya dapat melihat pemetaan. Perubahan memerlukan hak admin katalog.</div>}
      {message && <div className="notice-banner" role="status">{message}</div>}
      <div className="budget-price-table-wrap"><table className="budget-price-table"><thead><tr><th>Item kalkulator</th><th>Satuan</th><th>Komponen sumber harga</th></tr></thead><tbody>{materialOptions.map((item) => {
        const mapping = detail.mappings.find((entry) => entry.materialKey === item.key && entry.active);
        const mappedComponent = detail.components.some((component) => component.id === mapping?.componentId) ? mapping?.componentId ?? "" : "";
        return <tr key={item.key}><td><strong>{item.name}</strong></td><td>{item.unit || "-"}</td><td><select aria-label={`Komponen harga untuk ${item.name}`} disabled={!isCatalogAdmin || saving} value={mappedComponent} onChange={(event) => void saveMapping(item, event.target.value || null)}><option value="">Tidak dipetakan · isi manual di kalkulator</option>{detail.components.map((component) => <option key={component.id} value={component.id}>{component.label}</option>)}</select></td></tr>;
      })}</tbody></table></div>
    </> : pricesMode ? <>
      {!isCatalogAdmin && <div className="notice-banner">Akun ini hanya dapat melihat harga. Perubahan harga memerlukan hak admin katalog.</div>}
      {message && <div className="notice-banner" role="status">{message}</div>}
      <div className="budget-price-groups">{categories.map((category) => <section className="budget-price-group" key={category}><h2>{category}</h2><div className="budget-price-table-wrap"><table className="budget-price-table"><thead><tr><th>Item</th><th>Satuan</th>{detail.variants.map((variant) => <th key={variant.id}>{variant.label}</th>)}</tr></thead><tbody>{detail.components.filter((item) => item.category === category).map((component) => <tr key={component.id}><td><strong>{component.label}</strong><small>{component.groupLabel || component.sourceColumn}</small></td><td>{component.unit || "-"}</td>{detail.variants.map((variant) => { const price = component.prices[variant.key]; return <td key={variant.id}><button className="budget-price-value" disabled={!isCatalogAdmin} onClick={() => { setEditing({ componentId: component.id, variantKey: variant.key, amount: price?.amount === null || price?.amount === undefined ? "" : String(price.amount), expression: price?.expression ?? "" }); setMessage(null); }} type="button">{price?.amount !== null && price?.amount !== undefined ? formatRupiah(price.amount) : price?.expression ? `ƒ ${price.expression}` : "Belum diisi"}</button></td>; })}</tr>)}</tbody></table></div></section>)}</div>
      {editing && <div className="budget-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setEditing(null); }}><form className="budget-modal" role="dialog" aria-modal="true" aria-labelledby="budget-price-title" onSubmit={(event) => { event.preventDefault(); void savePrice(); }}><p className="eyebrow">UBAH HARGA</p><h2 id="budget-price-title">{detail.components.find((item) => item.id === editing.componentId)?.label} · {detail.variants.find((item) => item.key === editing.variantKey)?.label}</h2><label className="budget-input"><span>Harga angka</span><input autoFocus value={editing.amount} onChange={(event) => setEditing({ ...editing, amount: event.target.value, expression: "" })} inputMode="decimal" placeholder="Contoh: 117000" /></label><label className="budget-input"><span>Atau rumus fleksibel</span><input value={editing.expression} onChange={(event) => setEditing({ ...editing, expression: event.target.value, amount: "" })} placeholder="Contoh: price_col_j_base * 1.05" /></label><p className="budget-help">Rumus memakai operator +, -, ×, ÷ dan kurung. Variabel harga memakai nama seperti <code>price_col_j_base</code>.</p><div className="budget-modal-actions"><button className="secondary-button" onClick={() => setEditing(null)} type="button">Batal</button><button className="primary-button" disabled={saving} type="submit">{saving ? "Menyimpan…" : "Simpan harga"}</button></div></form></div>}
    </> : <>
      <div className="budget-project-fields"><label className="budget-input"><span>Nama Project</span><input value={estimate.projectName} onChange={(event) => setEstimate({ ...estimate, projectName: event.target.value })} placeholder="Contoh: Rumah Pak Budi" /></label><label className="budget-input"><span>Lokasi</span><input value={estimate.location} onChange={(event) => setEstimate({ ...estimate, location: event.target.value })} /></label><label className="budget-input"><span>Lantai</span><input value={estimate.floor} onChange={(event) => setEstimate({ ...estimate, floor: event.target.value })} /></label><label className="budget-input"><span>Tanggal</span><input type="date" value={estimate.reportDate} onChange={(event) => setEstimate({ ...estimate, reportDate: event.target.value })} /></label></div>
      <div className="budget-estimate-toolbar"><span>{estimateId ? "Mengedit perkiraan tersimpan" : "Perkiraan baru"}</span><div><button className="secondary-button" onClick={() => navigate(`/master-harga/${catalogSlug}?mode=prices`)} type="button">Daftar harga</button><button className="primary-button" disabled={saving} onClick={() => void saveEstimate()} type="button">{saving ? "Menyimpan…" : "Simpan perkiraan"}</button></div></div>
      {message && <div className="notice-banner">{message}</div>}
      <div className="budget-line-groups">{categories.map((category) => <section className="budget-line-group" key={category}><h2>{category}</h2><div className="budget-lines">{detail.components.filter((item) => item.category === category).map((component) => {
        const positions = detail.rules.filter((rule) => rule.componentId === component.id).map((rule) => rule.linePosition);
        const lines = [...new Set(positions)].map((position) => estimate.lines.find((line) => line.position === position)!).filter(Boolean);
        return <div className="budget-line-card" key={component.id}><div className="budget-line-title"><strong>{component.label}</strong><span>{component.unit || "-"}</span></div>{lines.length ? lines.map((line) => { const result = calculation?.lines.find((item) => item.position === line.position); const componentResult = result?.components.find((item) => item.componentId === component.id); return <label className="budget-quantity-field" key={line.position}><span>Item {line.position} <small>{detail.variants.find((variant) => variant.id === detail.rules.find((rule) => rule.linePosition === line.position && rule.componentId === component.id)?.variantId)?.label}</small></span><input inputMode="decimal" value={line.quantities[component.id] ?? ""} onChange={(event) => changeLine(line.position, { quantities: { ...line.quantities, [component.id]: event.target.value === "" ? 0 : Number(event.target.value) } })} placeholder="0" /><small>{componentResult?.amount !== null && componentResult?.amount !== undefined ? formatRupiah(componentResult.amount * line.unitCount) : componentResult?.error ?? "—"}</small></label>; }) : <p className="budget-no-rule">Belum ada rumus sumber untuk komponen ini.</p>}</div>;
      })}</div></section>)}</div>
      <aside className="budget-total-card"><div><p className="eyebrow">RINGKASAN</p><h2>Grand total</h2><small>{calculation?.errors.length ? `${calculation.errors.length} harga perlu dilengkapi` : "Semua rumus yang aktif berhasil dihitung."}</small></div><strong>{formatRupiah(calculation?.grandTotal ?? 0)}</strong></aside>
    </>}
  </section>;
}
