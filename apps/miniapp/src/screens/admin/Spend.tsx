import { useEffect, useState } from "react";
import { useI18n } from "../../i18n.js";
import { api } from "../../api.js";
import { TopBar } from "../../ui/primitives.js";

interface Stats {
  sessions: number;
  spend_cents: number;
  budget_cents: number;
  currency: string;
  cost_per_session_cents: number;
}

/** C7 — spend dashboard with budget meter and over-budget state. */
export function Spend({ onBack }: { onBack: () => void }) {
  const { t } = useI18n();
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    api<Stats>("/api/admin/stats").then(setStats, () => {});
  }, []);

  if (!stats) {
    return (
      <div className="screen">
        <TopBar label={t("admin.spend")} onBack={onBack} />
        <p className="hint-copy pad">{t("common.loading")}…</p>
      </div>
    );
  }

  const sym = stats.currency === "EUR" ? "€" : stats.currency;
  const pct = stats.budget_cents > 0 ? (stats.spend_cents / stats.budget_cents) * 100 : 0;
  const over = pct >= 100;

  return (
    <div className="screen">
      <TopBar label={t("admin.spend")} onBack={onBack} />
      <div style={{ padding: "26px 20px 0" }}>
        <h1 className="serif-title" style={{ fontSize: 28 }}>{t("spend.month")}</h1>
      </div>

      {over && (
        <div className="pad-x" style={{ paddingTop: 16 }}>
          <div className="error-panel">
            <div className="panel-head">
              <span className="bang">!</span>
              <span className="panel-title">{t("spend.used")} 100%</span>
            </div>
            <p className="body-copy" style={{ fontSize: 13 }}>{t("spend.over")}</p>
          </div>
        </div>
      )}

      <div className="pad col gap-12">
        <div className="stat-card">
          <span className="stat-label">{t("spend.spent")}</span>
          <span className="stat-value">
            {sym}{(stats.spend_cents / 100).toFixed(2)}
            <span style={{ fontSize: 16, color: "var(--c-tertiary)" }}>
              {" "}/ {sym}{(stats.budget_cents / 100).toFixed(0)}
            </span>
          </span>
          <div className="progress-track" style={{ marginTop: 8 }}>
            <div className="fill" style={{ width: `${Math.min(100, pct)}%` }} />
          </div>
        </div>
        <div style={{ display: "flex", gap: 12 }}>
          <div className="stat-card" style={{ flex: 1 }}>
            <span className="stat-label">{t("spend.sessions")}</span>
            <span className="stat-value">{stats.sessions}</span>
          </div>
          <div className="stat-card" style={{ flex: 1 }}>
            <span className="stat-label">{t("spend.persession")}</span>
            <span className="stat-value">{sym}{(stats.cost_per_session_cents / 100).toFixed(2)}</span>
          </div>
        </div>
        <div className="stat-card">
          <span className="stat-label">{t("spend.used")}</span>
          <span className="stat-value">{pct.toFixed(0)}%</span>
        </div>
      </div>
    </div>
  );
}
