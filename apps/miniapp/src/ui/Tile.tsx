/**
 * The one grid tile, in its four designed states (D2 "Tile"):
 * skeleton (shimmer), done (image + label), failed (dashed, retry), empty.
 */
export function Tile({
  state,
  label,
  imageUrl,
  failedLabel,
  retryLabel,
  onOpen,
  onRetry,
  shimmerDelay = 0,
}: {
  state: "skeleton" | "done" | "failed" | "empty";
  label?: string | undefined;
  imageUrl?: string | null | undefined;
  failedLabel?: string;
  retryLabel?: string;
  onOpen?: (() => void) | undefined;
  onRetry?: (() => void) | undefined;
  shimmerDelay?: number;
}) {
  if (state === "skeleton") {
    return (
      <div className="tile skeleton anim" style={{ animationDelay: `${shimmerDelay}ms` }}>
        {label && <span className="tile-label" style={{ opacity: 0.6 }}>{label}</span>}
      </div>
    );
  }
  if (state === "failed") {
    return (
      <div className="tile failed">
        <span className="failed-label">{failedLabel ?? "Failed"}</span>
        {onRetry && (
          <button className="btn inline" onClick={onRetry}>
            {retryLabel ?? "Retry"}
          </button>
        )}
      </div>
    );
  }
  if (state === "empty") {
    return <div className="tile empty" />;
  }
  const body = (
    <>
      {imageUrl && <img src={imageUrl} alt={label ?? ""} />}
      {label && <span className="tile-label">{label}</span>}
    </>
  );
  return onOpen ? (
    <button className="tile done" onClick={onOpen}>
      {body}
    </button>
  ) : (
    <div className="tile done">{body}</div>
  );
}
