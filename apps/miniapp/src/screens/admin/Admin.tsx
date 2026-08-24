import { useCallback, useEffect, useState } from "react";
import { useI18n } from "../../i18n.js";
import { useNav } from "../../nav.js";
import { api } from "../../api.js";
import { ListRow, ProgressBar, SectionLabel, TopBar } from "../../ui/primitives.js";
import { Catalog } from "./Catalog.js";
import { Users } from "./Users.js";
import { Sessions } from "./Sessions.js";

export interface Overview {
  pending: number;
  users: number;
  spend_cents: number;
  budget_cents: number;
  currency: string;
  sessions_month: number;
  sessions_today: number;
  barbers_today: number;
  catalog_active: number;
  catalog_total: number;
}

type Sub = "home" | "users" | "catalog" | "sessions";

/** C1 — admin hub for one shop: users, catalog, sessions. Spend is a single
 * line against the Gemini cap, not a screen. */
export function Admin() {
  const { t } = useI18n();
  const nav = useNav();
  const [sub, setSub] = useState<Sub>("home");
  const [ov, setOv] = useState<Overview | null>(null);

  const load = useCallback(() => {
    api<Overview>("/api/admin/overview").then(setOv, () => {});
  }, []);
  useEffect(() => {
    if (sub === "home") load();
  }, [sub, load]);

  const back = () => setSub("home");
  if (sub === "users") return <Users onBack={back} />;
  if (sub === "catalog") return <Catalog onBack={back} />;
  if (sub === "sessions") return <Sessions onBack={back} />;

  const sym = ov?.currency === "EUR" ? "€" : (ov?.currency ?? "");
  const money = (cents: number) => `${sym}${(cents / 100).toFixed(0)}`;
  const attention = (ov?.pending ?? 0) > 0;
  const pct = ov && ov.budget_cents > 0 ? (ov.spend_cents / ov.budget_cents) * 100 : 0;
  const over = pct >= 100;

  return (
    <div className="screen">
      <TopBar label={t("admin.bar")} onBack={nav.pop} />
      <div style={{ padding: "28px 20px 0" }} className="col gap-10">
        <h1 className="serif-title" style={{ fontSize: 28 }}>
          {attention ? t("admin.attention") : t("admin.clear")}
        </h1>
      </div>

      {!ov ? (
        <div className="pad"><ProgressBar fraction="sweep" /></div>
      ) : (
        <div className="pad col gap-12">
          {attention && (
            <button
              className="anim"
              style={{ border: "1px solid var(--c-primary)", padding: 18, display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", textAlign: "left" }}
              onClick={() => setSub("users")}
            >
              <span className="col gap-4">
                <span style={{ fontSize: 12, letterSpacing: "0.24em", textTransform: "uppercase", color: "var(--c-secondary)" }}>
                  {t("users.pending")}
                </span>
                <span style={{ fontFamily: "var(--f-serif)", fontSize: 34, letterSpacing: "0.06em" }}>
                  {ov.pending}
                </span>
              </span>
              <span style={{ width: 8, height: 8, background: "var(--c-primary)", animation: "shimmer 1.8s ease-in-out infinite" }} />
            </button>
          )}
          <div style={{ border: "1px solid var(--c-border)", padding: 18, display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
            <span className="col gap-4">
              <span style={{ fontSize: 12, letterSpacing: "0.24em", textTransform: "uppercase", color: "var(--c-tertiary)" }}>
                {t("spend.sessions")}
              </span>
              <span style={{ fontFamily: "var(--f-serif)", fontSize: 34, letterSpacing: "0.06em" }}>
                {ov.sessions_today}
              </span>
            </span>
          </div>
          {over && (
            <div className="error-panel">
              <div className="panel-head">
                <span className="bang">!</span>
                <span className="panel-title">{t("spend.capreached")}</span>
              </div>
              <p className="body-copy" style={{ fontSize: 13 }}>{t("spend.over")}</p>
            </div>
          )}
        </div>
      )}

      <div className="pad-x col" style={{ paddingTop: 4 }}>
        <SectionLabel>{t("admin.bar")}</SectionLabel>
        <hr className="hairline" />
        <ListRow title={t("admin.users")} value={ov ? String(ov.users) : ""} onClick={() => setSub("users")} />
        <hr className="hairline" />
        <ListRow title={t("admin.catalog")} value={ov ? t("catalog.active", { n: ov.catalog_active, max: 9 }) : ""} onClick={() => setSub("catalog")} />
        <hr className="hairline" />
        <ListRow title={t("admin.sessions")} value={ov ? String(ov.sessions_month) : ""} onClick={() => setSub("sessions")} />
        <hr className="hairline" />
      </div>

      {/* The one spend surface: Gemini cost this month against the cap. */}
      {ov && (
        <div style={{ marginTop: "auto" }} className="pad-x col">
          <hr className="hairline" />
          <div style={{ height: 52, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: 11, letterSpacing: "0.2em", textTransform: "uppercase", color: "var(--c-tertiary)" }}>
              {t("spend.line")}
            </span>
            <span className="meta-text" style={over ? { color: "var(--c-primary)" } : undefined}>
              {money(ov.spend_cents)} / {money(ov.budget_cents)}
            </span>
          </div>
          <div className="progress-track" style={{ marginBottom: 20 }}>
            <div className="fill" style={{ width: `${Math.min(100, pct)}%` }} />
          </div>
        </div>
      )}
    </div>
  );
}
