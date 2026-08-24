import { useCallback, useEffect, useRef, useState } from "react";
import { PROMPT_PREFIX } from "@blackroom/shared/prompt";
import { useI18n } from "../../i18n.js";
import { api, ApiError } from "../../api.js";
import { Button, Field, ListRow, Modal, Toast, Toggle, TopBar } from "../../ui/primitives.js";

const MAX_ACTIVE = 9;
const PROMPT_MAX = 600;
const ROW_H = 62;
const MAX_UPLOAD_MB = 15;

export interface Haircut {
  id: string;
  name_en: string;
  name_ru: string | null;
  prompt: string;
  sort_order: number;
  is_active: boolean;
}

/** Example descriptions drawn from the seeded cuts that already work well. */
const PRESETS: Array<{ labelKey: "preset.buzz" | "preset.fade" | "preset.pompadour" | "preset.slick"; text: string }> = [
  {
    labelKey: "preset.buzz",
    text: "a buzz cut: one uniform clipper length of about 4mm over the entire head, clean sharp edges around the ears and neckline",
  },
  {
    labelKey: "preset.fade",
    text: "a mid fade with textured top: sides faded from skin at mid-ear up into a choppy, matte-textured top of 5-7cm with visible separation between strands",
  },
  {
    labelKey: "preset.pompadour",
    text: "a pompadour: generous volume on top swept up and back away from the forehead with a smooth glossy finish, sides tapered short",
  },
  {
    labelKey: "preset.slick",
    text: "a slick back: medium-length hair on top combed straight back flat against the head with a sleek finish, sides tapered",
  },
];

