import { useState } from "react";
import { useI18n } from "../i18n.js";
import { useNav } from "../nav.js";
import { api, ApiError } from "../api.js";
import { Button, TopBar } from "../ui/primitives.js";

export interface NewSession {
  session_id: string;
  upload_url: string;
  source_path: string;
}

/** B2 — consent gates the camera; the session (and consent timestamp) is
 * created the moment the barber confirms. */
export function Consent() {
  const { t } = useI18n();
  const nav = useNav();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const accept = async () => {
    setBusy(true);
    setError(null);
    try {
      const session = await api<NewSession>("/api/sessions", {
        method: "POST",
        body: JSON.stringify({ consent: true }),
      });
      nav.replace("capture", { session });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t("error.generic"));
      setBusy(false);
    }
  };

  return (
    <div className="screen">
      <TopBar label={t("consent.bar")} onBack={nav.pop} />
      <div className="grow col" style={{ padding: "44px 24px 24px" }}>
        <h1 className="serif-title" style={{ fontSize: 34, letterSpacing: "0.1em" }}>
          {t("consent.title")}
        </h1>
        <div style={{ height: 1, background: "var(--c-border)", margin: "26px 0" }} />
        <p className="body-copy" style={{ fontSize: 15 }}>{t("consent.body", { hours: 24 })}</p>
        <div className="col" style={{ marginTop: 32 }}>
          <hr className="hairline" />
          {(["consent.point1", "consent.point2"] as const).map((key) => (
            <span key={key}>
              <div style={{ height: 58, display: "flex", alignItems: "center", gap: 14 }}>
                <span style={{ width: 5, height: 5, background: "var(--c-tertiary)", flex: "0 0 5px" }} />
                <span style={{ fontSize: 13, color: "var(--c-secondary)", letterSpacing: "0.04em" }}>
                  {t(key)}
                </span>
              </div>
              <hr className="hairline" />
            </span>
          ))}
        </div>
        {error && <p className="hint-copy" style={{ marginTop: 16 }}>{error}</p>}
        <div style={{ marginTop: "auto" }} className="col gap-12">
          <p className="hint-copy">{t("consent.say")}</p>
          <Button variant="primary" disabled={busy} onClick={() => void accept()}>
            {t("consent.accept")}
          </Button>
        </div>
      </div>
    </div>
  );
}
