import { useEffect, useState } from "react";
import { api } from "../../api.js";

interface Stats {
  sessions: number;
  spend_cents: number;
  budget_cents: number;
  currency: string;
  cost_per_session_cents: number;
}

export function Spend() {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    api<Stats>("/api/admin/stats").then(setStats, () => setStats(null));
  }, []);

  if (!stats) return <p className="dim pad">…</p>;

  const spend = (stats.spend_cents / 100).toFixed(2);
  const budget = (stats.budget_cents / 100).toFixed(0);
  const pct = stats.budget_cents > 0 ? Math.min(100, (stats.spend_cents / stats.budget_cents) * 100) : 0;

  return (
    <div className="pad col">
      <h2 className="section-title">This month</h2>
      <div className="stats">
        <div className="stat">
          <div className="value">{stats.sessions}</div>
          <div className="label">Sessions</div>
        </div>
        <div className="stat">
          <div className="value">
            {spend}
            <span style={{ fontSize: 16, color: "var(--tertiary)" }}> / {budget}</span>
          </div>
          <div className="label">Spend · {stats.currency}</div>
          <div className="budget-bar">
            <span style={{ width: `${pct}%` }} />
          </div>
        </div>
        <div className="stat">
          <div className="value">{(stats.cost_per_session_cents / 100).toFixed(2)}</div>
          <div className="label">Cost / session</div>
        </div>
        <div className="stat">
          <div className="value">{pct.toFixed(0)}%</div>
          <div className="label">Budget used</div>
        </div>
      </div>
    </div>
  );
}