/** C5 — catalog: drag reorder, toggles, test-photo row, editor. */
export function Catalog({ onBack }: { onBack: () => void }) {
  const { t, lang } = useI18n();
  const [cuts, setCuts] = useState<Haircut[] | null>(null);
  const [editing, setEditing] = useState<Haircut | "new" | null>(null);
  const [limitMsg, setLimitMsg] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [testPhoto, setTestPhoto] = useState<{ exists: boolean; url?: string | null } | null>(null);
  const [drag, setDrag] = useState<{ index: number; dy: number } | null>(null);
  const dragRef = useRef<{ startY: number; from: number; order: Haircut[] } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2500);
  }, []);

  const load = useCallback(() => {
    api<Haircut[]>("/api/admin/haircuts").then(setCuts, () => setCuts([]));
    api<{ exists: boolean; url?: string | null }>("/api/admin/test-photo").then(setTestPhoto, () => {});
  }, []);
  useEffect(load, [load]);

  const displayName = (c: Haircut) => (lang === "ru" && c.name_ru ? c.name_ru : c.name_en);
  const activeCount = cuts?.filter((c) => c.is_active).length ?? 0;

  const toggle = async (cut: Haircut) => {
    // Optimistic — flip locally, revert on failure.
    setCuts((cs) => cs?.map((c) => (c.id === cut.id ? { ...c, is_active: !c.is_active } : c)) ?? null);
    try {
      await api(`/api/admin/haircuts/${cut.id}`, {
        method: "PATCH",
        body: JSON.stringify({ is_active: !cut.is_active }),
      });
      setLimitMsg(false);
    } catch (e) {
      setCuts((cs) => cs?.map((c) => (c.id === cut.id ? { ...c, is_active: cut.is_active } : c)) ?? null);
      if (e instanceof ApiError && e.reason === "active_limit") setLimitMsg(true);
      else showToast(t("toast.error"));
    }
  };

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

  const uploadTestPhoto = async (file: File) => {
    if (file.size > MAX_UPLOAD_MB * 1024 * 1024) {
      showToast(t("capture.error.toobig", { mb: MAX_UPLOAD_MB }));
      return;
    }
    try {
      const { upload_url } = await api<{ upload_url: string }>("/api/admin/test-photo", { method: "POST" });
      const put = await fetch(upload_url, {
        method: "PUT",
        headers: { "content-type": file.type || "image/jpeg" },
        body: file,
      });
      if (!put.ok) throw new Error("upload failed");
      await api("/api/admin/test-photo/confirm", { method: "POST" });
      showToast(t("testphoto.saved"));
      load();
    } catch (e) {
      showToast(e instanceof ApiError && e.status === 422 ? t("testphoto.rejected") : t("toast.error"));
    }
  };

  /** Optimistic save: apply locally, toast, close; server failure reverts. */
  const save = (cut: Haircut | null, fields: { name_en: string; prompt: string }) => {
    if (cut) {
      const before = cuts;
      setCuts((cs) => cs?.map((c) => (c.id === cut.id ? { ...c, ...fields } : c)) ?? null);
      setEditing(null);
      showToast(t("toast.saved"));
      api(`/api/admin/haircuts/${cut.id}`, { method: "PATCH", body: JSON.stringify(fields) }).catch(() => {
        setCuts(before ?? null);
        showToast(t("toast.error"));
      });
    } else {
      // Creation needs the server id — still close immediately, insert on return.
      setEditing(null);
      showToast(t("toast.saved"));
      api<Haircut>("/api/admin/haircuts", { method: "POST", body: JSON.stringify(fields) }).then(
        (created) => setCuts((cs) => [...(cs ?? []), created]),
        () => showToast(t("toast.error")),
      );
    }
  };

  const remove = (cut: Haircut) => {
    const before = cuts;
    setCuts((cs) => cs?.filter((c) => c.id !== cut.id) ?? null);
    setEditing(null);
    showToast(t("toast.deleted"));
    api(`/api/admin/haircuts/${cut.id}`, { method: "DELETE" }).catch(() => {
      setCuts(before ?? null);
      showToast(t("toast.error"));
    });
  };

  if (editing) {
    return (
      <>
        <CutEditor
          cut={editing === "new" ? null : editing}
          existingNames={(cuts ?? [])
            .filter((c) => editing === "new" || c.id !== editing.id)
            .map((c) => c.name_en.toLowerCase())}
          testPhotoExists={testPhoto?.exists ?? false}
          onSave={(fields) => save(editing === "new" ? null : editing, fields)}
          onDelete={editing === "new" ? undefined : () => remove(editing)}
          onDuplicated={(copy) => {
            setCuts((cs) => [...(cs ?? []), copy]);
            setEditing(copy);
            showToast(t("cut.duplicated"));
          }}
          onClose={() => setEditing(null)}
        />
        {toast && <Toast message={toast} />}
      </>
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
            {limitMsg && <span className="field-error">{t("catalog.limit", { max: MAX_ACTIVE })}</span>}
          </div>
          <div className="pad-x col">
            <hr className="hairline" />
            {(cuts ?? []).map((cut, i) => {
              const isDragging = drag?.index === i && dragRef.current;
              return (
                <span key={cut.id}>
                  <div
                    style={{
                      height: ROW_H, display: "flex", alignItems: "center", gap: 14,
                      opacity: cut.is_active ? 1 : 0.45,
                      ...(isDragging
                        ? { background: "var(--c-surface)", border: "1px solid var(--c-borderStrong)", padding: "0 12px", transform: `translateY(${drag!.dy}px)`, position: "relative", zIndex: 2 }
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

      {/* One designated test portrait per shop, used by the editor's test run. */}
      <div style={{ marginTop: "auto" }} className="pad-x col">
        <hr className="hairline" />
        <ListRow
          title={t("testphoto.title")}
          sub={t("testphoto.sub")}
          right={
            testPhoto?.url ? (
              <img src={testPhoto.url} alt="" style={{ width: 40, height: 40, objectFit: "cover", border: "1px solid var(--c-borderStrong)" }} />
            ) : undefined
          }
          value={testPhoto?.exists ? t("testphoto.replace") : t("testphoto.set")}
          onClick={() => fileRef.current?.click()}
        />
        <hr className="hairline" />
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/*,.heic,.heif"
        style={{ display: "none" }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) void uploadTestPhoto(f);
        }}
      />
      <div className="bottom-dock" style={{ marginTop: 0 }}>
        <Button variant="primary" onClick={() => setEditing("new")}>
          {t("catalog.add")}
        </Button>
      </div>
      {toast && <Toast message={toast} />}
    </div>
  );
}

/** C6 — the editor as a tool: fixed wrapper context, presets, live test. */
function CutEditor({
  cut,
  existingNames,
  testPhotoExists,
  onSave,
  onDelete,
  onDuplicated,
  onClose,
}: {
  cut: Haircut | null;
  existingNames: string[];
  testPhotoExists: boolean;
  onSave: (fields: { name_en: string; prompt: string }) => void;
  onDelete?: (() => void) | undefined;
  onDuplicated: (copy: Haircut) => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [name, setName] = useState(cut?.name_en ?? "");
  const [prompt, setPrompt] = useState(cut?.prompt ?? "");
  const [nameError, setNameError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [test, setTest] = useState<
    | { state: "idle" }
    | { state: "running" }
    | { state: "done"; url: string }
    | { state: "error"; message: string }
  >({ state: "idle" });

  const dirty = name !== (cut?.name_en ?? "") || prompt !== (cut?.prompt ?? "");
  const nameTaken = existingNames.includes(name.trim().toLowerCase());
  const valid =
    name.trim().length > 0 && !nameTaken && prompt.trim().length > 0 && prompt.length <= PROMPT_MAX;

  const save = () => {
    if (nameTaken) {
      setNameError(t("cut.name.taken"));
      return;
    }
    onSave({ name_en: name.trim(), prompt: prompt.trim() });
  };

  const runTest = async () => {
    setTest({ state: "running" });
    try {
      const r = await api<{ url: string }>("/api/admin/haircuts/test", {
        method: "POST",
        body: JSON.stringify({ prompt: prompt.trim() }),
      });
      setTest({ state: "done", url: r.url });
    } catch (e) {
      const key =
        e instanceof ApiError && e.reason === "no_test_photo"
          ? "cut.test.nophoto"
          : e instanceof ApiError && e.reason === "rate_limited"
            ? "cut.test.ratelimit"
            : e instanceof ApiError && e.reason === "budget"
              ? "cut.test.budget"
              : "cut.test.failed";
      setTest({ state: "error", message: t(key) });
    }
  };

  const duplicate = async () => {
    if (!cut) return;
    try {
      const copy = await api<Haircut>(`/api/admin/haircuts/${cut.id}/duplicate`, { method: "POST" });
      onDuplicated(copy);
    } catch {
      setTest({ state: "error", message: t("toast.error") });
    }
  };

  const back = () => (dirty ? setConfirmDiscard(true) : onClose());

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
        <Field label={t("cut.name.label")} error={nameError ?? (nameTaken ? t("cut.name.taken") : undefined)}>
          <input
            className={nameError || nameTaken ? "input error" : "input"}
            value={name}
            maxLength={80}
            onChange={(e) => {
              setName(e.target.value);
              setNameError(null);
            }}
          />
        </Field>
      </div>

      <div className="col gap-10" style={{ padding: "26px 20px 0" }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
          <span className="field-label">{t("cut.prompt.label")}</span>
          <span className="mono" style={{ fontSize: 10, color: prompt.length > PROMPT_MAX ? "var(--c-primary)" : "var(--c-tertiary)" }}>
            {prompt.length} / {PROMPT_MAX}
          </span>
        </div>

        {/* The owner writes the description; the system owns the wrapper. */}
        <div className="wrapper-note">{PROMPT_PREFIX}</div>
        <textarea
          className="input-multi"
          rows={5}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder={t("cut.prompt.hint")}
        />
        <div className="wrapper-note" style={{ fontFamily: "var(--f-sans)" }}>{t("cut.wrapper.after")}</div>

        <div className="col gap-8" style={{ paddingTop: 6 }}>
          <span className="field-label">{t("cut.presets")}</span>
          <div className="chip-row">
            {PRESETS.map((p) => (
              <button key={p.labelKey} onClick={() => setPrompt(p.text)}>
                {t(p.labelKey)}
              </button>
            ))}
          </div>
        </div>

        {/* Test before saving — one generation on the stored test portrait. */}
        <div className="col gap-10" style={{ paddingTop: 10 }}>
          <Button
            variant="secondary"
            disabled={prompt.trim().length === 0 || test.state === "running"}
            onClick={() => void runTest()}
          >
            {test.state === "running" ? t("cut.test.running") : t("cut.test")}
          </Button>
          {!testPhotoExists && test.state === "idle" && (
            <span className="hint-copy" style={{ fontSize: 11 }}>{t("cut.test.nophoto")}</span>
          )}
          {test.state === "running" && (
            <div className="tile skeleton anim" style={{ maxWidth: 220 }} />
          )}
          {test.state === "done" && (
            <img src={test.url} alt="" style={{ maxWidth: 220, border: "1px solid var(--c-borderStrong)" }} />
          )}
          {test.state === "error" && <span className="field-error">{test.message}</span>}
        </div>
      </div>

      <div className="bottom-dock">
        <Button variant="primary" disabled={!valid || !dirty} onClick={save}>
          {t("cut.save")}
        </Button>
        <div className="row2">
          {cut && (
            <Button variant="secondary" onClick={() => void duplicate()}>
              {t("cut.duplicate")}
            </Button>
          )}
          {onDelete && (
            <Button variant="destructive" onClick={() => setConfirmDelete(true)}>
              {t("cut.delete")}
            </Button>
          )}
          {!cut && (
            <Button variant="secondary" onClick={back}>
              {t("cut.discard")}
            </Button>
          )}
        </div>
      </div>

      {confirmDelete && onDelete && (
        <Modal title={t("cut.delete.confirm.title")} onClose={() => setConfirmDelete(false)}>
          <p className="body-copy" style={{ fontSize: 13 }}>{t("cut.delete.confirm")}</p>
          <div className="row2" style={{ marginTop: 4 }}>
            <Button variant="secondary" onClick={() => setConfirmDelete(false)}>
              {t("common.cancel")}
            </Button>
            <Button variant="primary" onClick={onDelete}>
              {t("common.delete")}
            </Button>
          </div>
        </Modal>
      )}
      {confirmDiscard && (
        <Modal title={t("cut.unsaved.title")} onClose={() => setConfirmDiscard(false)}>
          <div className="row2" style={{ marginTop: 4 }}>
            <Button variant="secondary" onClick={onClose}>
              {t("cut.discard")}
            </Button>
            <Button variant="primary" disabled={!valid} onClick={save}>
              {t("cut.save")}
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
