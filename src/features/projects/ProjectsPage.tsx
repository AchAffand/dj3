import { useCallback, useEffect, useState } from "react";
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
  const [error, setError] = useState<string | null>(null);

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

  useEffect(() => { void loadProjects(); }, [loadProjects]);

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
        <div className="project-list">
          {projects.map((project) => (
            <article className="project-list-row" key={project.id}>
              <span className="project-list-icon" aria-hidden="true">↗</span>
              <span className="project-list-main"><strong>{project.name}</strong><small>{project.modelCount} model kusen</small></span>
              <span className="project-list-date">Diperbarui {formatDate(project.updatedAt)}</span>
              <div className="project-list-actions">
                <button className="secondary-button" type="button" aria-label={`Edit ${project.name}`} onClick={() => navigate(`/calculator?project=${encodeURIComponent(project.id)}`)}>Edit</button>
                <button className="secondary-button" type="button" aria-label={`Cetak ${project.name}`} onClick={() => navigate(`/projects/${encodeURIComponent(project.id)}/print`)}>Cetak</button>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
