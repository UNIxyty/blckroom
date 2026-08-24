import { useCallback, useEffect, useState } from "react";
import { useI18n } from "../../i18n.js";
import { useNav } from "../../nav.js";
import { api } from "../../api.js";
import { ListRow, ProgressBar, SectionLabel, TopBar } from "../../ui/primitives.js";
import { Catalog } from "./Catalog.js";
import { Users } from "./Users.js";
import { Spend } from "./Spend.js";
import { Sessions } from "./Sessions.js";
import { ShopSettings } from "./ShopSettings.js";
import { AuditLog } from "./AuditLog.js";

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

type Sub = "home" | "users" | "catalog" | "spend" | "sessions" | "shop" | "audit";

/** C1 — admin hub; one level deep, sections push over it. */
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
  if (sub === "spend") return <Spend onBack={back} />;
  if (sub === "sessions") return <Sessions onBack={back} />;
  if (sub === "shop") return <ShopSettings onBack={back} />;
  if (sub === "audit") return <AuditLog onBack={back} />;

  const money = (cents: number) => `${ov?.currency === "EUR" ? "€" : (ov?.currency ?? "")}${Math.round(cents / 100)}`;
  const attention = (ov?.pending ?? 0) > 0;

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
                {t("spend.spent")} · {t("spend.month").toLowerCase()}
              </span>
              <span style={{ fontFamily: "var(--f-serif)", fontSize: 34, letterSpacing: "0.06em" }}>
                {money(ov.spend_cents)}
              </span>
            </span>
            <span className="meta-text">/ {money(ov.budget_cents)}</span>
          </div>
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
        </div>
      )}

      <div className="pad-x col" style={{ paddingTop: 14 }}>
        <SectionLabel>{t("admin.bar")}</SectionLabel>
        <hr className="hairline" />
        <ListRow title={t("admin.users")} value={ov ? String(ov.users) : ""} onClick={() => setSub("users")} />
        <hr className="hairline" />
        <ListRow title={t("admin.catalog")} value={ov ? t("catalog.active", { n: ov.catalog_active, max: 9 }) : ""} onClick={() => setSub("catalog")} />
        <hr className="hairline" />
        <ListRow title={t("admin.sessions")} value={ov ? String(ov.sessions_month) : ""} onClick={() => setSub("sessions")} />
        <hr className="hairline" />
        <ListRow title={t("admin.spend")} value={ov ? money(ov.spend_cents) : ""} onClick={() => setSub("spend")} />
        <hr className="hairline" />
        <ListRow title={t("admin.shop")} arrow onClick={() => setSub("shop")} />
        <hr className="hairline" />
        <ListRow title={t("admin.audit")} arrow onClick={() => setSub("audit")} />
        <hr className="hairline" />
      </div>
    </div>
  );
}
