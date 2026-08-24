import { useI18n } from "../i18n.js";
import { BREmblem, Button, ProgressBar } from "../ui/primitives.js";
import { getWebApp } from "../telegram.js";
import type { Me } from "../api.js";

/** B9 — pending approval / suspended full-screen states. */
export function StatusScreen({ me, kind }: { me: Me; kind: "pending" | "suspended" }) {
  const { t } = useI18n();
  const date = me.created_at
    ? new Date(me.created_at).toLocaleDateString(undefined, { day: "numeric", month: "short" })
    : "";

  return (
    <div className="screen">
      <div className="topbar" />
      <div className="centered">
        <div style={{ width: 120 }}>
          {kind === "pending" ? (
            <ProgressBar fraction="sweep" />
          ) : (
            <div style={{ height: 2, background: "var(--c-borderStrong)" }} />
          )}
        </div>
        <div>
          <h1 className="serif-title" style={{ fontSize: 30, letterSpacing: "0.12em" }}>
            {t(kind === "pending" ? "pending.title" : "suspended.title")}
          </h1>
          <div style={{ width: 60, height: 1, background: "var(--c-borderStrong)", margin: "22px auto" }} />
          <p className="body-copy">{t(kind === "pending" ? "pending.body" : "suspended.body")}</p>
        </div>
        {kind === "pending" && (
          <div style={{ fontSize: 11, letterSpacing: "0.24em", textTransform: "uppercase", color: "var(--c-tertiary)" }}>
            {t("pending.requested", { date })}
          </div>
        )}
      </div>
      <div className="bottom-dock" style={{ alignItems: "center", gap: 14 }}>
        {me.owner_contact && (
          <Button
            variant="secondary"
            onClick={() => getWebApp()?.openTelegramLink(`https://t.me/${me.owner_contact}`)}
          >
            {t("pending.message")}
          </Button>
        )}
        <BREmblem size={36} />
      </div>
    </div>
  );
}
