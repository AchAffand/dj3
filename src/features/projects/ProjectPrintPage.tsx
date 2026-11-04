import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AppPageState } from "../../app/AppPageState";
import { formatDate, formatQuantity, formatRupiah } from "../../app/format";
import { modelGroupLabel } from "../../domain/catalog/types";
import type { Project } from "../../domain/projects/types";
import { useAppServices } from "../../app/AppServices";
import { useAuth } from "../../auth/AuthProvider";

export function ProjectPrintPage() {
  const { projectId = "" } = useParams();
  const navigate = useNavigate();
  const { repository, catalog, budgetCatalogs = [], budgetDetails } = useAppServices();
  const { user } = useAuth();
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    if (!repository) {
      setError("Koneksi database belum tersedia.");
      setLoading(false);
      return () => { active = false; };
    }
    setLoading(true);
    setError(null);
    void repository.loadProject(projectId).then((loaded) => {
      if (active) {
        setProject(loaded);
        if (!loaded) setError("Proyek tidak ditemukan atau tidak dapat dibuka.");
      }
    }).catch((cause) => {
      if (active) setError(cause instanceof Error ? cause.message : "Laporan proyek tidak dapat dibuka.");
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [projectId, repository]);

  const recap = useMemo(() => {
    if (!project) return [];
    const catalogNames = new Map(budgetCatalogs.map((item) => [item.id, item.label]));
    const materialTotals = new Map<string, {
      groupCode: number;
      type: string;
      materialCode: number;
      name: string;
      unit: string;
      quantity: number;
      unitPrice: number | null;
      priceSource: string;
      modelCodes: number[];
      doorLeafType: string | null;
    }>();
    for (const line of project.lines) {
      const model = catalog.get(line.modelCode);
      const groupCode = model?.groupCode ?? 0;
      const type = modelGroupLabel(groupCode, model?.groupName).toUpperCase();
      const selectedDoorLeafColumn = typeof line.inputs.__doorLeafSourceColumn === "number"
        ? String.fromCharCode(64 + line.inputs.__doorLeafSourceColumn)
        : null;
      const selectedDoorLeafType = line.priceCatalogId && selectedDoorLeafColumn
        ? budgetDetails?.get(line.priceCatalogId)?.components.find((component) => component.sourceColumn === selectedDoorLeafColumn)?.label ?? null
        : null;
      for (const material of line.resultSnapshot.items) {
        const isDoorLeaf = /daun pintu/i.test(material.name) && ["unit", "daun"].includes(material.unit.trim().toLocaleLowerCase("id-ID"));
        const doorLeafType = isDoorLeaf ? selectedDoorLeafType : null;
        const linePrice = line.priceCatalogId && line.priceVariantId
          ? project.prices.find((price) => price.materialCode === material.materialCode && price.catalogId === line.priceCatalogId && price.variantId === line.priceVariantId)
          : project.prices.find((price) => price.materialCode === material.materialCode && !price.catalogId);
        const key = `${groupCode}:${material.materialCode}:${material.unit}:${line.priceCatalogId ?? "manual"}:${line.priceVariantId ?? ""}:${doorLeafType ?? ""}`;
        const previous = materialTotals.get(key);
        if (previous) {
          previous.quantity += material.quantity * line.count;
          if (!previous.modelCodes.includes(line.modelCode)) previous.modelCodes.push(line.modelCode);
        }
        else materialTotals.set(key, {
          groupCode,
          type,
          materialCode: material.materialCode,
          name: material.name,
          unit: material.unit,
          quantity: material.quantity * line.count,
          unitPrice: linePrice?.unitPrice ?? null,
          priceSource: line.priceCatalogId
            ? `${catalogNames.get(line.priceCatalogId) ?? "Master Harga"}${budgetDetails?.get(line.priceCatalogId)?.variants.find((variant) => variant.id === line.priceVariantId)?.label ? ` · ${budgetDetails.get(line.priceCatalogId)?.variants.find((variant) => variant.id === line.priceVariantId)?.label}` : ""}`
            : "Harga manual",
          modelCodes: [line.modelCode],
          doorLeafType,
        });
      }
    }
    return [...materialTotals.values()]
      .sort((left, right) => left.groupCode - right.groupCode || left.materialCode - right.materialCode)
      .map((row) => {
        const unitPrice = row.unitPrice;
        return {
          ...row,
          unitPrice,
          subtotal: unitPrice === null ? null : Math.round(row.quantity * unitPrice * 100) / 100,
        };
      });
  }, [budgetCatalogs, budgetDetails, catalog, project]);
  const total = recap.reduce((sum, row) => sum + (row.subtotal ?? 0), 0);
  const missingPriceCount = recap.filter((row) => row.unitPrice === null).length;
  const reportTypes = project
    ? [...new Set(project.lines.map((line) => { const model = catalog.get(line.modelCode); return modelGroupLabel(model?.groupCode ?? 0, model?.groupName).toUpperCase(); }))]
    : [];
  const reportType = reportTypes.length ? reportTypes.join(" / ") : "PINTU";
  const authorName = typeof user?.user_metadata.full_name === "string" && user.user_metadata.full_name.trim()
    ? user.user_metadata.full_name.trim()
    : user?.email ?? "DJ3 Engineering";
  const reportDate = formatDate(new Date().toISOString());

  if (loading) return <AppPageState title="Menyiapkan laporan" detail="Data proyek sedang dimuat." />;
  if (error || !project) {
    return <AppPageState title="Laporan belum dapat dibuka" detail={error ?? "Proyek tidak ditemukan."} tone="error" actionLabel="Kembali ke proyek" onAction={() => navigate("/projects")} />;
  }

  return (
    <section className="page-content project-print-page">
      <div className="print-actions">
        <button className="secondary-button" type="button" onClick={() => navigate("/projects")}>Kembali ke proyek</button>
        <button className="secondary-button" type="button" onClick={() => navigate(`/calculator?project=${encodeURIComponent(project.id)}`)}>Edit perhitungan</button>
        <button className="primary-button" type="button" onClick={() => window.print()}>Cetak / Simpan PDF</button>
      </div>

      <article className="project-report">
        <header className="project-report-header">
          <div className="excel-recap-title-row">
            <h1>REKAP PEKERJAAN {reportType}</h1>
            <strong>Dibuat : {authorName}</strong>
          </div>
          <div className="excel-recap-meta-row">
            <dl className="excel-recap-project-meta">
              <div><dt>Project</dt><dd>{project.name}</dd></div>
              <div><dt>Lokasi</dt><dd>{project.location?.trim() || <i className="recap-fill-line" aria-label="Isian lokasi kosong" />}</dd></div>
              <div><dt>Lantai</dt><dd>{project.floor?.trim() || <i className="recap-fill-line short" aria-label="Isian lantai kosong" />}</dd></div>
            </dl>
            <p>Tgl: {reportDate}</p>
          </div>
        </header>

        <section className="excel-recap-table-section" aria-label="Rekap kebutuhan material">
          <div className="report-table-wrap">
            <table className="report-table excel-recap-table">
              <colgroup><col /><col /><col /><col /><col /><col /><col /></colgroup>
              <thead><tr><th>TYPE</th><th>ITEM</th><th>QTY</th><th>HARG SAT</th><th>SATUAN</th><th>SUB TOTAL</th><th>GRAND TOTAL</th></tr></thead>
              <tbody>{recap.length ? recap.map((row, index) => (
                <tr key={`${row.groupCode}-${row.materialCode}-${row.unit}`}>
                  <td>{index === 0 || recap[index - 1].groupCode !== row.groupCode ? <>{row.type}<small>{row.modelCodes.join(", ")}</small></> : ""}</td>
                  <td>{row.name}<small>{row.doorLeafType ? `${row.doorLeafType} · ` : ""}{row.materialCode} · {row.priceSource}</small></td>
                  <td>{formatQuantity(row.quantity)}</td>
                  <td>{row.unitPrice === null ? "—" : formatRupiah(row.unitPrice)}</td>
                  <td>{row.unit}</td>
                  <td>{row.subtotal === null ? "—" : formatRupiah(row.subtotal)}</td>
                </tr>
              )) : <tr><td colSpan={7}>Belum ada kebutuhan material</td></tr>}
              <tr className="grand-total-row"><td className="grand-total-spacer" colSpan={6} /><td className="grand-total-merged"><strong className="grand-total-value">{formatRupiah(total)}</strong></td></tr>
              </tbody>
            </table>
          </div>
          {missingPriceCount > 0 && <p className="report-warning">{missingPriceCount} harga satuan belum diisi; total belum mencakup material tersebut.</p>}
        </section>
      </article>
    </section>
  );
}
