import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import type { Project } from "../../domain/projects/types";
import { calculateModel } from "../../domain/formulas/calculateModel";
import { AppPageState } from "../../app/AppPageState";
import { formatRupiah } from "../../app/format";
import { useAppServices } from "../../app/AppServices";
import { aggregateMaterials } from "../recap/aggregateMaterials";
import { MaterialRecap } from "../recap/MaterialRecap";
import { createProjectService, type ProjectDraft, type ProjectLineDraft } from "../projects/projectService";
import { ModelLineEditor } from "./ModelLineEditor";
import { budgetPriceForMaterial } from "../../domain/budgets/pricing";
import type { BudgetCatalogDetail } from "../../domain/budgets/types";

function makeLine(modelCode: number): ProjectLineDraft {
  return {
    id: typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `line-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    modelCode,
    inputs: {},
    count: 1,
  };
}

function priceMap(project: Project): Record<string, number | null | undefined> {
  const result: Record<string, number | null | undefined> = {};
  for (const price of project.prices) result[price.catalogId && price.variantId ? `${price.catalogId}:${price.variantId}:${price.materialCode}` : `manual:${price.materialCode}`] = price.unitPrice;
  return result;
}

export function CalculatorPage() {
  const { repository, catalog, loadingCatalog, catalogError, reloadCatalog, budgetCatalogs = [], budgetError, loadingBudgets, reloadBudgets } = useAppServices();
  const budgetDetails = useAppServices().budgetDetails ?? new Map<string, BudgetCatalogDetail>();
  const [searchParams, setSearchParams] = useSearchParams();
  const projectId = searchParams.get("project");
  const models = useMemo(() => [...catalog.values()].sort((a, b) => a.code - b.code), [catalog]);
  const projectService = useMemo(
    () => repository ? createProjectService(repository, catalog) : null,
    [repository, catalog],
  );
  const routeKey = projectId ?? "new";
  const hydratedRoute = useRef<string | null>(null);
  const [draft, setDraft] = useState<ProjectDraft>({ name: "", location: "", floor: "", lines: [], prices: {} });
  const [loadingProject, setLoadingProject] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    if (loadingCatalog || !repository || !projectService || catalogError) return;
    if (hydratedRoute.current === routeKey) return;
    hydratedRoute.current = routeKey;

    if (projectId) {
      setLoadingProject(true);
      void projectService.loadProject(projectId).then((project) => {
        if (!project) {
          setMessage({ tone: "error", text: "Proyek tidak ditemukan atau tidak dapat dibuka." });
          setDraft({ name: "", location: "", floor: "", lines: models.length ? [makeLine(models[0].code)] : [], prices: {} });
          return;
        }
        setDraft({
          id: project.id,
          name: project.name,
          location: project.location ?? "",
          floor: project.floor ?? "",
          lines: project.lines,
          prices: priceMap(project),
        });
        setMessage(null);
      }).catch((error) => {
        setMessage({ tone: "error", text: error instanceof Error ? error.message : "Proyek tidak dapat dibuka." });
      }).finally(() => setLoadingProject(false));
    } else {
      setDraft({ name: "", location: "", floor: "", lines: models.length ? [makeLine(models[0].code)] : [], prices: {} });
      setMessage(null);
    }
  }, [catalogError, loadingCatalog, models, projectId, projectService, repository, routeKey]);

  const results = useMemo(() => {
    const result = new Map<string, Project["lines"][number]["resultSnapshot"]>();
    for (const line of draft.lines) {
      const id = line.id ?? `${line.modelCode}`;
      if (line.resultSnapshot) {
        result.set(id, line.resultSnapshot);
        continue;
      }
      const model = catalog.get(line.modelCode);
      if (model) {
        const calculated = calculateModel(model, line.inputs, catalog);
        result.set(id, {
          items: calculated.items.map((item) => ({
            materialCode: item.code,
            name: item.name,
            unit: item.unit,
            quantity: item.quantity,
          })),
          errors: calculated.errors,
        });
      } else {
        result.set(id, { items: [], errors: [] });
      }
    }
    return result;
  }, [catalog, draft.lines]);

  const recap = useMemo(() => aggregateMaterials(
    draft.lines.map((line) => ({
      materials: (results.get(line.id ?? `${line.modelCode}`)?.items ?? []).map((material) => {
        const detail = line.priceCatalogId ? budgetDetails.get(line.priceCatalogId) : undefined;
        const mapped = budgetPriceForMaterial(detail, material.materialCode, material.name, material.unit, line.priceVariantId);
        const variant = detail?.variants.find((item) => item.id === line.priceVariantId);
        return {
          ...material,
          priceKey: detail && variant ? `${detail.catalog.id}:${variant.id}:${material.materialCode}` : `manual:${material.materialCode}`,
          catalogId: detail && variant ? detail.catalog.id : null,
          variantId: detail && variant ? variant.id : null,
          unitPrice: mapped?.unitPrice ?? null,
          priceVersion: mapped?.priceVersion ?? null,
          expressionSnapshot: mapped?.expressionSnapshot ?? null,
          componentId: mapped?.componentId ?? null,
          priceSourceLabel: detail && variant ? `${detail.catalog.label} · ${variant.label}` : "Harga manual",
        };
      }),
      modelCount: line.count,
    })),
    draft.prices,
  ), [budgetDetails, draft.lines, draft.prices, results]);
  const total = recap.reduce((sum, row) => sum + (row.subtotal ?? 0), 0);

  const updateLine = useCallback((lineId: string, updated: ProjectLineDraft) => {
    setDraft((current) => ({
      ...current,
      lines: current.lines.map((line, index) => (line.id ?? `${line.modelCode}-${index}`) === lineId ? updated : line),
    }));
    setMessage(null);
  }, []);

  const removeLine = useCallback((lineId: string) => {
    setDraft((current) => ({
      ...current,
      lines: current.lines.filter((line, index) => (line.id ?? `${line.modelCode}-${index}`) !== lineId),
    }));
  }, []);

  function addModelLine() {
    if (!models.length) return;
    setDraft((current) => ({ ...current, lines: [...current.lines, makeLine(models[0].code)] }));
  }

  async function saveCurrentProject() {
    if (!projectService) return;
    setSaving(true);
    setMessage(null);
    try {
      const saved = await projectService.saveProject({ ...draft, recap });
      setDraft({
        id: saved.project.id,
        name: saved.project.name,
        location: saved.project.location ?? "",
        floor: saved.project.floor ?? "",
        lines: saved.project.lines,
        prices: priceMap(saved.project),
      });
      setSearchParams(new URLSearchParams({ project: saved.project.id }), { replace: true });
      setMessage({ tone: "success", text: `Perhitungan tersimpan · ${formatRupiah(saved.total)} sementara.` });
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof Error ? error.message : "Perhitungan gagal disimpan." });
    } finally {
      setSaving(false);
    }
  }

  if (loadingCatalog || loadingProject) {
    return <AppPageState title={loadingProject ? "Membuka proyek" : "Memuat katalog"} detail="Sebentar, data ruang kerja sedang disiapkan." />;
  }
  if (catalogError) {
    return <AppPageState title="Katalog belum dapat dimuat" detail={catalogError} actionLabel="Coba lagi" onAction={() => void reloadCatalog()} tone="error" />;
  }

  const snapshotCount = draft.lines.filter((line) => line.resultSnapshot).length;
  return (
    <section className="page-content">
      <div className="page-heading-row">
        <div className="page-intro">
          <p className="eyebrow">PERHITUNGAN MATERIAL</p>
          <h1>{projectId ? "Perhitungan proyek" : "Kalkulator kusen"}</h1>
          <p className="page-description">Susun model, masukkan dimensi, lalu lihat kebutuhan bahan dan estimasi biayanya.</p>
        </div>
        <button className="primary-button save-project-button" type="button" onClick={() => void saveCurrentProject()} disabled={saving || !draft.name.trim() || !draft.lines.length}>
          <span aria-hidden="true">↥</span>{saving ? <><span className="button-spinner" />Menyimpan…</> : "Simpan proyek"}
        </button>
      </div>

      <div className="project-name-panel">
        <label htmlFor="project-name"><span>Nama project</span><input id="project-name" type="text" maxLength={120} placeholder="Contoh: Rumah Pak Budi" value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} /></label>
        <label htmlFor="project-location"><span>Lokasi</span><input id="project-location" type="text" maxLength={160} placeholder="Contoh: Bandung" value={draft.location ?? ""} onChange={(event) => setDraft((current) => ({ ...current, location: event.target.value }))} /></label>
        <label htmlFor="project-floor"><span>Lantai</span><input id="project-floor" type="text" maxLength={60} placeholder="Contoh: 1" value={draft.floor ?? ""} onChange={(event) => setDraft((current) => ({ ...current, floor: event.target.value }))} /></label>
        <div className="project-name-meta"><span className="project-meta-dot" /> {projectId ? "Proyek tersimpan" : "Perhitungan baru"}{snapshotCount > 0 && <span className="snapshot-pill">Hasil tersimpan tetap</span>}</div>
      </div>

      {message && <div className={`notice-banner ${message.tone}`} role={message.tone === "error" ? "alert" : "status"}>{message.text}</div>}
      {budgetError && <div className="notice-banner error" role="alert">Master harga tidak dapat dimuat: {budgetError} <button className="secondary-button" type="button" disabled={loadingBudgets} onClick={() => void reloadBudgets?.()}>{loadingBudgets ? "Memuat…" : "Coba lagi"}</button></div>}

      <div className="calculator-layout">
        <section className="calculator-left-column">
          <div className="section-title-row"><div><p className="eyebrow">DAFTAR MODEL</p><h2>Model kusen</h2></div><span className="section-counter">{draft.lines.length} baris</span></div>
          {draft.lines.length ? (
            <ModelLineEditor
              lines={draft.lines}
              models={models}
              results={results}
              onChange={updateLine}
              onRemove={removeLine}
              budgetCatalogs={budgetCatalogs}
              budgetDetails={budgetDetails}
            />
          ) : (
            <div className="empty-models"><strong>Belum ada model</strong><p>Tambahkan setidaknya satu model pintu untuk mulai menghitung.</p></div>
          )}
          <button className="add-model-button" type="button" onClick={addModelLine} disabled={!models.length}><span>＋</span> Tambah model</button>
        </section>

        <aside className="calculator-right-column">
          <MaterialRecap
            rows={recap}
            total={total}
            onPriceChange={(priceKey, unitPrice) => setDraft((current) => ({
              ...current,
              prices: unitPrice === undefined
                ? Object.fromEntries(Object.entries(current.prices).filter(([key]) => key !== priceKey))
                : { ...current.prices, [priceKey]: unitPrice },
            }))}
          />
          <div className="calculation-footnote"><span className="footnote-icon">i</span><p>Qty mengikuti rumus master yang aktif. Proyek tersimpan mempertahankan hasil dan versi rumus saat disimpan.</p></div>
        </aside>
      </div>
    </section>
  );
}
