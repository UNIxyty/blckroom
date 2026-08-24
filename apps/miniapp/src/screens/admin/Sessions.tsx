import { useCallback, useEffect, useState } from "react";
import { useI18n } from "../../i18n.js";
import { api } from "../../api.js";
import { Button, Modal, TopBar } from "../../ui/primitives.js";

interface AdminSession {
  id: string;
  status: string;
  created_at: string;
  cost_cents: number;
  barber_name: string | null;
  barber_username: string | null;
  done_count: number;
  total_count: number;
  has_imagery: boolean;
}

/** C8 — sessions with on-demand GDPR purge. */
export function Sessions({ onBack }: { onBack: () => void }) {
  const { t } = useI18n();
  const [rows, setRows] = useState<AdminSession[] | null>(null);
  const [purging, setPurging] = useState<AdminSession | null>(null);

  const load = useCallback(() => {
    api<AdminSession[]>("/api/admin/sessions?days=30").then(setRows, () => setRows([]));
  }, []);
  useEffect(load, [load]);

  const purge = async () => {
    if (!purging) return;
    await api(`/api/admin/sessions/${purging.id}`, { method: "DELETE" });
    setPurging(null);
    load();
  };

  return (
    <div className="screen">
      <TopBar label={t("admin.sessions")} onBack={onBack} />
      <div className="pad-x col" style={{ paddingTop: 20 }}>
        <hr className="hairline" />
        {(rows ?? []).map((s) => {
          const who = s.barber_name ?? (s.barber_username ? `@${s.barber_username}` : "");
          const when = new Date(s.created_at).toLocaleString(undefined, {
            day: "numeric",
            month: "short",
            hour: "2-digit",
            minute: "2-digit",
          });
          const purged = s.status === "expired" || !s.has_imagery;
          return (
            <span key={s.id}>
              <div className="list-row" style={purged ? { opacity: 0.5 } : undefined}>
                <span className="row-main">
                  <span className="row-title">{t("sessions.by", { name: who, time: when })}</span>
                  <span className="row-sub">
                    {t("history.cuts", { n: s.done_count })} · {s.status}
                  </span>
                </span>
                {!purged && (
                  <button className="btn inline" onClick={() => setPurging(s)}>
                    {t("session.purge")}
                  </button>
                )}
              </div>
              <hr className="hairline" />
            </span>
          );
        })}
        {rows && rows.length === 0 && <p className="hint-copy" style={{ paddingTop: 20 }}>{t("history.empty.title")}</p>}
      </div>

      {purging && (
        <Modal title={t("session.purge.confirm.title")} onClose={() => setPurging(null)}>
          <p className="body-copy" style={{ fontSize: 13 }}>{t("session.purge.confirm")}</p>
          <div className="row2" style={{ marginTop: 4 }}>
            <Button variant="secondary" onClick={() => setPurging(null)}>
              {t("common.cancel")}
            </Button>
            <Button variant="primary" onClick={() => void purge()}>
              {t("common.delete")}
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
