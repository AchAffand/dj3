import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AppPageState } from "../../app/AppPageState";
import { formatQuantity, formatRupiah } from "../../app/format";
import { useAppServices } from "../../app/AppServices";
import { calculateBudget } from "../../domain/budgets/calculateBudget";
import type { BudgetCatalogDetail, BudgetEstimate } from "../../domain/budgets/types";

export function BudgetPrintPage() {
  const { repository } = useAppServices();
  const { catalogSlug = "", estimateId = "" } = useParams();
  const navigate = useNavigate();
  const [detail, setDetail] = useState<BudgetCatalogDetail | null>(null);
  const [estimate, setEstimate] = useState<BudgetEstimate | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    if (!repository) return;
    try {
      const [catalog, saved] = await Promise.all([repository.loadBudgetCatalog(catalogSlug), repository.loadBudgetEstimate(estimateId)]);
      if (!catalog || !saved || saved.catalogId !== catalog.catalog.id) throw new Error("Perkiraan tidak ditemukan.");
      setDetail(catalog); setEstimate(saved);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Laporan tidak dapat dibuka."); }
  }, [repository, catalogSlug, estimateId]);
  useEffect(() => { void load(); }, [load]);
  const reportDetail = useMemo(() => {
    if (!detail || !estimate?.snapshot.components || !estimate.snapshot.variants || !estimate.snapshot.rules) return detail;
    return { ...detail, components: estimate.snapshot.components as BudgetCatalogDetail["components"], variants: estimate.snapshot.variants as BudgetCatalogDetail["variants"], rules: estimate.snapshot.rules as BudgetCatalogDetail["rules"] };
  }, [detail, estimate]);
  const calculation = useMemo(() => reportDetail && estimate ? calculateBudget(reportDetail, estimate) : null, [reportDetail, estimate]);
  if (error) return <AppPageState title="Laporan belum dapat dibuka" detail={error} tone="error" />;
  if (!detail || !reportDetail || !estimate || !calculation) return <AppPageState title="Menyusun laporan" detail="Menyiapkan rincian material dan harga." />;
  return <section className="budget-print-page"><div className="budget-print-actions"><button className="secondary-button" onClick={() => navigate(`/master-harga/${catalogSlug}/estimates/${estimateId}`)} type="button">Kembali ke edit</button><button className="primary-button" onClick={() => window.print()} type="button">Cetak / Simpan PDF</button></div><article className="budget-report"><header><div className="budget-report-title"><strong>REKAP PEKERJAAN KUSEN</strong><span>Dibuat : {estimate.authorLabel || "DJ3 Engineering"}</span></div><div className="budget-report-meta"><div><span>Nama Project</span><b>{estimate.projectName}</b><span>Lokasi</span><b>{estimate.location || "-"}</b><span>Lantai</span><b>{estimate.floor || "-"}</b></div><span>Tgl: {estimate.reportDate}</span></div></header><table className="budget-report-table"><thead><tr><th>NO</th><th>ITEM PEKERJAAN</th><th>QTY</th><th>HARGA SAT</th><th>SATUAN</th><th>SUB TOTAL</th></tr></thead><tbody>{estimate.lines.map((line) => {
    const result = calculation.lines.find((item) => item.position === line.position)!;
    return reportDetail.components.map((component, index) => {
      const itemResult = result.components.find((item) => item.componentId === component.id)!;
      if (!line.quantities[component.id]) return null;
      return <tr key={`${line.position}-${component.id}`}><td>{index === 0 ? `KUSEN ${line.position}` : ""}</td><td>{component.label} <small>{component.sourceColumn}</small></td><td>{formatQuantity(itemResult.quantity * line.unitCount)}</td><td>{itemResult.unitRate === null ? "Belum diisi" : formatRupiah(itemResult.unitRate)}</td><td>{component.unit || "-"}</td><td>{itemResult.amount === null ? "Belum diisi" : formatRupiah(itemResult.amount * line.unitCount)}</td></tr>;
    });
  })}<tr className="budget-report-total"><td colSpan={5}>GRAND TOTAL</td><td>{formatRupiah(calculation.grandTotal)}</td></tr></tbody></table>{calculation.errors.length > 0 && <div className="notice-banner">{calculation.errors.join(" · ")}</div>}</article></section>;
}
