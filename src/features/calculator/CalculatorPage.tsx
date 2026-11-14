import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import type { Project } from "../../domain/projects/types";
import { modelGroupLabel } from "../../domain/catalog/types";
import { calculateModel } from "../../domain/formulas/calculateModel";
import { AppPageState } from "../../app/AppPageState";
import { formatRupiah } from "../../app/format";
import { useAppServices } from "../../app/AppServices";
import { aggregateMaterials } from "../recap/aggregateMaterials";
import { MaterialRecap } from "../recap/MaterialRecap";
import { createProjectService, type ProjectDraft, type ProjectLineDraft } from "../projects/projectService";
import { ModelLineEditor } from "./ModelLineEditor";
import { accessoryPriceOptions, budgetPriceForMaterial, excelColumnFromNumber, isAccessoryMaterial, isDoorLeafMaterial, isGlassMaterial, isTatapanMaterial, normalizeMaterialDisplayName } from "../../domain/budgets/pricing";
import type { BudgetCatalogDetail } from "../../domain/budgets/types";

function makeLine(modelCode: number): ProjectLineDraft {
  return {
    id: typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : createMaterialItemId(),
    modelCode,
    inputs: {},
    count: 1,
  };
}

function createMaterialItemId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (character) => {
    const random = Math.floor(Math.random() * 16);
    return (character === "x" ? random : (random & 0x3) | 0x8).toString(16);
  });
}

function priceMap(project: Project): Record<string, number | null | undefined> {
  const result: Record<string, number | null | undefined> = {};
  for (const price of project.prices) {
    if (price.catalogId && price.variantId) {
      const legacyKey = `${price.catalogId}:${price.variantId}:${price.materialCode}`;
      result[legacyKey] = price.unitPrice;
      if (price.componentId) result[`${legacyKey}:${price.componentId}`] = price.unitPrice;
    } else {
      result[`manual:${price.materialCode}`] = price.unitPrice;
    }
  }
  return result;
}

