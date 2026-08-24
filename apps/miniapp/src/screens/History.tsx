import { useEffect, useState } from "react";
import { useI18n } from "../i18n.js";
import { useNav } from "../nav.js";
import { Button, EmptyState, TopBar } from "../ui/primitives.js";
import { api } from "../api.js";
import { getWebApp } from "../telegram.js";

interface HistoryRow {
  id: string;
  status: string;
  created_at: string;
  expires_at: string;
  sheet_url: string | null;
  generation_count?: number;
}

function timeLeft(expiresAt: string): string {
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return "0h";
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

/** B7 — History: last 7 days, expired rows dimmed, empty state. */
export function History() {
  const { t } = useI18n();
  const nav = useNav();
  const [rows, setRows] = useState<HistoryRow[] | null>(null);

  useEffect(() => {
    api<HistoryRow[]>("/api/sessions?days=7").then(setRows, () => setRows([]));
  }, []);

  return (
    <div className="screen">
      <TopBar label={t("history.bar")} onBack={nav.pop} />
      {!rows ? (
        <div className="pad">
          <div className="col gap-8 anim">
            <div style={{ height: 18, width: "60%", background: "var(--c-divider)", animation: "shimmer 2.4s ease-in-out infinite" }} />
            <div style={{ height: 14, width: "40%", background: "var(--c-divider)", animation: "shimmer 2.4s ease-in-out 0.3s infinite" }} />
          </div>
        </div>
      ) : rows.length === 0 ? (
        <>
          <EmptyState title={t("history.empty.title")} body={t("history.empty.body")} />
          <div className="bottom-dock">
            <Button variant="primary" onClick={() => nav.replace("consent")}>
              {t("home.cta")}
            </Button>
          </div>
        </>
      ) : (
        <>
          <div style={{ padding: "26px 20px 18px" }}>
            <h1 className="serif-title" style={{ fontSize: 28 }}>
              {t("history.title", { n: rows.length })}
            </h1>
          </div>
          <div className="pad-x col">
            <hr className="hairline" />
            {rows.map((r) => {
              const expired = r.status === "expired" || !r.sheet_url;
              const when = new Date(r.created_at).toLocaleString(undefined, {
                weekday: "short",
                hour: "2-digit",
                minute: "2-digit",
              });
              return (
                <span key={r.id}>
                  <button
                    className="list-row"
                    style={expired ? { opacity: 0.5 } : undefined}
                    onClick={
                      expired ? undefined : () => getWebApp()?.openLink(r.sheet_url!)
                    }
                  >
                    <span
                      style={{
                        width: 56,
                        height: 56,
                        flex: "0 0 56px",
                        background: expired ? "var(--c-divider)" : "var(--c-tile)",
                        border: expired ? "1px dashed var(--c-borderStrong)" : "1px solid var(--c-borderStrong)",
                      }}
                    />
                    <span className="row-main" style={{ flex: 1 }}>
                      <span className="row-title">{when}</span>
                      <span className="row-sub">
                        {expired
                          ? t("history.deleted")
                          : `${t("history.cuts", { n: r.generation_count ?? 9 })} · ${t("history.expires", { t: timeLeft(r.expires_at) })}`}
                      </span>
                    </span>
                    {!expired && <span className="row-arrow">→</span>}
                  </button>
                  <hr className="hairline" />
                </span>
              );
            })}
          </div>
          <div className="bottom-dock">
            <p className="hint-copy" style={{ fontSize: 11 }}>{t("history.note", { hours: 24 })}</p>
          </div>
        </>
      )}
    </div>
  );
}
