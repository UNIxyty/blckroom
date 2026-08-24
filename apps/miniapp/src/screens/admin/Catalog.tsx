import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../../api.js";

interface Haircut {
  id: string;
  name_en: string;
  name_ru: string | null;
  prompt: string;
  price_cents: number;
  duration_minutes: number;
  sort_order: number;
  is_active: boolean;
  reference_image_url: string | null;
}

export function Catalog() {
  const [cuts, setCuts] = useState<Haircut[] | null>(null);
  const [editing, setEditing] = useState<Haircut | "new" | null>(null);

  const load = useCallback(() => {
    api<Haircut[]>("/api/admin/haircuts").then(setCuts, () => setCuts([]));
  }, []);
  useEffect(load, [load]);

  const move = useCallback(
    async (index: number, dir: -1 | 1) => {
      if (!cuts) return;
      const next = [...cuts];
      const j = index + dir;
      if (j < 0 || j >= next.length) return;
      [next[index], next[j]] = [next[j]!, next[index]!];
      setCuts(next);
      await api("/api/admin/haircuts/reorder", {
        method: "POST",
        body: JSON.stringify({ ids: next.map((c) => c.id) }),
      });
    },
    [cuts],
  );

  const toggle = useCallback(
    async (cut: Haircut) => {
      await api(`/api/admin/haircuts/${cut.id}`, {
        method: "PATCH",
        body: JSON.stringify({ is_active: !cut.is_active }),
      });
      load();
    },
    [load],
  );

  if (!cuts) return <p className="dim pad">…</p>;

  return (
    <div className="pad col">
      <div className="list">
        {cuts.map((cut, i) => (
          <div key={cut.id} className="list-row" style={{ opacity: cut.is_active ? 1 : 0.45 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="cut-name" style={{ fontSize: 18 }}>
                {cut.name_en}
              </div>
              <div className="meta">
                €{(cut.price_cents / 100).toFixed(0)} · {cut.duration_minutes} min
                {!cut.is_active && " · off"}
              </div>
            </div>
            <div className="row-actions">
              <button className="btn" style={{ padding: "8px 10px" }} onClick={() => move(i, -1)}>
                ↑
              </button>
              <button className="btn" style={{ padding: "8px 10px" }} onClick={() => move(i, 1)}>
                ↓
              </button>
              <button className="btn" style={{ padding: "8px 10px" }} onClick={() => toggle(cut)}>
                {cut.is_active ? "Off" : "On"}
              </button>
              <button className="btn" style={{ padding: "8px 10px" }} onClick={() => setEditing(cut)}>
                Edit
              </button>
            </div>
          </div>
        ))}
      </div>
      <button className="btn block" onClick={() => setEditing("new")}>
        Add haircut
      </button>

      {editing && (
        <EditDialog
          cut={editing === "new" ? null : editing}
          onClose={(changed) => {
            setEditing(null);
            if (changed) load();
          }}
        />
      )}
    </div>
  );
}

function EditDialog({
  cut,
  onClose,
}: {
  cut: Haircut | null;
  onClose: (changed: boolean) => void;
}) {
  const [form, setForm] = useState({
    name_en: cut?.name_en ?? "",
    name_ru: cut?.name_ru ?? "",
    prompt: cut?.prompt ?? "",
    price: cut ? String(cut.price_cents / 100) : "25",
    duration: cut ? String(cut.duration_minutes) : "45",
  });
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const save = async () => {
    setSaving(true);
    try {
      const body = {
        name_en: form.name_en,
        name_ru: form.name_ru || null,
        prompt: form.prompt,
        price_cents: Math.round(Number(form.price || 0) * 100),
        duration_minutes: Number(form.duration || 30),
      };
      if (cut) {
        await api(`/api/admin/haircuts/${cut.id}`, { method: "PATCH", body: JSON.stringify(body) });
      } else {
        await api("/api/admin/haircuts", { method: "POST", body: JSON.stringify(body) });
      }
      onClose(true);
    } finally {
      setSaving(false);
    }
  };

  const uploadReference = async (file: File) => {
    if (!cut) return;
    const { upload_url } = await api<{ upload_url: string }>(
      `/api/admin/haircuts/${cut.id}/reference-upload`,
      { method: "POST" },
    );
    await fetch(upload_url, {
      method: "PUT",
      headers: { "content-type": file.type || "image/jpeg" },
      body: file,
    });
    await api(`/api/admin/haircuts/${cut.id}/reference-set`, { method: "POST" });
  };

  return (
    <div className="modal" onClick={() => onClose(false)}>
      <div
        className="col"
        style={{ background: "var(--wall-black)", border: "1px solid var(--inset-rule)", padding: 20, width: "100%", maxWidth: 420, maxHeight: "90dvh", overflowY: "auto" }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="section-title">{cut ? "Edit haircut" : "New haircut"}</h2>
        <div className="form-grid">
          <label>
            Name (EN)
            <input value={form.name_en} onChange={set("name_en")} />
          </label>
          <label>
            Name (RU)
            <input value={form.name_ru} onChange={set("name_ru")} />
          </label>
          <label>
            Prompt (haircut description)
            <textarea rows={4} value={form.prompt} onChange={set("prompt")} />
          </label>
          <label>
            Price (€)
            <input inputMode="decimal" value={form.price} onChange={set("price")} />
          </label>
          <label>
            Duration (min)
            <input inputMode="numeric" value={form.duration} onChange={set("duration")} />
          </label>
        </div>
        {cut && (
          <>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              style={{ display: "none" }}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void uploadReference(f);
              }}
            />
            <button className="btn block" onClick={() => fileRef.current?.click()}>
              {cut.reference_image_url ? "Replace reference image" : "Upload reference image"}
            </button>
          </>
        )}
        <div className="row2">
          <button className="btn" onClick={() => onClose(false)}>
            Cancel
          </button>
          <button className="btn primary" disabled={saving || !form.name_en || !form.prompt} onClick={save}>
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
