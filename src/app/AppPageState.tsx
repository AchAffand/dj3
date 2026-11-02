export function AppPageState({
  title,
  detail,
  actionLabel,
  onAction,
  tone = "neutral",
}: {
  title: string;
  detail: string;
  actionLabel?: string;
  onAction?: () => void;
  tone?: "neutral" | "error";
}) {
  return (
    <section className={`page-state ${tone}`} role={tone === "error" ? "alert" : "status"}>
      <span className="page-state-mark" aria-hidden="true">{tone === "error" ? "!" : "·"}</span>
      <h1>{title}</h1>
      <p>{detail}</p>
      {actionLabel && onAction && <button className="secondary-button" onClick={onAction} type="button">{actionLabel}</button>}
    </section>
  );
}
