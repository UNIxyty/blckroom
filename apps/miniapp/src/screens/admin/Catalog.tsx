import { useCallback, useEffect, useRef, useState } from "react";
import { useI18n } from "../../i18n.js";
import { api, ApiError } from "../../api.js";
import { Button, Field, Modal, Toggle, TopBar } from "../../ui/primitives.js";

const MAX_ACTIVE = 9;
const PROMPT_MAX = 600;
const ROW_H = 62;

export interface Haircut {
  id: string;
  name_en: string;
  name_ru: string | null;
  prompt: string;
  sort_order: number;
  is_active: boolean;
}

/** C5 — catalog list: drag to reorder, toggle active, tap name to edit. */
export function Catalog({ onBack }: { onBack: () => void }) {
  const { t, lang } = useI18n();
  const [cuts, setCuts] = useState<Haircut[] | null>(null);
  const [editing, setEditing] = useState<Haircut | "new" | null>(null);
  const [limitMsg, setLimitMsg] = useState(false);
  const [drag, setDrag] = useState<{ index: number; dy: number } | null>(null);
  const dragRef = useRef<{ startY: number; from: number; order: Haircut[] } | null>(null);

  const load = useCallback(() => {
    api<Haircut[]>("/api/admin/haircuts").then(setCuts, () => setCuts([]));
  }, []);
  useEffect(load, [load]);

  const displayName = (c: Haircut) => (lang === "ru" && c.name_ru ? c.name_ru : c.name_en);
  const activeCount = cuts?.filter((c) => c.is_active).length ?? 0;

  const toggle = async (cut: Haircut) => {
    try {
      await api(`/api/admin/haircuts/${cut.id}`, {
        method: "PATCH",
        body: JSON.stringify({ is_active: !cut.is_active }),
      });
      setLimitMsg(false);
      load();
    } catch (e) {
      if (e instanceof ApiError && e.reason === "active_limit") setLimitMsg(true);
    }
  };

  // Pointer-drag reorder: handle press starts, vertical movement swaps rows,
  // release persists the order.
  const startDrag = (index: number) => (e: React.PointerEvent) => {
    if (!cuts) return;
    (e.target as Element).setPointerCapture(e.pointerId);
    dragRef.current = { startY: e.clientY, from: index, order: [...cuts] };
    setDrag({ index, dy: 0 });
  };

  const moveDrag = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d || !cuts) return;
    const dy = e.clientY - d.startY;
    const shift = Math.round(dy / ROW_H);
    const to = Math.max(0, Math.min(d.order.length - 1, d.from + shift));
    const next = [...d.order];
    const [moved] = next.splice(d.from, 1);
    next.splice(to, 0, moved!);
    setCuts(next);
    setDrag({ index: to, dy: dy - shift * ROW_H });
  };

  const endDrag = () => {
    if (!dragRef.current || !cuts) return;
    dragRef.current = null;
    setDrag(null);
    void api("/api/admin/haircuts/reorder", {
      method: "POST",
      body: JSON.stringify({ ids: cuts.map((c) => c.id) }),
    });
  };

  if (editing) {
    return (
      <CutEditor
        cut={editing === "new" ? null : editing}
        onClose={(changed) => {
          setEditing(null);
          if (changed) load();
        }}
      />
    );
  }

  return (
    <div className="screen">
      <TopBar label={t("admin.catalog")} onBack={onBack} />
      {cuts && cuts.length === 0 ? (
        <div className="empty-state">
          <div style={{ width: 44, height: 44, border: "1px solid var(--c-borderStrong)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--f-serif)", fontSize: 24, color: "var(--c-tertiary)" }}>+</div>
          <h2 className="serif-title" style={{ fontSize: 26 }}>{t("catalog.empty.title")}</h2>
          <p className="hint-copy" style={{ fontSize: 13 }}>{t("catalog.empty.body")}</p>
        </div>
      ) : (
        <>
          <div style={{ padding: "26px 20px 18px" }} className="col gap-8">
            <h1 className="serif-title" style={{ fontSize: 28 }}>
              {t("catalog.active", { n: activeCount, max: MAX_ACTIVE })}
            </h1>
            <span className="hint-copy" style={{ fontSize: 12 }}>{t("catalog.hint")}</span>
            {limitMsg && (
              <span className="field-error">{t("catalog.limit", { max: MAX_ACTIVE })}</span>
            )}
          </div>
          <div className="pad-x col">
            <hr className="hairline" />
            {(cuts ?? []).map((cut, i) => {
              const isDragging = drag?.index === i && dragRef.current;
              return (
                <span key={cut.id}>
                  <div
                    style={{
                      height: ROW_H,
                      display: "flex",
                      alignItems: "center",
                      gap: 14,
                      opacity: cut.is_active ? 1 : 0.45,
                      ...(isDragging
                        ? {
                            background: "var(--c-surface)",
                            border: "1px solid var(--c-borderStrong)",
                            padding: "0 12px",
                            transform: `translateY(${drag!.dy}px)`,
                            position: "relative",
                            zIndex: 2,
                          }
                        : {}),
                    }}
                  >
                    <span
                      style={{ width: 20, display: "flex", flexDirection: "column", gap: 3, touchAction: "none", cursor: "grab", padding: "12px 0" }}
                      onPointerDown={startDrag(i)}
                      onPointerMove={moveDrag}
                      onPointerUp={endDrag}
                      onPointerCancel={endDrag}
                    >
                      {[0, 1, 2].map((k) => (
                        <span key={k} style={{ height: 1, background: isDragging ? "var(--c-primary)" : "var(--c-borderStrong)", display: "block" }} />
                      ))}
                    </span>
                    <button
                      style={{ flex: 1, fontSize: 14, letterSpacing: "0.04em", textAlign: "left", fontWeight: isDragging ? 500 : 400 }}
                      onClick={() => setEditing(cut)}
                    >
                      {displayName(cut)}
                    </button>
                    <Toggle on={cut.is_active} onChange={() => void toggle(cut)} />
                  </div>
                  <hr className="hairline" />
                </span>
              );
            })}
          </div>
        </>
      )}
      <div className="bottom-dock">
        <Button variant="primary" onClick={() => setEditing("new")}>
          {t("catalog.add")}
        </Button>
      </div>
    </div>
  );
}