export function CalculatorPage() {
  const { repository, catalog, loadingCatalog, catalogError, reloadCatalog, budgetCatalogs = [], budgetError, loadingBudgets, reloadBudgets } = useAppServices();
  const budgetDetails = useAppServices().budgetDetails ?? new Map<string, BudgetCatalogDetail>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const projectId = searchParams.get("project");
  const catalogModels = useMemo(() => [...catalog.values()].sort((a, b) => a.code - b.code), [catalog]);
  const models = useMemo(() => catalogModels.filter((model) => model.active !== false), [catalogModels]);
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
  const [modelSearch, setModelSearch] = useState("");
  const modelSearchResults = useMemo(() => {
    const query = modelSearch.trim().toLocaleLowerCase("id-ID");
    if (!query) return [];
    return models.filter((model) =>
      [String(model.code), model.name, modelGroupLabel(model.groupCode, model.groupName)]
        .some((value) => value.toLocaleLowerCase("id-ID").includes(query)),
    ).slice(0, 12);
  }, [modelSearch, models]);

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
        result.set(id, {
          ...line.resultSnapshot,
          items: line.resultSnapshot.items.map((item) => ({
            ...item,
            name: normalizeMaterialDisplayName(item.name),
          })),
        });
        continue;
      }
      const model = catalog.get(line.modelCode);
      if (model) {
        const calculated = calculateModel(model, line.inputs, catalog);
        result.set(id, {
          items: calculated.items.map((item) => ({
            materialCode: item.code,
            name: normalizeMaterialDisplayName(item.name),
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

  const accessoryCatalog = budgetCatalogs.find((item) => item.slug === "aksesoris-umum");
  const glassCatalog = budgetCatalogs.find((item) => item.slug === "kaca-umum");
  const accessoryDetail = accessoryCatalog ? budgetDetails.get(accessoryCatalog.id) : undefined;
  const glassDetail = glassCatalog ? budgetDetails.get(glassCatalog.id) : undefined;

  const resolvedLines = useMemo(() => draft.lines.map((line) => {
    const materials = (results.get(line.id ?? `${line.modelCode}`)?.items ?? []).map((material) => {
      const formulaMaterial = catalog.get(line.modelCode)?.materials.find((item) => item.code === material.materialCode);
      const brandDetail = line.priceCatalogId ? budgetDetails.get(line.priceCatalogId) : undefined;
      const doorLeafColumn = typeof line.inputs.__doorLeafSourceColumn === "number"
        ? String.fromCharCode(64 + line.inputs.__doorLeafSourceColumn)
        : null;
      const accessoryColumnValue = line.inputs[`__budgetAccessory_${material.materialCode}`];
      const accessoryColumn = typeof accessoryColumnValue === "number"
        ? excelColumnFromNumber(accessoryColumnValue)
        : accessoryPriceOptions(accessoryDetail, material.name)[0]?.sourceColumn ?? null;
      const glassColumnValue = line.inputs[`__budgetGlass_${material.materialCode}`];
      const glassColumn = typeof glassColumnValue === "number" ? excelColumnFromNumber(glassColumnValue) : null;
      const tatapanColumnValue = line.inputs[`__budgetTatapan_${material.materialCode}`];
      const tatapanColumn = typeof tatapanColumnValue === "number" ? excelColumnFromNumber(tatapanColumnValue) : null;
      const windowColumn = typeof line.inputs.__windowSourceColumn === "number"
        ? excelColumnFromNumber(line.inputs.__windowSourceColumn)
        : null;
      const useGlassCatalog = Boolean(formulaMaterial && isGlassMaterial(formulaMaterial) && glassColumn && glassDetail);
      const useAccessoryCatalog = Boolean(formulaMaterial && isAccessoryMaterial(formulaMaterial)
        && accessoryDetail && accessoryPriceOptions(accessoryDetail, material.name).length);
      const priceDetail = useGlassCatalog ? glassDetail
        : useAccessoryCatalog ? accessoryDetail
        : brandDetail;
      const sharedVariantId = priceDetail?.catalog.slug === "kaca-umum" || priceDetail?.catalog.slug === "aksesoris-umum"
        ? priceDetail.variants[0]?.id
        : line.priceVariantId;
      const mapped = budgetPriceForMaterial(
        priceDetail,
        material.materialCode,
        material.name,
        material.unit,
        sharedVariantId,
        formulaMaterial && isDoorLeafMaterial(formulaMaterial) ? doorLeafColumn : null,
        useAccessoryCatalog ? accessoryColumn : null,
        /^jendela$/i.test(material.name.trim()) ? windowColumn : null,
        useGlassCatalog ? glassColumn : null,
        formulaMaterial && isTatapanMaterial(formulaMaterial) ? tatapanColumn : null,
      );
      const variant = priceDetail?.variants.find((item) => item.id === sharedVariantId);
      const legacyPriceKey = brandDetail && line.priceVariantId
        ? `${brandDetail.catalog.id}:${line.priceVariantId}:${material.materialCode}`
        : `manual:${material.materialCode}`;
      const legacyOverride = draft.prices[legacyPriceKey];
      const hasExplicitComponentSelection = Boolean(
        (formulaMaterial && isAccessoryMaterial(formulaMaterial) && typeof accessoryColumnValue === "number")
        || (formulaMaterial && isGlassMaterial(formulaMaterial) && typeof glassColumnValue === "number")
        || (formulaMaterial && isDoorLeafMaterial(formulaMaterial) && typeof line.inputs.__doorLeafSourceColumn === "number")
        || (formulaMaterial && isTatapanMaterial(formulaMaterial) && typeof tatapanColumnValue === "number")
        || (/^jendela$/i.test(material.name.trim()) && typeof line.inputs.__windowSourceColumn === "number")
      );
      const preserveLegacyOverride = !hasExplicitComponentSelection
        && typeof legacyOverride === "number" && Number.isFinite(legacyOverride);
      return {
        ...material,
        priceKey: mapped?.priceKey ?? legacyPriceKey,
        catalogId: priceDetail && variant ? priceDetail.catalog.id : null,
        variantId: variant?.id ?? null,
        unitPrice: preserveLegacyOverride ? legacyOverride : mapped?.unitPrice ?? null,
        priceVersion: mapped?.priceVersion ?? null,
        expressionSnapshot: mapped?.expressionSnapshot ?? null,
        componentId: mapped?.componentId ?? null,
        priceSourceLabel: priceDetail && variant ? `${priceDetail.catalog.label} · ${variant.label}` : "Harga manual",
      };
    });
    return { lineId: line.id ?? `${line.modelCode}`, modelCount: line.count, materials };
  }), [accessoryDetail, budgetDetails, catalog, draft.lines, draft.prices, glassDetail, results]);

  const recap = useMemo(() => aggregateMaterials(
    resolvedLines.map(({ materials, modelCount }) => ({ materials, modelCount })),
    draft.prices,
  ), [draft.prices, resolvedLines]);
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

  function addModelLine(modelCode = models[0]?.code) {
    if (modelCode === undefined) return;
    setDraft((current) => ({ ...current, lines: [...current.lines, makeLine(modelCode)] }));
    setModelSearch("");
  }

  async function saveCurrentProject(andPrint = false) {
    if (!projectService) return;
    setSaving(true);
    setMessage(null);
    try {
      const lines = draft.lines.map((line) => {
        const resolved = resolvedLines.find((item) => item.lineId === (line.id ?? `${line.modelCode}`));
        const existing = line.materialItems ?? [];
        const formulaItems = (resolved?.materials ?? []).map((material, position) => {
          const previous = existing.find((item) => item.sourceType === "formula" && item.formulaMaterialCode === material.materialCode);
          const configuredPrice = draft.prices[material.priceKey];
          const effectiveUnitPrice = typeof configuredPrice === "number" && Number.isFinite(configuredPrice)
            ? configuredPrice
            : material.unitPrice;
          const unitPriceSnapshot = typeof effectiveUnitPrice === "number" && Number.isFinite(effectiveUnitPrice) && effectiveUnitPrice >= 0
            ? effectiveUnitPrice
            : null;
          return {
            id: previous?.id ?? createMaterialItemId(),
            sourceType: "formula" as const,
            formulaMaterialCode: material.materialCode,
            masterItemId: previous?.masterItemId ?? null,
            selectedBrandId: previous?.selectedBrandId ?? null,
            selectedVariantId: previous?.selectedVariantId ?? null,
            quantity: material.quantity,
            unitSnapshot: material.unit,
            itemNameSnapshot: material.name,
            groupNameSnapshot: previous?.groupNameSnapshot ?? null,
            brandNameSnapshot: previous?.brandNameSnapshot ?? null,
            variantNameSnapshot: previous?.variantNameSnapshot ?? null,
            unitPriceSnapshot,
            priceVersionSnapshot: typeof material.priceVersion === "number" && Number.isInteger(material.priceVersion) && material.priceVersion > 0
              ? material.priceVersion
              : null,
            priceIsSet: unitPriceSnapshot !== null,
            position,
          };
        });
        return { ...line, materialItems: [...formulaItems, ...existing.filter((item) => item.sourceType === "manual")] };
      });
      const saved = await projectService.saveProject({ ...draft, lines, recap });
      setDraft({
        id: saved.project.id,
        name: saved.project.name,
        location: saved.project.location ?? "",
        floor: saved.project.floor ?? "",
        lines: saved.project.lines,
        prices: priceMap(saved.project),
      });
      setSearchParams(new URLSearchParams({ project: saved.project.id }), { replace: true });
      if (andPrint) {
        navigate(`/projects/${saved.project.id}/print`);
        return;
      }
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
        <div className="page-heading-actions">
          {draft.id && (
            <button className="secondary-button" type="button" onClick={() => void saveCurrentProject(true)} disabled={saving || !draft.name.trim() || !draft.lines.length}>
              {saving ? <><span className="button-spinner" />Menyimpan…</> : "Simpan & Cetak PDF"}
            </button>
          )}
          <button className="primary-button save-project-button" type="button" onClick={() => void saveCurrentProject()} disabled={saving || !draft.name.trim() || !draft.lines.length}>
            <span aria-hidden="true">↥</span>{saving ? <><span className="button-spinner" />Menyimpan…</> : "Simpan proyek"}
          </button>
        </div>
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
          <div className="calculator-model-search-panel">
            <label className="calculator-model-search">
              <span className="calculator-model-search-icon" aria-hidden="true">⌕</span>
              <input
                type="search"
                aria-label="Cari model kusen"
                placeholder="Cari kode atau nama model kusen..."
                value={modelSearch}
                onChange={(event) => setModelSearch(event.target.value)}
              />
              {modelSearch && <button className="calculator-model-search-clear" type="button" aria-label="Hapus pencarian" onClick={() => setModelSearch("")}>×</button>}
            </label>
            {modelSearch.trim() && <div className="calculator-model-search-results" role="listbox" aria-label="Hasil pencarian model kusen">
              {modelSearchResults.length ? modelSearchResults.map((model) => (
                <button className="calculator-model-search-result" type="button" role="option" aria-selected="false" key={model.code} onClick={() => addModelLine(model.code)}>
                  <strong>{model.code} · {model.name}</strong>
                  <span>{modelGroupLabel(model.groupCode, model.groupName)} · Tambahkan ke perhitungan</span>
                </button>
              )) : <p className="calculator-model-search-empty">Model kusen tidak ditemukan.</p>}
            </div>}
          </div>
          {draft.lines.length ? (
            <ModelLineEditor
              lines={draft.lines}
              models={catalogModels}
              results={results}
              onChange={updateLine}
              onRemove={removeLine}
              budgetCatalogs={budgetCatalogs}
              budgetDetails={budgetDetails}
            />
          ) : (
            <div className="empty-models"><strong>Belum ada model</strong><p>Tambahkan setidaknya satu model pintu untuk mulai menghitung.</p></div>
          )}
          <button className="add-model-button" type="button" onClick={() => addModelLine()} disabled={!models.length}><span>＋</span> Tambah model</button>
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