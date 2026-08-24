import { useEffect, useState } from "react";
import { useI18n } from "../../i18n.js";
import { api } from "../../api.js";
import { TopBar } from "../../ui/primitives.js";

interface AuditRow {
  id: string;
  action: string;
  created_at: string;
  actor_name: string | null;
  actor_username: string | null;
}

/** C10 — audit log, newest first. */
export function AuditLog({ onBack }: { onBack: () => void }) {
  const { t } = useI18n();
  const [rows, setRows] = useState<AuditRow[] | null>(null);

  useEffect(() => {
    api<AuditRow[]>("/api/admin/audit").then(setRows, () => setRows([]));
  }, []);

  return (
    <div className="screen">
      <TopBar label={t("admin.audit")} onBack={onBack} />
      <div className="pad-x col" style={{ paddingTop: 20 }}>
        <hr className="hairline" />
        {(rows ?? []).map((r) => (
          <span key={r.id}>
            <div className="list-row" style={{ minHeight: 52 }}>
              <span className="row-main">
                <span className="mono" style={{ fontSize: 12, color: "var(--c-secondary)" }}>{r.action}</span>
                <span className="row-sub">
                  {r.actor_name ?? (r.actor_username ? `@${r.actor_username}` : "—")}
                </span>
              </span>
              <span className="mono" style={{ fontSize: 10, color: "var(--c-tertiary)" }}>
                {new Date(r.created_at).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
              </span>
            </div>
            <hr className="hairline" />
          </span>
        ))}
      </div>
    </div>
  );
}