/** C6 — full-screen cut editor: name + generation prompt only. */
function CutEditor({ cut, onClose }: { cut: Haircut | null; onClose: (changed: boolean) => void }) {
  const { t } = useI18n();
  const [name, setName] = useState(cut?.name_en ?? "");
  const [prompt, setPrompt] = useState(cut?.prompt ?? "");
  const [nameError, setNameError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  const dirty = name !== (cut?.name_en ?? "") || prompt !== (cut?.prompt ?? "");
  const valid = name.trim().length > 0 && prompt.trim().length > 0 && prompt.length <= PROMPT_MAX;

  const save = async () => {
    setSaving(true);
    setNameError(null);
    try {
      const body = JSON.stringify({ name_en: name.trim(), prompt: prompt.trim() });
      if (cut) {
        await api(`/api/admin/haircuts/${cut.id}`, { method: "PATCH", body });
      } else {
        await api("/api/admin/haircuts", { method: "POST", body });
      }
      onClose(true);
    } catch (e) {
      if (e instanceof ApiError && e.reason === "name_taken") setNameError(t("cut.name.taken"));
      else if (e instanceof ApiError && e.reason === "active_limit")
        setNameError(t("catalog.limit", { max: MAX_ACTIVE }));
      else setNameError(t("error.generic"));
      setSaving(false);
    }
  };

  const remove = async () => {
    setConfirmDelete(false);
    await api(`/api/admin/haircuts/${cut!.id}`, { method: "DELETE" });
    onClose(true);
  };

  const back = () => (dirty ? setConfirmDiscard(true) : onClose(false));

  return (
    <div className="screen">
      <TopBar
        label={cut ? t("cut.edit") : t("cut.new")}
        onBack={back}
        right={
          dirty ? (
            <span style={{ fontSize: 10, letterSpacing: "0.2em", textTransform: "uppercase", padding: "0 12px" }}>
              {t("cut.unsaved.title")}
            </span>
          ) : undefined
        }
      />
      <div className="col gap-10" style={{ padding: "24px 20px 0" }}>
        <Field label={t("cut.name.label")} error={nameError ?? undefined}>
          <input
            className={nameError ? "input error" : "input"}
            value={name}
            maxLength={80}
            onChange={(e) => {
              setName(e.target.value);
              setNameError(null);
            }}
          />
        </Field>
      </div>
      <div className="grow col gap-10" style={{ padding: "26px 20px 0" }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
          <span className="field-label">{t("cut.prompt.label")}</span>
          <span className="mono" style={{ fontSize: 10, color: prompt.length > PROMPT_MAX ? "var(--c-primary)" : "var(--c-tertiary)" }}>
            {prompt.length} / {PROMPT_MAX}
          </span>
        </div>
        <textarea
          className="input-multi"
          style={{ flex: 1 }}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
        />
        <div style={{ borderLeft: "1px solid var(--c-borderStrong)", paddingLeft: 12 }}>
          <span className="hint-copy" style={{ fontSize: 11 }}>{t("cut.prompt.hint")}</span>
        </div>
      </div>
      <div className="bottom-dock">
        <Button variant="primary" disabled={!valid || !dirty || saving} onClick={() => void save()}>
          {t("cut.save")}
        </Button>
        <div className="row2">
          <Button variant="secondary" onClick={back}>
            {t("cut.discard")}
          </Button>
          {cut && (
            <Button variant="destructive" onClick={() => setConfirmDelete(true)}>
              {t("cut.delete")}
            </Button>
          )}
        </div>
      </div>

      {confirmDelete && (
        <Modal title={t("cut.delete.confirm.title")} onClose={() => setConfirmDelete(false)}>
          <p className="body-copy" style={{ fontSize: 13 }}>{t("cut.delete.confirm")}</p>
          <div className="row2" style={{ marginTop: 4 }}>
            <Button variant="secondary" onClick={() => setConfirmDelete(false)}>
              {t("common.cancel")}
            </Button>
            <Button variant="primary" onClick={() => void remove()}>
              {t("common.delete")}
            </Button>
          </div>
        </Modal>
      )}
      {confirmDiscard && (
        <Modal title={t("cut.unsaved.title")} onClose={() => setConfirmDiscard(false)}>
          <div className="row2" style={{ marginTop: 4 }}>
            <Button variant="secondary" onClick={() => onClose(false)}>
              {t("cut.discard")}
            </Button>
            <Button variant="primary" disabled={!valid} onClick={() => void save()}>
              {t("cut.save")}
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
