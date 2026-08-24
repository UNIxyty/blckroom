import { useState } from "react";
import { useI18n } from "../i18n.js";
import { useNav } from "../nav.js";
import { api } from "../api.js";
import { BottomSheet, BREmblem, Button, ListRow, Modal, SectionLabel, TopBar } from "../ui/primitives.js";
import type { Me } from "../api.js";

/** B8 — Settings: language, tour replay, data deletion. */
export function Settings({ me, onReplayTour }: { me: Me; onReplayTour: () => void }) {
  const { t, lang, setLanguage } = useI18n();
  const nav = useNav();
  const [langSheet, setLangSheet] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteResult, setDeleteResult] = useState<string | null>(null);

  const joined = me.created_at
    ? new Date(me.created_at).toLocaleDateString(undefined, { month: "long", year: "numeric" })
    : "";
  const isOwner = me.role === "owner" || me.role === "superadmin";

  const runDelete = async () => {
    setConfirmDelete(false);
    const r = await api<{ sessions: number; images: number }>("/api/me/delete-data", {
      method: "POST",
    });
    setDeleteResult(t("settings.delete.done", { images: r.images, sessions: r.sessions }));
  };

  return (
    <div className="screen">
      <TopBar label={t("settings.bar")} onBack={nav.pop} />
      <div style={{ padding: "26px 20px 0" }} className="col gap-8">
        <h1 className="serif-title" style={{ fontSize: 26 }}>
          {me.first_name ?? me.username ?? ""}
        </h1>
        <div style={{ fontSize: 11, letterSpacing: "0.24em", textTransform: "uppercase", color: "var(--c-tertiary)" }}>
          {t(isOwner ? "home.role.owner" : "home.role.barber")} · {t("settings.joined", { date: joined })}
        </div>
      </div>

      <div className="pad-x" style={{ paddingTop: 34 }}>
        <SectionLabel>{t("settings.prefs")}</SectionLabel>
        <hr className="hairline" />
        <ListRow
          title={t("settings.language")}
          value={lang.toUpperCase()}
          onClick={() => setLangSheet(true)}
        />
        <hr className="hairline" />
        <ListRow
          title={t("settings.replay")}
          sub={t("settings.replay.sub")}
          arrow
          onClick={onReplayTour}
        />
        <hr className="hairline" />
      </div>

      <div className="pad-x" style={{ paddingTop: 34 }}>
        <SectionLabel>{t("settings.data")}</SectionLabel>
        <hr className="hairline" />
        <ListRow title={t("settings.delete")} onClick={() => setConfirmDelete(true)} />
        <hr className="hairline" />
      </div>

      {deleteResult && (
        <p className="hint-copy pad-x" style={{ paddingTop: 12 }}>{deleteResult}</p>
      )}

      <div style={{ marginTop: "auto", padding: 20, display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
        <BREmblem size={36} />
        <div className="mono" style={{ fontSize: 10, color: "var(--c-borderStrong)" }}>v2.0.0</div>
      </div>

      {langSheet && (
        <BottomSheet onClose={() => setLangSheet(false)}>
          <SectionLabel>{t("settings.language")}</SectionLabel>
          <button
            className="lang-option"
            style={lang === "en" ? { borderColor: "var(--c-primary)" } : undefined}
            onClick={() => { void setLanguage("en"); setLangSheet(false); }}
          >
            {t("lang.en")}
          </button>
          <button
            className="lang-option"
            style={lang === "ru" ? { borderColor: "var(--c-primary)" } : undefined}
            onClick={() => { void setLanguage("ru"); setLangSheet(false); }}
          >
            {t("lang.ru")}
          </button>
        </BottomSheet>
      )}

      {confirmDelete && (
        <Modal title={t("settings.delete.confirm.title")} onClose={() => setConfirmDelete(false)}>
          <p className="body-copy" style={{ fontSize: 13 }}>{t("settings.delete.confirm.body")}</p>
          <div className="row2" style={{ marginTop: 4 }}>
            <Button variant="secondary" onClick={() => setConfirmDelete(false)}>
              {t("common.cancel")}
            </Button>
            <Button variant="primary" onClick={() => void runDelete()}>
              {t("common.delete")}
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
