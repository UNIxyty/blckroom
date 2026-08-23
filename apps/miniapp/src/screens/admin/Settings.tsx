import { useEffect, useState } from "react";
import { api } from "../../api.js";

interface Shop {
  name: string;
  currency: string;
  retention_hours: number;
  monthly_budget_cents: number;
}

export function Settings() {
  const [form, setForm] = useState<{
    name: string;
    currency: string;
    retention: string;
    budget: string;
  } | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api<Shop>("/api/admin/shop").then((s) =>
      setForm({
        name: s.name,
        currency: s.currency,
        retention: String(s.retention_hours),
        budget: String(s.monthly_budget_cents / 100),
      }),
    );
  }, []);

  if (!form) return <p className="dim pad">…</p>;

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setSaved(false);
    setForm((f) => f && { ...f, [k]: e.target.value });
  };

  const save = async () => {
    setSaving(true);
    try {
      await api("/api/admin/shop", {
        method: "PATCH",
        body: JSON.stringify({
          name: form.name,
          currency: form.currency.toUpperCase(),
          retention_hours: Number(form.retention),
          monthly_budget_cents: Math.round(Number(form.budget) * 100),
        }),
      });
      setSaved(true);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="pad col">
      <h2 className="section-title">Shop settings</h2>
      <div className="form-grid">
        <label>
          Name
          <input value={form.name} onChange={set("name")} />
        </label>
        <label>
          Currency (ISO)
          <input value={form.currency} onChange={set("currency")} maxLength={3} />
        </label>
        <label>
          Image retention (hours)
          <input inputMode="numeric" value={form.retention} onChange={set("retention")} />
        </label>
        <label>
          Monthly budget (€)
          <input inputMode="decimal" value={form.budget} onChange={set("budget")} />
        </label>
      </div>
      <button className="btn primary block" disabled={saving} onClick={save}>
        {saved ? "Saved" : "Save"}
      </button>
      <p className="dim small">
        Retention applies to new sessions. Existing images are deleted by the cleanup job when
        their session expires.
      </p>
    </div>
  );
}
