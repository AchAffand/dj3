import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AppPageState } from "../../app/AppPageState";
import { formatQuantity, formatRupiah } from "../../app/format";
import { modelGroupLabel } from "../../domain/catalog/types";
import type { Project } from "../../domain/projects/types";
import { useAppServices } from "../../app/AppServices";
import { budgetPriceForMaterial, excelColumnFromNumber } from "../../domain/budgets/pricing";

function romanMonth(dateValue?: string) {
  const date = dateValue ? new Date(dateValue) : new Date();
  const month = Number.isNaN(date.getTime()) ? new Date().getMonth() + 1 : date.getMonth() + 1;
  return ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"][month - 1];
}

function todayForInput() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

export function ProjectPrintPage() {
  const { projectId = "" } = useParams();
  const navigate = useNavigate();
  const { repository, catalog, budgetCatalogs = [], budgetDetails } = useAppServices();
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [projectSequence, setProjectSequence] = useState<number | null>(null);
  const [letterDate, setLetterDate] = useState(todayForInput);
  const [customerName, setCustomerName] = useState("");
  const [projectLocation, setProjectLocation] = useState("");

  useEffect(() => {
    let active = true;
    if (!repository) {
      setError("Koneksi database belum tersedia.");
      setLoading(false);
      return () => { active = false; };
    }
    setLoading(true);
    setError(null);
    void Promise.all([repository.loadProject(projectId), repository.listProjects()]).then(([loaded, projects]) => {
      if (active) {
        setProject(loaded);
        if (loaded) {
          setCustomerName(loaded.name ?? "");
          setProjectLocation(loaded.location ?? "");
        }
        if (!loaded) {
          setError("Proyek tidak ditemukan atau tidak dapat dibuka.");
          return;
        }
        const ordered = projects.map((item) => ({ id: item.id, createdAt: item.createdAt }));
        if (!ordered.some((item) => item.id === loaded.id)) {
          ordered.push({ id: loaded.id, createdAt: loaded.createdAt ?? new Date().toISOString() });
        }
        ordered.sort((left, right) => {
          const leftTime = new Date(left.createdAt).getTime();
          const rightTime = new Date(right.createdAt).getTime();
          return leftTime - rightTime || left.id.localeCompare(right.id);
        });
        setProjectSequence(1001 + ordered.findIndex((item) => item.id === loaded.id));
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
      const type = `${modelGroupLabel(groupCode, model?.groupName).toUpperCase()} ${line.modelCode}`;
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
        const currentMaterial = model?.materials.find((item) => item.code === material.materialCode);
        const displayName = currentMaterial?.name ?? material.name;
        const detail = line.priceCatalogId ? budgetDetails?.get(line.priceCatalogId) : undefined;
        const variant = detail?.variants.find((item) => item.id === line.priceVariantId);
        const materialKey = `${displayName.trim().toLocaleLowerCase("id-ID")}|${material.unit.trim().toLocaleLowerCase("id-ID")}`;
        const mapping = detail?.mappings.find((item) => item.active && item.materialKey === materialKey);
        const mappedComponent = mapping?.componentId ? detail?.components.find((component) => component.id === mapping.componentId) : undefined;
        const windowColumn = typeof line.inputs.__windowSourceColumn === "number"
          ? excelColumnFromNumber(line.inputs.__windowSourceColumn)
          : null;
        const selectedWindowPrice = /^jendela$/i.test(displayName.trim()) && windowColumn
          ? budgetPriceForMaterial(detail, material.materialCode, displayName, material.unit, line.priceVariantId, null, null, windowColumn)
          : null;
        const selectedWindowComponent = windowColumn
          ? detail?.components.find((component) => component.sourceColumn === windowColumn)
          : undefined;
        const currentMasterPrice = selectedWindowPrice?.unitPrice
          ?? (variant && mappedComponent ? mappedComponent.prices[variant.key]?.amount ?? null : null);
        // A legacy project snapshot is keyed only by material/catalog/variant. For
        // window components the line-level selection is authoritative, not that shared snapshot.
        const resolvedUnitPrice = selectedWindowPrice
          ? selectedWindowPrice.unitPrice
          : typeof linePrice?.unitPrice === "number" && Number.isFinite(linePrice.unitPrice)
            ? linePrice.unitPrice
            : currentMasterPrice;
        const printedName = selectedWindowComponent?.label
          ?? (mappedComponent?.category.toLocaleLowerCase("id-ID") === "aksesori" ? mappedComponent.label : displayName);
        const key = `${groupCode}:${line.modelCode}:${material.materialCode}:${material.unit}:${line.priceCatalogId ?? "manual"}:${line.priceVariantId ?? ""}:${doorLeafType ?? ""}:${selectedWindowComponent?.id ?? ""}`;
        const previous = materialTotals.get(key);
        if (previous) {
          previous.quantity += material.quantity * line.count;
          if (!previous.modelCodes.includes(line.modelCode)) previous.modelCodes.push(line.modelCode);
        } else materialTotals.set(key, {
          groupCode,
          type,
          materialCode: material.materialCode,
          name: printedName,
          unit: material.unit,
          quantity: material.quantity * line.count,
          unitPrice: resolvedUnitPrice,
          priceSource: line.priceCatalogId
            ? `${catalogNames.get(line.priceCatalogId) ?? "Master Harga"}${budgetDetails?.get(line.priceCatalogId)?.variants.find((variant) => variant.id === line.priceVariantId)?.label ? ` · ${budgetDetails.get(line.priceCatalogId)?.variants.find((variant) => variant.id === line.priceVariantId)?.label}` : ""}`
            : "Harga manual",
          modelCodes: [line.modelCode],
          doorLeafType,
        });
      }
    }
    return [...materialTotals.values()]
      .sort((left, right) => left.groupCode - right.groupCode || left.modelCodes[0] - right.modelCodes[0] || left.materialCode - right.materialCode)
      .map((row) => ({
        ...row,
        subtotal: row.unitPrice === null ? null : Math.round(row.quantity * row.unitPrice * 100) / 100,
      }));
  }, [budgetCatalogs, budgetDetails, catalog, project]);

  const total = recap.reduce((sum, row) => sum + (row.subtotal ?? 0), 0);
  const missingPriceCount = recap.filter((row) => row.unitPrice === null).length;
  const formattedLetterDate = letterDate
    ? new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(letterDate + "T00:00:00"))
    : "-";

  if (loading) return <AppPageState title="Menyiapkan laporan" detail="Data proyek sedang dimuat." />;
  if (error || !project) {
    return <AppPageState title="Laporan belum dapat dibuka" detail={error ?? "Proyek tidak ditemukan."} tone="error" actionLabel="Kembali ke proyek" onAction={() => navigate("/projects")} />;
  }

  const projectCreatedAt = project.createdAt ?? letterDate;
  const projectCreatedDate = new Date(projectCreatedAt);
  const letterNumber = String(projectSequence ?? 1001) + "/DJ3/" + romanMonth(projectCreatedAt) + "/" + (Number.isNaN(projectCreatedDate.getTime()) ? new Date().getFullYear() : projectCreatedDate.getFullYear());

  return (
    <section className="page-content project-print-page">
      <div className="print-actions">
        <button className="secondary-button" type="button" onClick={() => navigate("/projects")}>Kembali ke proyek</button>
        <button className="secondary-button" type="button" onClick={() => navigate(`/calculator?project=${encodeURIComponent(project.id)}`)}>Edit perhitungan</button>
        <button className="primary-button" type="button" onClick={() => window.print()}>Cetak / Simpan PDF</button>
      </div>

      <article className="project-report">
        <div className="project-report-orange-rule" aria-hidden="true" />
        <header className="quotation-header">
          <div className="quotation-top">
            <div className="quotation-brand">
              <img src="/dj3-engineering-letter-logo.jpg" alt="DJ3 Engineering" />
              <div className="quotation-project-details">
                <label>
                  <span>Nama customer</span>
                  <input aria-label="Nama customer" className="print-editable" value={customerName} onChange={(event) => setCustomerName(event.target.value)} />
                  <span className="print-only">{customerName || "-"}</span>
                </label>
                <label>
                  <span>Lokasi</span>
                  <input aria-label="Lokasi proyek" className="print-editable" value={projectLocation} onChange={(event) => setProjectLocation(event.target.value)} />
                  <span className="print-only">{projectLocation || "-"}</span>
                </label>
              </div>
            </div>
            <dl className="quotation-letter-meta">
              <div><dt>No</dt><dd><span aria-label="Nomor surat">{letterNumber}</span></dd></div>
              <div><dt>Tanggal</dt><dd><input aria-label="Tanggal surat" type="date" className="print-editable date-editable" value={letterDate} onChange={(event) => setLetterDate(event.target.value)} /><span className="print-only">{formattedLetterDate}</span></dd></div>
            </dl>
          </div>
        </header>

        <section className="quotation-table-section" aria-label="Rencana anggaran biaya proyek">
          <table className="quotation-table">
            <colgroup><col /><col /><col /><col /><col /><col /><col /></colgroup>
            <thead>
              <tr>
                <th>TYPE</th><th>ITEM</th><th>QTY</th><th>HARGA SAT</th><th>SATUAN</th><th>SUB TOTAL</th><th>GRAND TOTAL</th>
              </tr>
            </thead>
            <tbody>
              {recap.length ? recap.map((row, index) => {
                const isFirstRowOfModel = index === 0
                  || recap[index - 1].groupCode !== row.groupCode
                  || recap[index - 1].modelCodes[0] !== row.modelCodes[0];
                return (
                <tr key={`${row.groupCode}-${row.modelCodes[0]}-${row.materialCode}-${row.unit}-${index}`}>
                  <td>{isFirstRowOfModel ? (row.type === "LAINNYA" ? "Lain-lain" : row.type.charAt(0) + row.type.slice(1).toLowerCase()) : ""}</td>
                  <td>{row.name}</td>
                  <td>{formatQuantity(row.quantity)}</td>
                  <td>{row.unitPrice === null ? "—" : formatRupiah(row.unitPrice)}</td>
                  <td>{row.unit}</td>
                  <td>{row.subtotal === null ? "—" : formatRupiah(row.subtotal)}</td>
                  <td />
                </tr>
              );}) : <tr><td colSpan={7}>Belum ada rincian pekerjaan</td></tr>}
              <tr className="quotation-grand-total">
                <th colSpan={6}>GRAND TOTAL</th>
                <th>{formatRupiah(total)}</th>
              </tr>
            </tbody>
          </table>
          {missingPriceCount > 0 && <p className="report-warning">{missingPriceCount} harga satuan belum diisi; total sementara hanya menjumlahkan item yang memiliki harga.</p>}
        </section>

      </article>
    </section>
  );
}

