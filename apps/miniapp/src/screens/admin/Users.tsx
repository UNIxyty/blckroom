import { useCallback, useEffect, useState } from "react";
import { api } from "../../api.js";

interface AdminUser {
  id: string;
  username: string | null;
  first_name: string | null;
  role: string;
  status: string;
  created_at: string;
}

export function Users() {
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    api<AdminUser[]>("/api/admin/users").then(setUsers, () => setUsers([]));
  }, []);
  useEffect(load, [load]);

  const act = useCallback(
    async (id: string, action: string) => {
      setBusy(id);
      try {
        await api(`/api/admin/users/${id}/${action}`, { method: "POST" });
        load();
      } finally {
        setBusy(null);
      }
    },
    [load],
  );

  if (!users) return <p className="dim pad">…</p>;

  const pending = users.filter((u) => u.role === "pending" && u.status === "pending");
  const active = users.filter((u) => u.status === "active");
  const suspended = users.filter((u) => u.status === "suspended");

  const name = (u: AdminUser) => u.first_name ?? (u.username ? `@${u.username}` : u.id.slice(0, 8));

  return (
    <div className="pad col">
      <section>
        <h2 className="section-title">Pending ({pending.length})</h2>
        <div className="list">
          {pending.length === 0 && <p className="dim small">No requests waiting.</p>}
          {pending.map((u) => (
            <div key={u.id} className="list-row">
              <div>
                <div>{name(u)}</div>
                <div className="meta">{new Date(u.created_at).toLocaleDateString()}</div>
              </div>
              <div className="row-actions">
                <button className="btn" disabled={busy === u.id} onClick={() => act(u.id, "approve")}>
                  Approve
                </button>
                <button
                  className="btn danger"
                  disabled={busy === u.id}
                  onClick={() => act(u.id, "reject")}
                >
                  Reject
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="section-title">Active ({active.length})</h2>
        <div className="list">
          {active.map((u) => (
            <div key={u.id} className="list-row">
              <div>
                <div>{name(u)}</div>
                <div className="meta">{u.role}</div>
              </div>
              {u.role !== "superadmin" && u.role !== "owner" && (
                <button
                  className="btn danger"
                  disabled={busy === u.id}
                  onClick={() => act(u.id, "suspend")}
                >
                  Suspend
                </button>
              )}
            </div>
          ))}
        </div>
      </section>

      {suspended.length > 0 && (
        <section>
          <h2 className="section-title">Suspended ({suspended.length})</h2>
          <div className="list">
            {suspended.map((u) => (
              <div key={u.id} className="list-row">
                <div>{name(u)}</div>
                {u.role !== "pending" && (
                  <button
                    className="btn"
                    disabled={busy === u.id}
                    onClick={() => act(u.id, "activate")}
                  >
                    Restore
                  </button>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
