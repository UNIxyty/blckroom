import { useI18n } from "../i18n.js";
import { useNav } from "../nav.js";
import { BREmblem, ListRow, Badge } from "../ui/primitives.js";
import type { Me } from "../api.js";

/** B1 — Home hub for barber and owner. */
export function Home({ me, sessionCount }: { me: Me; sessionCount: number | null }) {
  const { t } = useI18n();
  const nav = useNav();
  const isOwner = me.role === "owner" || me.role === "superadmin";
  const pending = me.pending_count ?? 0;

  return (
    <div className="screen">
      <div className="topbar" />
      <div style={{ padding: "32px 20px 0" }}>
        <h1 className="wordmark">Black Room</h1>
        <div style={{ width: 120, height: 1, background: "var(--c-borderStrong)", margin: "14px 0 10px" }} />
        <div style={{ fontSize: 11, letterSpacing: "0.28em", textTransform: "uppercase", color: "var(--c-tertiary)" }}>
          {me.first_name ?? me.username ?? ""} · {t(isOwner ? "home.role.owner" : "home.role.barber")}
        </div>
      </div>

      <div style={{ padding: "36px 20px 0" }}>
        <button className="home-cta" onClick={() => nav.push("consent")}>
          <span className="mini-grid">
            {Array.from({ length: 9 }, (_, i) => (
              <i key={i} className={i === 4 ? "lit" : ""} />
            ))}
          </span>
          <span>
            <span className="cta-title" style={{ display: "block" }}>{t("home.cta")}</span>
            <span className="cta-sub" style={{ display: "block" }}>{t("home.cta.sub")}</span>
          </span>
        </button>
      </div>

      <div className="col pad-x" style={{ paddingTop: 12 }}>
        <hr className="hairline" style={{ marginTop: 24 }} />
        <ListRow
          title={t("home.history")}
          sub={
            sessionCount === null
              ? undefined
              : sessionCount === 0
                ? t("home.history.none")
                : t("home.history.sub", { n: sessionCount })
          }
          arrow
          onClick={() => nav.push("history")}
        />
        <hr className="hairline" />
        {isOwner && (
          <>
            <ListRow
              title={t("home.admin")}
              emphasis={pending > 0}
              sub={pending > 0 ? t("home.admin.waiting", { n: pending }) : t("home.admin.clear")}
              right={pending > 0 ? <Badge>{pending}</Badge> : undefined}
              arrow={pending === 0}
              onClick={() => nav.push("admin")}
            />
            <hr className="hairline" />
          </>
        )}
        <ListRow
          title={t("home.settings")}
          sub={t("home.settings.sub")}
          arrow
          onClick={() => nav.push("settings")}
        />
        <hr className="hairline" />
      </div>

      <div style={{ marginTop: "auto", padding: 20, display: "flex", justifyContent: "center" }}>
        <BREmblem size={40} />
      </div>
    </div>
  );
}
