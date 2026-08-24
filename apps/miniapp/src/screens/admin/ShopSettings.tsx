import { useEffect, useState } from "react";
import { useI18n } from "../../i18n.js";
import { api } from "../../api.js";
import { Button, Field, TopBar } from "../../ui/primitives.js";

interface Shop {
  name: string;
  currency: string;
  retention_hours: number;
  monthly_budget_cents: number;
}

/** C9 — shop settings. */
export function ShopSettings({ onBack }: { onBack: () => void }) {
  const { t } = useI18n();
  const [form, setForm] = useState<{ name: string; currency: string; retention: string; budget: string } | null>(null);
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

  if (!form) {
    return (
      <div className="screen">
        <TopBar label={t("admin.shop")} onBack={onBack} />
        <p className="hint-copy pad">{t("common.loading")}…</p>
      </div>
    );
  }

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
    <div className="screen">
      <TopBar label={t("admin.shop")} onBack={onBack} />
      <div className="pad col gap-20" style={{ paddingTop: 26 }}>
        <Field label={t("shop.name")}>
          <input className="input" value={form.name} onChange={set("name")} />
        </Field>
        <Field label={t("shop.currency")}>
          <input className="input" value={form.currency} maxLength={3} onChange={set("currency")} />
        </Field>
        <Field label={t("shop.retention")}>
          <input className="input" inputMode="numeric" value={form.retention} onChange={set("retention")} />
        </Field>
        <Field label={t("shop.budget")}>
          <input className="input" inputMode="decimal" value={form.budget} onChange={set("budget")} />
        </Field>
      </div>
      <div className="bottom-dock">
        <Button variant="primary" disabled={saving} onClick={() => void save()}>
          {saved ? t("shop.saved") : t("common.save")}
        </Button>
      </div>
    </div>
  );
}
