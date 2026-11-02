type FeaturePlaceholderProps = {
  eyebrow: string;
  title: string;
  description: string;
};

export function FeaturePlaceholder({
  eyebrow,
  title,
  description,
}: FeaturePlaceholderProps) {
  return (
    <section className="page-intro">
      <p className="eyebrow">{eyebrow}</p>
      <h1>{title}</h1>
      <p className="page-description">{description}</p>
      <div className="placeholder-card">
        <span className="placeholder-mark" aria-hidden="true">✳</span>
        <div>
          <strong>Area kerja siap disiapkan</strong>
          <p>Modul ini akan diisi pada tahap fitur berikutnya.</p>
        </div>
      </div>
    </section>
  );
}
