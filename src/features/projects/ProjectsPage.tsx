import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { ProjectSummary } from "../../domain/projects/types";
import { AppPageState } from "../../app/AppPageState";
import { formatDate } from "../../app/format";
import { useAppServices } from "../../app/AppServices";

export function ProjectsPage() {
  const { repository } = useAppServices();
  const navigate = useNavigate();
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);\n  const [searchQuery, setSearchQuery] = useState("");

  const loadProjects = useCallback(async () => {
    if (!repository) return;
    setLoading(true);
    setError(null);
    try {
      setProjects(await repository.listProjects());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Daftar proyek tidak dapat dibuka.");
    } finally {
      setLoading(false);
    }
  }, [repository]);

  useEffect(() => { void loadProjects(); }, [loadProjects]);\n\n  const filteredProjects = useMemo(() => {\n    const query = searchQuery.trim().toLocaleLowerCase("id-ID");\n    if (!query) return projects;\n    return projects.filter((project) =>\n      [project.name, project.createdBy].some((value) => value.toLocaleLowerCase("id-ID").includes(query)),\n    );\n  }, [projects, searchQuery]);

  if (loading) return <AppPageState title="Memuat proyek" detail="Daftar proyek sedang disiapkan." />;
  if (error) return <AppPageState title="Proyek belum dapat dimuat" detail={error} tone="error" actionLabel="Coba lagi" onAction={() => void loadProjects()} />;

  return (
    <section className="page-content">
      <div className="page-heading-row">
        <div className="page-intro">
          <p className="eyebrow">ARSIP PERHITUNGAN</p>
          <h1>Proyek</h1>
          <p className="page-description">Semua perhitungan tersimpan milik ruang kerja ini.</p>
        </div>
        <button className="primary-button" type="button" onClick={() => navigate("/calculator")}>＋ Buat perhitungan</button>
      </div>

      {projects.length === 0 ? (
        <div className="projects-empty">
          <span className="projects-empty-art" aria-hidden="true">▤</span>
          <h2>Belum ada proyek tersimpan</h2>
          <p>Buat perhitungan baru, lalu simpan agar bisa dibuka kembali di sini.</p>
          <button className="secondary-button" type="button" onClick={() => navigate("/calculator")}>Mulai hitung</button>
        </div>
      ) : (
        <>
          <div className="projects-toolbar">
            <label className="project-search">
              <span className="project-search-icon" aria-hidden="true">⌕</span>
              <input
                type="search"
                aria-label="Cari proyek"
                placeholder="Cari nama proyek atau pembuat..."
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
              />
              {searchQuery && <button className="project-search-clear" type="button" aria-label="Hapus pencarian" onClick={() => setSearchQuery("")}>×</button>}
            </label>
            <span className="project-search-count">{searchQuery.trim() ? `${filteredProjects.length} dari ${projects.length} proyek` : `${projects.length} proyek`}</span>
          </div>
          {filteredProjects.length > 0 ? (
            <div className="project-list">
              {filteredProjects.map((project, index) => (
                <article className="project-list-row" key={project.id}>
                  <span className="project-list-icon" aria-label={`Urutan ${index + 1}`}>{index + 1}</span>
                  <span className="project-list-main"><strong>{project.name}</strong><small>{project.modelCount} model kusen</small><small className="project-list-owner">Dibuat oleh {project.createdBy}</small></span>
                  <span className="project-list-date">Diperbarui {formatDate(project.updatedAt)}</span>
                  <div className="project-list-actions">
                    <button className="secondary-button" type="button" aria-label={`Edit ${project.name}`} onClick={() => navigate(`/calculator?project=${encodeURIComponent(project.id)}`)}>Edit</button>
                    <button className="secondary-button" type="button" aria-label={`Cetak ${project.name}`} onClick={() => navigate(`/projects/${encodeURIComponent(project.id)}/print`)}>Cetak</button>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="projects-empty projects-no-results">
              <h2>Proyek tidak ditemukan</h2>
              <p>Coba kata kunci lain atau hapus pencarian.</p>
              <button className="secondary-button" type="button" onClick={() => setSearchQuery("")}>Hapus pencarian</button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
