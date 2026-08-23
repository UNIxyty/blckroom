import { useEffect, useState } from "react";
import { api } from "../api.js";
import { getWebApp } from "../telegram.js";

interface HistoryRow {
  id: string;
  status: string;
  created_at: string;
  sheet_url: string | null;
}

export function History() {
  const [rows, setRows] = useState<HistoryRow[] | null>(null);

  useEffect(() => {
    api<HistoryRow[]>("/api/sessions?days=7").then(setRows, () => setRows([]));
  }, []);

  if (!rows) return <p className="dim pad">…</p>;
  if (rows.length === 0)
    return <p className="dim pad">No sessions in the last 7 days.</p>;

  return (
    <div className="pad">
      <h2 className="section-title">Last 7 days</h2>
      <div className="list">
        {rows.map((r) => (
          <div key={r.id} className="list-row">
            <div>
              <div>{new Date(r.created_at).toLocaleString()}</div>
              <div className="meta">{r.status}</div>
            </div>
            {r.sheet_url ? (
              <button className="btn" onClick={() => getWebApp()?.openLink(r.sheet_url!)}>
                Sheet
              </button>
            ) : (
              <span className="chip">{r.status === "expired" ? "expired" : "no sheet"}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
