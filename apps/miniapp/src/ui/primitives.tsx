import type { ReactNode } from "react";

/* ---------- shell ---------- */

export function TopBar({
  label,
  onBack,
  close = false,
  right,
  borderless = false,
}: {
  label?: string | undefined;
  onBack?: (() => void) | undefined;
  close?: boolean;
  right?: ReactNode;
  borderless?: boolean;
}) {
  return (
    <div className={borderless ? "topbar borderless" : "topbar"}>
      {onBack ? (
        <button className={close ? "back-target close" : "back-target"} onClick={onBack}>
          {close ? "✕" : "←"}
        </button>
      ) : (
        <span style={{ width: 8 }} />
      )}
      {label && <span className="bar-label">{label}</span>}
      {right && <span className="bar-right">{right}</span>}
    </div>
  );
}

/* ---------- buttons ---------- */

export function Button({
  variant = "primary",
  children,
  onClick,
  disabled,
}: {
  variant?: "primary" | "secondary" | "destructive" | "inline";
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button className={`btn ${variant}`} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  );
}

/* ---------- rows & data ---------- */

export function ListRow({
  title,
  sub,
  value,
  arrow = false,
  emphasis = false,
  pending = false,
  dim = false,
  right,
  onClick,
}: {
  title: ReactNode;
  sub?: ReactNode;
  value?: ReactNode;
  arrow?: boolean;
  emphasis?: boolean;
  pending?: boolean;
  dim?: boolean;
  right?: ReactNode;
  onClick?: (() => void) | undefined;
}) {
  const cls = ["list-row", pending && "pending", dim && "dim"].filter(Boolean).join(" ");
  const body = (
    <>
      <span className="row-main">
        <span className={emphasis ? "row-title emphasis" : "row-title"}>{title}</span>
        {sub && <span className="row-sub">{sub}</span>}
      </span>
      {value !== undefined && <span className="row-value">{value}</span>}
      {right}
      {arrow && <span className="row-arrow">→</span>}
    </>
  );
  return onClick ? (
    <button className={cls} onClick={onClick}>
      {body}
    </button>
  ) : (
    <div className={cls}>{body}</div>
  );
}

export function Badge({ children, quiet = false }: { children: ReactNode; quiet?: boolean }) {
  return <span className={quiet ? "badge quiet" : "badge"}>{children}</span>;
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return <div className="micro-label" style={{ marginBottom: 12 }}>{children}</div>;
}

/* ---------- controls ---------- */

export function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button className={on ? "toggle on" : "toggle"} onClick={() => onChange(!on)}>
      <span className="knob" />
    </button>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: Array<{ value: T; label: string }>;
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="segment">
      {options.map((o) => (
        <button
          key={o.value}
          className={o.value === value ? "active" : ""}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string | undefined;
  children: ReactNode;
}) {
  return (
    <label className="col gap-8">
      <span className="field-label">{label}</span>
      {children}
      {error && <span className="field-error">{error}</span>}
    </label>
  );
}

/* ---------- progress ---------- */

export function ProgressBar({ fraction }: { fraction: number | "sweep" }) {
  return (
    <div className="progress-track anim">
      {fraction === "sweep" ? (
        <div className="sweep" />
      ) : (
        <div className="fill" style={{ width: `${Math.min(100, fraction * 100)}%` }} />
      )}
    </div>
  );
}

/* ---------- brand ---------- */

export function BREmblem({ size = 40, dim = true }: { size?: number; dim?: boolean }) {
  const text = dim ? "#6E7573" : "#F2F3F1";
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-label="BR emblem">
      <circle cx="50" cy="50" r="48" fill="none" stroke="#232927" strokeWidth="1" />
      <circle cx="50" cy="50" r="41" fill="none" stroke="#3A403E" strokeWidth="2.5" strokeDasharray="5 4.2" />
      <circle cx="50" cy="50" r="35" fill="none" stroke="#232927" strokeWidth="1" />
      <text
        x="50" y="50" textAnchor="middle" dominantBaseline="central"
        fontFamily="Cormorant Garamond, Georgia, serif" fontWeight="300"
        fontSize="30" letterSpacing="2" fill={text}
      >
        BR
      </text>
    </svg>
  );
}

export function GridGlyph({ cell = 20 }: { cell?: number }) {
  return (
    <div
      className="grid-glyph"
      style={{ gridTemplateColumns: `repeat(3, ${cell}px)`, gridTemplateRows: `repeat(3, ${cell}px)` }}
    >
      {Array.from({ length: 9 }, (_, i) => (
        <i key={i} />
      ))}
    </div>
  );
}

/* ---------- states ---------- */

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body?: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <GridGlyph />
      <h2 className="serif-title" style={{ fontSize: 26 }}>{title}</h2>
      {body && <p className="hint-copy" style={{ fontSize: 13 }}>{body}</p>}
      {action}
    </div>
  );
}

export function ErrorPanel({
  title,
  body,
  actions,
}: {
  title: string;
  body: string;
  actions?: ReactNode;
}) {
  return (
    <div className="error-panel">
      <div className="panel-head">
        <span className="bang">!</span>
        <span className="panel-title">{title}</span>
      </div>
      <p className="body-copy" style={{ fontSize: 13 }}>{body}</p>
      {actions && <div className="row2" style={{ marginTop: 4 }}>{actions}</div>}
    </div>
  );
}

/* ---------- overlays ---------- */

export function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="modal-title">{title}</div>
        {children}
      </div>
    </div>
  );
}

export function BottomSheet({
  children,
  onClose,
}: {
  children: ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="overlay sheet" onClick={onClose}>
      <div className="sheet-box" onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}
