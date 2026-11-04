import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { modelGroupLabel, type DoorModel, type InputVariables } from "../../domain/catalog/types";
import type { FormulaVersionRecord } from "../../domain/projects/types";
import { calculateModel } from "../../domain/formulas/calculateModel";
import { parseFormula } from "../../domain/formulas/parser";
import { validateFormulaChange } from "../../domain/formulas/validateFormulaChange";
import { AppPageState } from "../../app/AppPageState";
import { formatDate, formatQuantity } from "../../app/format";
import { useAppServices } from "../../app/AppServices";
import { MaterialResults } from "../calculator/MaterialResults";
import { saveValidatedFormulaChange } from "./formulaService";

const sampleInputs: InputVariables = {
  T1: 2000,
  L1: 1754,
  T2: 500,
  L2: 500,
  T3: 1000,
  L3: 500,
  daunPintu: 2,
  daunJendela: 2,
};

const variableTokens = ["T1", "L1", "T2", "L2", "T3", "L3", "daunPintu", "daunJendela"] as const;

function formulaVariables(expression: string | null): string[] {
  if (!expression) return [];
  try {
    const visit = (node: ReturnType<typeof parseFormula>): string[] => {
      if (node.type === "variable") return [node.name];
      if (node.type === "binary") return [...visit(node.left), ...visit(node.right)];
      if (node.type === "unary") return visit(node.operand);
      return [];
    };
    return visit(parseFormula(expression));
  } catch { return []; }
}

function sampleInputsFor(model: DoorModel): InputVariables {
  const inputs: InputVariables = { ...sampleInputs };
  for (const item of model.materials) {
    for (const variable of formulaVariables(item.expression)) {
      if (inputs[variable] === undefined) inputs[variable] = 1;
    }
  }
  return inputs;
}

function formulaReferences(expression: string | null): number[] {
  if (!expression) return [];
  try {
    const visit = (node: ReturnType<typeof parseFormula>): number[] => {
      if (node.type === "quantity") return [node.materialCode];
      if (node.type === "binary") return [...visit(node.left), ...visit(node.right)];
      if (node.type === "unary") return visit(node.operand);
      return [];
    };
    return visit(parseFormula(expression));
  } catch {
    return [];
  }
}

export function FormulaMasterPage() {
  const { repository, catalog, loadingCatalog, catalogError, isCatalogAdmin, reloadCatalog } = useAppServices();
  const models = useMemo(() => [...catalog.values()].sort((a, b) => a.code - b.code), [catalog]);
  const [modelCode, setModelCode] = useState<number | null>(null);
  const [formulaSearch, setFormulaSearch] = useState("");
  const [materialCode, setMaterialCode] = useState<number | null>(null);
  const [expression, setExpression] = useState("");
  const [versions, setVersions] = useState<FormulaVersionRecord[]>([]);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [showModelForm, setShowModelForm] = useState(false);
  const [showMaterialForm, setShowMaterialForm] = useState(false);
  const [showEditMaterialForm, setShowEditMaterialForm] = useState(false);
  const [materialDraftName, setMaterialDraftName] = useState("");
  const [materialDraftUnit, setMaterialDraftUnit] = useState("");
  const [savingMaterialDetails, setSavingMaterialDetails] = useState(false);
  const [materialDetailsError, setMaterialDetailsError] = useState<string | null>(null);
  const [pendingMaterialRemoval, setPendingMaterialRemoval] = useState<DoorModel["materials"][number] | null>(null);
  const [pendingModelRemoval, setPendingModelRemoval] = useState<DoorModel | null>(null);
  const [deletingModelCode, setDeletingModelCode] = useState<number | null>(null);
  const [deletingMaterialCode, setDeletingMaterialCode] = useState<number | null>(null);
  const [newModelGroup, setNewModelGroup] = useState(20000);
  const [newModelGroupName, setNewModelGroupName] = useState("");
  const [newModelCode, setNewModelCode] = useState(20100);
  const [newModelName, setNewModelName] = useState("Model 20100");
  const [newMaterialCode, setNewMaterialCode] = useState(20101);
  const [newMaterialName, setNewMaterialName] = useState("");
  const [newMaterialUnit, setNewMaterialUnit] = useState("m'");
  const [newMaterialExpression, setNewMaterialExpression] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const formulaSearchResults = useMemo(() => {
    const query = formulaSearch.trim().toLocaleLowerCase("id-ID");
    if (!query) return [];
    return models.flatMap((model) => {
      const matchedMaterials = model.materials.filter((material) =>
        [material.name, String(material.code)].some((value) => value.toLocaleLowerCase("id-ID").includes(query)),
      );
      const modelMatches = [String(model.code), model.name, modelGroupLabel(model.groupCode, model.groupName)]
        .some((value) => value.toLocaleLowerCase("id-ID").includes(query));
      return modelMatches || matchedMaterials.length ? [{ model, matchedMaterials }] : [];
    });
  }, [formulaSearch, models]);

  function selectFormulaSearchResult(model: DoorModel, materialCodeToSelect?: number) {
    setModelCode(model.code);
    setMaterialCode(materialCodeToSelect ?? model.materials[0]?.code ?? null);
    setFormulaSearch("");
  }

  const selectedModel = modelCode === null ? undefined : catalog.get(modelCode);
  const selectedMaterial = selectedModel?.materials.find((item) => item.code === materialCode);

  const newMaterialCandidate = useMemo(() => {
    if (!selectedModel) return null;
    const material = {
      code: newMaterialCode,
      sourceCode: newMaterialCode,
      name: newMaterialName.trim() || "Material baru",
      unit: newMaterialUnit.trim() || "-",
      expression: newMaterialExpression,
      sourceCell: "Master Rumus",
      sourceFormula: null,
      sourceCachedQuantity: null,
      formulaVersion: 1,
    };
    const candidate: DoorModel = { ...selectedModel, materials: [...selectedModel.materials, material] };
    const candidateCatalog = new Map(catalog);
    candidateCatalog.set(candidate.code, candidate);
    const validation = validateFormulaChange(candidateCatalog, { materialCode: material.code, expression: newMaterialExpression });
    const preview = validation.valid
      ? calculateModel(candidate, sampleInputsFor(candidate), candidateCatalog).items.find((item) => item.code === material.code)
      : undefined;
    return { material, validation, preview };
  }, [catalog, newMaterialCode, newMaterialExpression, newMaterialName, newMaterialUnit, selectedModel]);
  const newMaterialCodeConflict = [...catalog.values()].some((model) => model.materials.some((item) => item.code === newMaterialCode));
  const newMaterialCodeValid = Boolean(selectedModel && Number.isInteger(newMaterialCode)
    && newMaterialCode > selectedModel.code && newMaterialCode < selectedModel.code + 100
    && newMaterialCode < 1000000 && !newMaterialCodeConflict);
  const modelGroups = useMemo(() => {
    const groups = new Map<number, { code: number; name: string }>([
      [10000, { code: 10000, name: "Pintu" }],
      [20000, { code: 20000, name: "Jendela" }],
      [30000, { code: 30000, name: "Pintu Jendela" }],
      [40000, { code: 40000, name: "Pintu Sliding" }],
    ]);
    for (const model of models) groups.set(model.groupCode, {
      code: model.groupCode, name: modelGroupLabel(model.groupCode, model.groupName),
    });
    return [...groups.values()].sort((a, b) => a.code - b.code);
  }, [models]);
  const suggestedNewGroupCode = useMemo(() => {
    const used = new Set(modelGroups.map((group) => group.code));
    for (let code = 50000; code < 1000000; code += 10000) if (!used.has(code)) return code;
    return 0;
  }, [modelGroups]);
  const activeModelGroupCode = newModelGroup || suggestedNewGroupCode;
  const activeModelGroupName = newModelGroup
    ? modelGroups.find((group) => group.code === newModelGroup)?.name ?? modelGroupLabel(newModelGroup)
    : newModelGroupName.trim();
  const newModelCodeValid = Number.isInteger(newModelCode) && newModelCode >= activeModelGroupCode + 100
    && newModelCode <= activeModelGroupCode + 9900 && newModelCode % 100 === 0
    && Math.floor(newModelCode / 10000) * 10000 === activeModelGroupCode
    && Boolean(activeModelGroupName)
    && !models.some((model) => model.code === newModelCode);

  function suggestModelCode(groupCode: number): number {
    const groupModels = models.filter((model) => model.groupCode === groupCode);
    return Math.max(groupCode, ...groupModels.map((model) => model.code)) + 100;
  }

  function suggestMaterialCode(model: DoorModel): number {
    return Math.max(model.code, ...model.materials.map((item) => item.code)) + 1;
  }

  useEffect(() => {
    if (!models.length) return;
    if (modelCode === null || !catalog.has(modelCode)) setModelCode(models[0].code);
  }, [catalog, modelCode, models]);

  useEffect(() => {
    if (!selectedModel?.materials.length) {
      setMaterialCode(null);
      return;
    }
    if (!selectedModel.materials.some((item) => item.code === materialCode)) {
      setMaterialCode(selectedModel.materials[0].code);
    }
  }, [materialCode, selectedModel]);

  useEffect(() => {
    setExpression(selectedMaterial?.expression ?? "");
    setMessage(null);
  }, [materialCode, selectedMaterial?.expression]);

  const loadHistory = useCallback(async () => {
    if (!repository || materialCode === null) {
      setVersions([]);
      return;
    }
    setHistoryError(null);
    try {
      setVersions(await repository.listFormulaVersions(materialCode));
    } catch (error) {
      setHistoryError(error instanceof Error ? error.message : "Riwayat rumus tidak dapat dimuat.");
    }
  }, [materialCode, repository]);

  useEffect(() => { void loadHistory(); }, [loadHistory]);

  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(() => setMessage(null), 6000);
    return () => window.clearTimeout(timer);
  }, [message]);

  const validation = useMemo(() => materialCode === null
    ? { valid: false as const, error: "Pilih material terlebih dahulu" }
    : validateFormulaChange(catalog, { materialCode, expression }), [catalog, expression, materialCode]);

  const preview = useMemo(() => {
    if (!selectedModel || !selectedMaterial || !validation.valid) return null;
    try {
      const candidate: DoorModel = {
        ...selectedModel,
        materials: selectedModel.materials.map((item) => item.code === selectedMaterial.code
          ? { ...item, expression }
          : item),
      };
      const candidateCatalog = new Map(catalog);
      candidateCatalog.set(candidate.code, candidate);
      const result = calculateModel(candidate, sampleInputsFor(candidate), candidateCatalog);
      const item = result.items.find((row) => row.code === selectedMaterial.code);
      const error = result.errors.find((row) => row.materialCode === selectedMaterial.code);
      return { result, item, error };
    } catch (error) {
      return { result: { items: [], errors: [] }, item: undefined, error: { materialCode: selectedMaterial.code, reason: error instanceof Error ? error.message : "Pratinjau gagal" } };
    }
  }, [catalog, expression, selectedMaterial, selectedModel, validation.valid]);
  const formulaReadyToSave = validation.valid && Boolean(preview?.item);
  const formulaFeedbackError = validation.valid ? preview?.error?.reason : validation.error;

  const referencedCodes = useMemo(() => [...new Set([
    ...(selectedModel?.materials.map((item) => item.code) ?? []),
    ...(selectedModel?.materials.flatMap((item) => formulaReferences(item.expression)) ?? []),
  ])].sort((a, b) => a - b), [selectedModel]);

  async function saveFormula() {
    if (!repository || materialCode === null || !formulaReadyToSave || !isCatalogAdmin) return;
    setSaving(true);
    setMessage(null);
    try {
      await saveValidatedFormulaChange(repository, catalog, { materialCode, expression });
      await Promise.all([reloadCatalog(), loadHistory()]);
      setMessage({ tone: "success", text: "Rumus baru disimpan. Proyek tersimpan tetap memakai hasil dan versi sebelumnya." });
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof Error ? error.message : "Rumus gagal disimpan." });
    } finally {
      setSaving(false);
    }
  }

  async function createModel(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!repository || !isCatalogAdmin || !newModelCodeValid) return;
    setCreating(true);
    setCreateError(null);
    try {
      await repository.createFormulaModel({ code: newModelCode, name: newModelName.trim(), groupCode: activeModelGroupCode, groupName: activeModelGroupName });
      setModelCode(newModelCode);
      await reloadCatalog();
      setShowModelForm(false);
      setShowMaterialForm(true);
      setNewMaterialCode(newModelCode + 1);
      setNewMaterialName("");
      setNewMaterialUnit("m'");
      setNewMaterialExpression("");
      setMessage({ tone: "success", text: `Model ${newModelCode} ditambahkan. Tambahkan material dan rumusnya.` });
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : "Model gagal ditambahkan.");
    } finally {
      setCreating(false);
    }
  }

  async function createMaterial(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!repository || !isCatalogAdmin || !selectedModel || !newMaterialCodeValid || (newMaterialExpression.trim() && !newMaterialCandidate?.validation.valid)) return;
    setCreating(true);
    setCreateError(null);
    try {
      await repository.createFormulaMaterial({
        modelCode: selectedModel.code,
        materialCode: newMaterialCode,
        name: newMaterialName.trim(),
        unit: newMaterialUnit.trim(),
        expression: newMaterialExpression.trim() || null,
      });
      setMaterialCode(newMaterialCode);
      await reloadCatalog();
      setShowMaterialForm(false);
      setNewMaterialName("");
      setNewMaterialExpression("");
      setMessage({ tone: "success", text: newMaterialExpression.trim() ? "Material dan rumus awal berhasil ditambahkan." : "Material ditambahkan. Rumusnya bisa diisi nanti." });
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : "Material gagal ditambahkan.");
    } finally {
      setCreating(false);
    }
  }

  async function saveMaterialDetails(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!repository || !isCatalogAdmin || !selectedMaterial) return;
    const name = materialDraftName.trim();
    const unit = materialDraftUnit.trim();
    if (!name || !unit) return;
    setSavingMaterialDetails(true);
    setMaterialDetailsError(null);
    try {
      await repository.updateFormulaMaterialDetails(selectedMaterial.code, name, unit);
      await reloadCatalog();
      setShowEditMaterialForm(false);
      setMessage({ tone: "success", text: `Material ${selectedMaterial.code} berhasil diperbarui.` });
    } catch (error) {
      setMaterialDetailsError(error instanceof Error ? error.message : "Material gagal diperbarui.");
    } finally {
      setSavingMaterialDetails(false);
    }
  }

  async function deleteMaterialPermanently(material: DoorModel["materials"][number]) {
    if (!repository || !isCatalogAdmin || !selectedModel) return;
    setMessage(null);
    setDeletingMaterialCode(material.code);
    try {
      await repository.deleteFormulaMaterial(selectedModel.code, material.code);
      await reloadCatalog();
      setPendingMaterialRemoval(null);
      setMessage({ tone: "success", text: `Material ${material.code} dihapus permanen dari model ${selectedModel.code}. Proyek tersimpan tetap dipertahankan.` });
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof Error ? error.message : "Material gagal dihapus." });
    } finally {
      setDeletingMaterialCode(null);
    }
  }

  async function archiveSelectedModel(model: DoorModel) {
    if (!repository || !isCatalogAdmin) return;
    setDeletingModelCode(model.code);
    setMessage(null);
    try {
      await repository.archiveFormulaModel(model.code);
      const nextModel = models.find((item) => item.code !== model.code);
      setModelCode(nextModel?.code ?? null);
      setMaterialCode(null);
      setPendingModelRemoval(null);
      await reloadCatalog();
      setMessage({ tone: "success", text: `Model ${model.code} dinonaktifkan dari katalog baru. Proyek lama tetap menyimpan hasil perhitungannya.` });
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof Error ? error.message : "Model gagal dinonaktifkan." });
    } finally {
      setDeletingModelCode(null);
    }
  }

  function appendToken(token: string) {
    setExpression((current) => {
      const trimmed = current.trimEnd();
      if (!trimmed) return token;
      const separator = /[+\-*/(]$/.test(trimmed) ? " " : " + ";
      return `${trimmed}${separator}${token}`;
    });
  }

  if (loadingCatalog) return <AppPageState title="Memuat master rumus" detail="Katalog sedang dibuka." />;
  if (catalogError) return <AppPageState title="Master rumus belum dapat dimuat" detail={catalogError} tone="error" />;

  return (
    <section className="page-content formula-master-page">
      <div className="page-heading-row">
        <div className="page-intro">
          <p className="eyebrow">PENGATURAN KATALOG</p>
          <h1>Master rumus</h1>
          <p className="page-description">Ubah rumus qty per item. Setiap perubahan divalidasi, dipratinjau, lalu disimpan sebagai versi baru.</p>
        </div>
        <div className="formula-admin-actions">
          {isCatalogAdmin ? <>
            <button className="secondary-button" type="button" onClick={() => {
              const code = suggestModelCode(newModelGroup || suggestedNewGroupCode);
              setNewModelCode(code);
              setNewModelName(`Model ${code}`);
              setCreateError(null);
              setShowModelForm(true);
            }}>Tambah model</button>
          </> : <span className="read-only-pill">Hanya lihat</span>}
        </div>
      </div>

      <div className="formula-search-panel">
        <label className="formula-search">
          <span className="formula-search-icon" aria-hidden="true">⌕</span>
          <input
            type="search"
            aria-label="Cari model atau material"
            placeholder="Cari kode, nama model, atau material..."
            value={formulaSearch}
            onChange={(event) => setFormulaSearch(event.target.value)}
          />
          {formulaSearch && <button className="formula-search-clear" type="button" aria-label="Hapus pencarian" onClick={() => setFormulaSearch("")}>×</button>}
        </label>
        {formulaSearch.trim() && <div className="formula-search-results" role="listbox" aria-label="Hasil pencarian master rumus">
          {formulaSearchResults.length ? formulaSearchResults.map(({ model, matchedMaterials }) => (
            <div className="formula-search-result-group" key={model.code}>
              {matchedMaterials.length ? matchedMaterials.map((material) => (
                <button className="formula-search-result" type="button" role="option" aria-selected={modelCode === model.code && materialCode === material.code} key={material.code} onClick={() => selectFormulaSearchResult(model, material.code)}>
                  <strong>{model.code} · {model.name}</strong>
                  <span>{material.name} · {material.code} · {material.unit}</span>
                </button>
              )) : <button className="formula-search-result" type="button" role="option" aria-selected={modelCode === model.code} onClick={() => selectFormulaSearchResult(model)}>
                <strong>{model.code} · {model.name}</strong>
                <span>{modelGroupLabel(model.groupCode, model.groupName)} · pilih model</span>
              </button>}
            </div>
          )) : <p className="formula-search-empty">Model atau material tidak ditemukan.</p>}
        </div>}
      </div>

      <div className="formula-layout">
        <section className="formula-editor-card">
          {!models.length ? <div className="readonly-callout">Katalog masih kosong. Tambahkan model untuk mulai menyusun rumus.</div> : <>
          <div className="formula-select-grid">
            <label className="form-field" htmlFor="formula-model"><span>MODEL</span>
              <select id="formula-model" value={selectedModel?.code ?? ""} onChange={(event) => setModelCode(Number(event.target.value))}>
                {models.map((model) => <option key={model.code} value={model.code}>{model.code} · {modelGroupLabel(model.groupCode, model.groupName)}</option>)}
              </select>
            </label>
            <label className="form-field" htmlFor="formula-material"><span>MATERIAL · KODE · SATUAN</span>
              <select id="formula-material" value={selectedMaterial?.code ?? ""} onChange={(event) => setMaterialCode(Number(event.target.value))}>
                {(selectedModel?.materials ?? []).map((item) => <option key={item.code} value={item.code}>{item.active === false ? "(nonaktif) " : ""}{item.name} · {item.code} · {item.unit}</option>)}
              </select>
            </label>
          </div>
          {selectedModel && isCatalogAdmin && <div className="formula-model-actions">
            <span>Model aktif: <strong>{selectedModel.code} · {selectedModel.name}</strong></span>
            <button className="secondary-button project-delete-button" type="button" disabled={deletingModelCode !== null} onClick={() => setPendingModelRemoval(selectedModel)}>Hapus model</button>
          </div>}

          <div className="formula-current-meta">
            <span>SEL SUMBER {selectedMaterial?.sourceCell}</span>
            <span>VERSI AKTIF {selectedMaterial?.formulaVersion ?? 1}</span>
          </div>
          <label className="formula-label" htmlFor="formula-expression">RUMUS QTY</label>
          <textarea
            id="formula-expression"
            className="formula-input"
            spellCheck={false}
            rows={4}
            maxLength={500}
            value={expression}
            readOnly={!isCatalogAdmin}
            onChange={(event) => { setExpression(event.target.value); setMessage(null); }}
          />
          <div className={`formula-feedback ${formulaReadyToSave ? "valid" : "invalid"}`} role="status">
            <span className="feedback-mark">{formulaReadyToSave ? "✓" : "!"}</span>
            {formulaReadyToSave ? "Sintaks, dependensi, dan hasil pratinjau valid." : formulaFeedbackError ?? "Hasil pratinjau belum tersedia."}
          </div>

          <div className="formula-token-section">
            <div><strong>Variabel masukan</strong><span>Nama variabel baru bisa diketik langsung di rumus dan otomatis muncul sebagai input proyek.</span></div>
            <div className="formula-token-list">
              {variableTokens.map((token) => <button key={token} type="button" className="formula-token" onClick={() => appendToken(token)} disabled={!isCatalogAdmin}>{token}</button>)}
            </div>
          </div>
          <div className="formula-token-section formula-reference-section">
            <div><strong>Referensi qty material</strong><span>Format kode tetap seperti qty_10101; rumus lama lintas model juga didukung.</span></div>
            <div className="formula-token-list formula-reference-list">
              {referencedCodes.map((code) => <button key={code} type="button" className="formula-token" onClick={() => appendToken(`qty_${code}`)} disabled={!isCatalogAdmin}>qty_{code}</button>)}
            </div>
          </div>

          {!isCatalogAdmin && <div className="readonly-callout">Akun ini dapat melihat rumus. Minta pengelola katalog untuk menyimpan perubahan.</div>}
          <div className="formula-save-row">
            <span>{expression.length}/500 karakter</span>
            <button className="primary-button" type="button" onClick={() => void saveFormula()} disabled={!isCatalogAdmin || !formulaReadyToSave || saving}>
              {saving ? <><span className="button-spinner" />Menyimpan…</> : "Simpan versi baru"}
            </button>
          </div>
          {selectedMaterial?.sourceFormula && (
            <details className="formula-source-details"><summary>Lihat rumus sumber Excel</summary><code>{selectedMaterial.sourceFormula}</code></details>
          )}
          </>}
        </section>

        <aside className="formula-preview-column">
          <section className="formula-preview-card">
            <div className="section-title-row"><div><p className="eyebrow">UJI CONTOH</p><h2>Pratinjau hasil</h2></div><span className="preview-dot" /></div>
            <p className="preview-description">Masukan contoh: T1 2.000 · L1 1.754 · T2/L2 500 · jumlah daun 2.</p>
            {preview ? (
              <div className="preview-result">
                {preview.item ? <><span className="preview-result-label">{selectedMaterial?.name}</span><strong>{formatQuantity(preview.item.quantity)} <small>{selectedMaterial?.unit}</small></strong></> : <div className="preview-error">{preview.error?.reason ?? "Hasil belum tersedia"}</div>}
              </div>
            ) : <div className="preview-error">Perbaiki rumus untuk melihat hasil contoh.</div>}
            {preview?.result.errors.some((item) => item.materialCode !== selectedMaterial?.code) && <details className="preview-other-errors"><summary>Masalah pada item lain</summary><MaterialResults result={{ items: preview.result.items.map((item) => ({ materialCode: item.code, name: item.name, unit: item.unit, quantity: item.quantity })), errors: preview.result.errors }} /></details>}
          </section>

          <section className="formula-history-card">
            <div className="section-title-row"><div><p className="eyebrow">JEJAK PERUBAHAN</p><h2>Riwayat rumus</h2></div><span className="history-count">{versions.length}</span></div>
            {historyError ? <p className="history-empty">{historyError}</p> : versions.length === 0 ? <p className="history-empty">Belum ada riwayat rumus.</p> : (
              <div className="formula-history-list">
                {versions.map((version) => (
                  <article className="formula-history-item" key={version.id}>
                    <div className="history-item-heading"><strong>Versi {version.version}</strong><span>{formatDate(version.createdAt)}</span></div>
                    <code>{version.expression ?? "Rumus belum tersedia"}</code>
                  </article>
                ))}
              </div>
            )}
          </section>

          <section className="formula-history-card formula-material-manager-card" aria-label="Kelola material model">
            <div className="section-title-row"><div><p className="eyebrow">KATALOG MODEL</p><h2>Material pada model {selectedModel?.code}</h2></div><button className="secondary-button" type="button" disabled={!selectedModel || !isCatalogAdmin} onClick={() => {
              if (!selectedModel) return;
              setNewMaterialCode(suggestMaterialCode(selectedModel));
              setNewMaterialName(""); setNewMaterialUnit("m'"); setNewMaterialExpression(""); setCreateError(null); setShowMaterialForm(true);
            }}>+ Tambah</button></div>
            <p className="formula-material-manager-note">Atur nama, satuan, rumus, dan material yang digunakan model ini.</p>
            <div className="formula-material-manager-list">
              {(selectedModel?.materials ?? []).map((item) => <div className="formula-material-manager-row" key={item.code}>
                <button className="formula-material-manager-select" type="button" onClick={() => setMaterialCode(item.code)} aria-pressed={selectedMaterial?.code === item.code}>
                  <span className="formula-material-manager-name"><strong>{item.name}</strong><code>{item.expression || "Rumus belum diisi"}</code></span>
                  <span>{item.code} · {item.unit}</span>
                </button>
                <div className="formula-material-manager-actions">
                  <button className="secondary-button" type="button" disabled={!isCatalogAdmin} onClick={() => { setMaterialCode(item.code); setMaterialDraftName(item.name); setMaterialDraftUnit(item.unit); setMaterialDetailsError(null); setShowEditMaterialForm(true); }}>Ubah</button>
                  <button className="secondary-button" type="button" disabled={!isCatalogAdmin} onClick={() => setPendingMaterialRemoval(item)}>Hapus</button>
                </div>
              </div>)}
              {!selectedModel?.materials.length && <p className="history-empty">Belum ada material di model ini.</p>}
            </div>
          </section>
        </aside>
      </div>

      {showModelForm && <div className="formula-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowModelForm(false); }}>
        <section className="formula-create-modal" role="dialog" aria-modal="true" aria-labelledby="create-model-title">
          <div className="section-title-row"><div><p className="eyebrow">KATALOG RUMUS</p><h2 id="create-model-title">Tambah model</h2></div><button className="icon-button" type="button" aria-label="Tutup" onClick={() => setShowModelForm(false)}>×</button></div>
          <form onSubmit={(event) => void createModel(event)}>
            <label className="form-field"><span>KELOMPOK MODEL</span><select value={newModelGroup || "new"} onChange={(event) => {
              const group = event.target.value === "new" ? 0 : Number(event.target.value);
              const code = suggestModelCode(group || suggestedNewGroupCode);
              setNewModelGroup(group);
              setNewModelCode(code);
              setNewModelName(`Model ${code}`);
            }}>{modelGroups.map((group) => <option key={group.code} value={group.code}>{group.name}</option>)}<option value="new">+ Buat kelompok baru</option></select></label>
            {!newModelGroup && <label className="form-field"><span>NAMA KELOMPOK BARU</span><input value={newModelGroupName} onChange={(event) => setNewModelGroupName(event.target.value)} maxLength={80} placeholder="Contoh: Pintu Lipat" required /></label>}
            <label className="form-field"><span>KODE MODEL · SARAN xx00</span><input type="number" min={activeModelGroupCode + 100} max={activeModelGroupCode + 9900} step={100} value={newModelCode} onChange={(event) => setNewModelCode(Number(event.target.value))} required /></label>
            <label className="form-field"><span>NAMA MODEL</span><input value={newModelName} onChange={(event) => setNewModelName(event.target.value)} maxLength={80} required /></label>
            {!newModelCodeValid && <div className="formula-feedback invalid" role="status">Isi kelompok dan nama model. Kode saran memakai pola xx00, materialnya xx01, dan kode dibuat otomatis.</div>}
            {createError && <div className="notice-banner error" role="alert">{createError}</div>}
            <div className="formula-modal-actions"><button className="secondary-button" type="button" onClick={() => setShowModelForm(false)}>Batal</button><button className="primary-button" type="submit" disabled={creating || !newModelCodeValid}>{creating ? <><span className="button-spinner" />Menyimpan…</> : "Tambah model"}</button></div>
          </form>
        </section>
      </div>}

      {showMaterialForm && selectedModel && <div className="formula-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowMaterialForm(false); }}>
        <section className="formula-create-modal" role="dialog" aria-modal="true" aria-labelledby="create-material-title">
          <div className="section-title-row"><div><p className="eyebrow">MODEL {selectedModel.code}</p><h2 id="create-material-title">Tambah material</h2></div><button className="icon-button" type="button" aria-label="Tutup" onClick={() => setShowMaterialForm(false)}>×</button></div>
          <form onSubmit={(event) => void createMaterial(event)}>
            <label className="form-field"><span>KODE MATERIAL · RENTANG {selectedModel.code + 1}–{selectedModel.code + 99}</span><input type="number" min={selectedModel.code + 1} max={selectedModel.code + 99} value={newMaterialCode} onChange={(event) => setNewMaterialCode(Number(event.target.value))} required /></label>
            <label className="form-field"><span>NAMA MATERIAL</span><input value={newMaterialName} onChange={(event) => setNewMaterialName(event.target.value)} maxLength={100} required /></label>
            <label className="form-field"><span>SATUAN</span><input value={newMaterialUnit} onChange={(event) => setNewMaterialUnit(event.target.value)} maxLength={20} required /></label>
            <label className="form-field"><span>RUMUS QTY · OPSIONAL</span><textarea className="formula-input" rows={3} maxLength={500} value={newMaterialExpression} onChange={(event) => setNewMaterialExpression(event.target.value)} placeholder="Boleh dikosongkan dan dilengkapi nanti" /></label>
            <div className={`formula-feedback ${!newMaterialCodeValid || (newMaterialExpression.trim() && !newMaterialCandidate?.validation.valid) ? "invalid" : "valid"}`} role="status">{!newMaterialCodeValid ? "Kode material harus berada dalam rentang kode xx01–xx99 dan belum digunakan." : !newMaterialExpression.trim() ? "Material bisa disimpan sekarang; rumus dapat ditambahkan nanti." : newMaterialCandidate?.validation.valid ? `Rumus valid · contoh hasil ${formatQuantity(newMaterialCandidate.preview?.quantity ?? 0)} ${newMaterialUnit}` : newMaterialCandidate && !newMaterialCandidate.validation.valid ? newMaterialCandidate.validation.error : "Rumus belum valid."}</div>
            {createError && <div className="notice-banner error" role="alert">{createError}</div>}
            <div className="formula-modal-actions"><button className="secondary-button" type="button" onClick={() => setShowMaterialForm(false)}>Batal</button><button className="primary-button" type="submit" disabled={creating || !newMaterialCodeValid || Boolean(newMaterialExpression.trim() && !newMaterialCandidate?.validation.valid)}>{creating ? <><span className="button-spinner" />Menyimpan…</> : "Tambah material"}</button></div>
          </form>
        </section>
      </div>}

      {showEditMaterialForm && selectedMaterial && <div className="formula-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowEditMaterialForm(false); }}>
        <section className="formula-create-modal" role="dialog" aria-modal="true" aria-labelledby="edit-material-title">
          <div className="section-title-row"><div><p className="eyebrow">MODEL {selectedModel?.code} · KODE {selectedMaterial.code}</p><h2 id="edit-material-title">Ubah material</h2></div><button className="icon-button" type="button" aria-label="Tutup" onClick={() => setShowEditMaterialForm(false)}>×</button></div>
          <form onSubmit={(event) => void saveMaterialDetails(event)}>
            <label className="form-field"><span>NAMA MATERIAL</span><input value={materialDraftName} onChange={(event) => setMaterialDraftName(event.target.value)} maxLength={100} required autoFocus /></label>
            <label className="form-field"><span>SATUAN</span><input value={materialDraftUnit} onChange={(event) => setMaterialDraftUnit(event.target.value)} maxLength={20} required /></label>
            <p className="history-empty">Kode dipertahankan agar rumus, riwayat, dan proyek lama tetap terhubung. Untuk mengubah perhitungan, pilih material ini lalu ubah rumus di editor.</p>
            {materialDetailsError && <div className="notice-banner error" role="alert">{materialDetailsError}</div>}
            <div className="formula-modal-actions"><button className="secondary-button" type="button" onClick={() => setShowEditMaterialForm(false)}>Batal</button><button className="primary-button" type="submit" disabled={savingMaterialDetails || !materialDraftName.trim() || !materialDraftUnit.trim()}>{savingMaterialDetails ? <><span className="button-spinner" />Menyimpan…</> : "Simpan perubahan"}</button></div>
          </form>
        </section>
      </div>}

      {pendingModelRemoval && <div className="formula-modal-backdrop formula-confirm-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && deletingModelCode === null) setPendingModelRemoval(null); }}>
        <section className="formula-create-modal formula-confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="archive-model-title" aria-describedby="archive-model-description">
          <p className="eyebrow">KATALOG MODEL</p>
          <h2 id="archive-model-title">Nonaktifkan model ini?</h2>
          <p id="archive-model-description">Model <strong>{pendingModelRemoval.code} · {pendingModelRemoval.name}</strong> akan dikeluarkan dari pilihan kalkulator dan master rumus untuk perhitungan baru.</p>
          <p className="formula-confirm-note">Model tidak dihapus permanen. Data model dan hasil proyek lama tetap tersimpan. Jika rumus model lain masih memakai material dari model ini, sistem akan menolak penonaktifan.</p>
          <div className="formula-modal-actions formula-confirm-actions">
            <button className="secondary-button" type="button" disabled={deletingModelCode !== null} onClick={() => setPendingModelRemoval(null)}>Batal</button>
            <button className="primary-button formula-danger-button" type="button" disabled={deletingModelCode !== null} onClick={() => void archiveSelectedModel(pendingModelRemoval)}>{deletingModelCode === pendingModelRemoval.code ? <><span className="button-spinner" />Menonaktifkan…</> : "Ya, nonaktifkan model"}</button>
          </div>
        </section>
      </div>}
      {pendingMaterialRemoval && selectedModel && <div className="formula-modal-backdrop formula-confirm-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && deletingMaterialCode === null) setPendingMaterialRemoval(null); }}>
        <section className="formula-create-modal formula-confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="remove-material-title" aria-describedby="remove-material-description">
          <p className="eyebrow">KELOLA MATERIAL</p>
          <h2 id="remove-material-title">Hapus material permanen?</h2>
          <p id="remove-material-description">Material <strong>{pendingMaterialRemoval.name}</strong> · {pendingMaterialRemoval.code} dan riwayat rumusnya akan dihapus dari model {selectedModel.code}.</p>
          <p className="formula-confirm-note">Proyek tersimpan tetap mempertahankan hasil dan harga yang sudah tercatat. Penghapusan ini tidak bisa dibatalkan.</p>
          <div className="formula-modal-actions formula-confirm-actions"><button className="secondary-button" type="button" disabled={deletingMaterialCode !== null} onClick={() => setPendingMaterialRemoval(null)}>Batal</button><button className="primary-button formula-danger-button" type="button" disabled={deletingMaterialCode !== null} onClick={() => void deleteMaterialPermanently(pendingMaterialRemoval)}>{deletingMaterialCode === pendingMaterialRemoval.code ? <><span className="formula-toast-spinner" />Menghapus…</> : "Hapus permanen"}</button></div>
        </section>
      </div>}
      {message && <div className={`formula-toast ${message.tone}`} role={message.tone === "error" ? "alert" : "status"} aria-live={message.tone === "error" ? "assertive" : "polite"}>
        <span className="formula-toast-icon" aria-hidden="true">{message.tone === "success" ? "✓" : "!"}</span>
        <div className="formula-toast-copy"><strong>{message.tone === "success" ? "Berhasil" : "Belum berhasil"}</strong><span>{message.text}</span></div>
        <button className="formula-toast-close" type="button" aria-label="Tutup notifikasi" onClick={() => setMessage(null)}>×</button>
      </div>}
    </section>
  );
}
