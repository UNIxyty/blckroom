import { useCallback, useEffect, useState } from "react";
import { useI18n } from "../../i18n.js";
import { api, ApiError } from "../../api.js";
import { BottomSheet, Button, SectionLabel, TopBar } from "../../ui/primitives.js";

interface AdminUser {
  id: string;
  username: string | null;
  first_name: string | null;
  role: "pending" | "barber" | "owner" | "superadmin";
  status: "pending" | "active" | "suspended";
  created_at: string;
}

interface UserDetail extends AdminUser {
  sessions: number;
  activity: Array<{ action: string; at: string; by: string | null }>;
}

const name = (u: { first_name: string | null; username: string | null; id: string }) =>
  u.first_name ?? (u.username ? `@${u.username}` : u.id.slice(0, 8));

/** C2/C3/C4 — users list with pending queue, detail with role editor. */
export function Users({ onBack }: { onBack: () => void }) {
  const { t } = useI18n();
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);

  const load = useCallback(() => {
    api<AdminUser[]>("/api/admin/users").then(setUsers, () => setUsers([]));
  }, []);
  useEffect(load, [load]);

  if (detailId) {
    return (
      <UserDetailScreen
        id={detailId}
        onBack={() => {
          setDetailId(null);
          load();
        }}
      />
    );
  }

  const pending = (users ?? []).filter((u) => u.role === "pending" && u.status === "pending");
  const active = (users ?? []).filter((u) => u.status === "active");
  const suspended = (users ?? []).filter((u) => u.status === "suspended");

  const roleKey = (r: AdminUser["role"]) =>
    r === "superadmin" ? "role.superadmin" : r === "owner" ? "role.owner" : r === "barber" ? "role.barber" : "role.pending";

  return (
    <div className="screen">
      <TopBar label={t("admin.users")} onBack={onBack} />
      <div className="pad-x col" style={{ paddingTop: 20 }}>
        {pending.length > 0 && (
          <>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 0 12px" }}>
              <span className="micro-label" style={{ color: "var(--c-primary)" }}>{t("users.pending")}</span>
              <span className="badge">{pending.length}</span>
            </div>
            <div style={{ borderLeft: "2px solid var(--c-primary)", paddingLeft: 14 }} className="col">
              <hr className="hairline" style={{ background: "var(--c-border)" }} />
              {pending.map((u) => (
                <span key={u.id}>
                  <button className="list-row" onClick={() => setDetailId(u.id)}>
                    <span className="row-main">
                      <span className="row-title emphasis">{name(u)}</span>
                      <span className="row-sub">
                        {t("users.requested", { date: new Date(u.created_at).toLocaleDateString() })}
                      </span>
                    </span>
                    <span className="row-arrow" style={{ color: "var(--c-primary)" }}>→</span>
                  </button>
                  <hr className="hairline" style={{ background: "var(--c-border)" }} />
                </span>
              ))}
            </div>
          </>
        )}

        <SectionLabel>{t("users.active")}</SectionLabel>
        <hr className="hairline" />
        {active.map((u) => (
          <span key={u.id}>
            <button className="list-row" onClick={() => setDetailId(u.id)}>
              <span className="row-title">{name(u)}</span>
              <span className="badge quiet">{t(roleKey(u.role))}</span>
            </button>
            <hr className="hairline" />
          </span>
        ))}

        {suspended.length > 0 && (
          <>
            <div style={{ paddingTop: 22 }}>
              <SectionLabel>{t("users.suspended")}</SectionLabel>
            </div>
            <hr className="hairline" />
            {suspended.map((u) => (
              <span key={u.id}>
                <button className="list-row dim" onClick={() => setDetailId(u.id)}>
                  <span className="row-title" style={{ textDecoration: "line-through" }}>{name(u)}</span>
                  <span className="badge quiet">{t("users.suspended")}</span>
                </button>
                <hr className="hairline" />
              </span>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

function UserDetailScreen({ id, onBack }: { id: string; onBack: () => void }) {
  const { t } = useI18n();
  const [user, setUser] = useState<UserDetail | null>(null);
  const [confirm, setConfirm] = useState<
    | { kind: "role"; role: "barber" | "owner" }
    | { kind: "suspend" }
    | null
  >(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api<UserDetail>(`/api/admin/users/${id}`).then(setUser, () => {});
  }, [id]);
  useEffect(load, [load]);

  const act = async (action: string) => {
    setError(null);
    try {
      await api(`/api/admin/users/${id}/${action}`, { method: "POST" });
      load();
    } catch (e) {
      setError(e instanceof ApiError && e.reason === "last_owner" ? t("role.lastowner") : t("error.generic"));
    }
    setConfirm(null);
  };

  const setRole = async (role: "barber" | "owner") => {
    setError(null);
    try {
      await api(`/api/admin/users/${id}/role`, { method: "POST", body: JSON.stringify({ role }) });
      load();
    } catch (e) {
      setError(e instanceof ApiError && e.reason === "last_owner" ? t("role.lastowner") : t("error.generic"));
    }
    setConfirm(null);
  };

  if (!user) {
    return (
      <div className="screen">
        <TopBar onBack={onBack} />
        <p className="hint-copy pad">{t("common.loading")}…</p>
      </div>
    );
  }

  const isPending = user.role === "pending" && user.status === "pending";

  return (
    <div className="screen">
      <TopBar label={t("admin.users")} onBack={onBack} />
      <div style={{ padding: "28px 20px 0" }} className="col gap-8">
        <h1 className="serif-title" style={{ fontSize: 28 }}>{name(user)}</h1>
        <span style={{ fontSize: 11, letterSpacing: "0.24em", textTransform: "uppercase", color: "var(--c-tertiary)" }}>
          {user.username ? `@${user.username} · ` : ""}
          {t("settings.joined", { date: new Date(user.created_at).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) })}
        </span>
      </div>

      <div style={{ padding: "26px 20px 0", display: "flex", gap: 10 }}>
        <div className="stat-card" style={{ flex: 1, borderColor: "var(--c-border)" }}>
          <span className="stat-label">{t("spend.sessions")}</span>
          <span className="stat-value" style={{ fontSize: 28 }}>{user.sessions}</span>
        </div>
      </div>

      {/* C10 folded in: what admins did to this account, right where it matters. */}
      {user.activity.length > 0 && (
        <div style={{ padding: "26px 20px 0" }} className="col">
          <SectionLabel>{t("user.activity")}</SectionLabel>
          <hr className="hairline" />
          {user.activity.map((a, i) => (
            <span key={i}>
              <div className="list-row" style={{ minHeight: 44, padding: "6px 0" }}>
                <span className="mono" style={{ fontSize: 11, color: "var(--c-secondary)" }}>
                  {a.action}
                  {a.by ? ` · ${a.by}` : ""}
                </span>
                <span className="mono" style={{ fontSize: 10, color: "var(--c-tertiary)" }}>
                  {new Date(a.at).toLocaleDateString(undefined, { day: "numeric", month: "short" })}
                </span>
              </div>
              <hr className="hairline" />
            </span>
          ))}
        </div>
      )}

      {error && <p className="field-error pad-x" style={{ paddingTop: 16 }}>{error}</p>}

      {isPending ? (
        <div className="bottom-dock">
          <Button variant="primary" onClick={() => void act("approve")}>
            {t("users.approve")}
          </Button>
          <Button variant="destructive" onClick={() => void act("reject")}>
            {t("users.reject")}
          </Button>
        </div>
      ) : (
        <>
          {user.role !== "superadmin" && user.status === "active" && (
            <div style={{ padding: "30px 20px 0" }} className="col gap-12">
              <SectionLabel>{t("home.role.owner")} / {t("home.role.barber")}</SectionLabel>
              {(["barber", "owner"] as const).map((r) => (
                <button
                  key={r}
                  style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0" }}
                  onClick={() => user.role !== r && setConfirm({ kind: "role", role: r })}
                >
                  <span style={{ width: 14, height: 14, border: "1px solid var(--c-tertiary)", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    {user.role === r && <span style={{ width: 6, height: 6, background: "var(--c-primary)", borderRadius: "50%" }} />}
                  </span>
                  <span style={{ fontSize: 13, letterSpacing: "0.14em", textTransform: "uppercase", color: user.role === r ? "var(--c-primary)" : "var(--c-secondary)", fontWeight: user.role === r ? 500 : 400 }}>
                    {t(r === "owner" ? "role.owner" : "role.barber")}
                  </span>
                </button>
              ))}
            </div>
          )}
          <div className="bottom-dock" style={{ gap: 0 }}>
            <hr className="hairline" />
            {user.status === "active" && user.role !== "superadmin" && (
              <button className="list-row" onClick={() => setConfirm({ kind: "suspend" })}>
                <span className="row-title" style={{ color: "var(--c-secondary)" }}>{t("user.suspend")}</span>
              </button>
            )}
            {user.status === "suspended" && (
              <button className="list-row" onClick={() => void act("activate")}>
                <span className="row-title emphasis" style={{ borderBottom: "1px solid var(--c-tertiary)", paddingBottom: 2 }}>
                  {t("user.restore")}
                </span>
              </button>
            )}
            <hr className="hairline" />
          </div>
        </>
      )}

      {confirm && (
        <BottomSheet onClose={() => setConfirm(null)}>
          <div style={{ width: 44, height: 2, background: "var(--c-borderStrong)", margin: "0 auto" }} />
          <div className="modal-title">
            {confirm.kind === "suspend"
              ? t("user.suspend.confirm.title", { name: name(user) })
              : t(confirm.role === "owner" ? "role.confirm.owner.title" : "role.confirm.barber.title", { name: name(user) })}
          </div>
          <p className="body-copy" style={{ fontSize: 14 }}>
            {confirm.kind === "suspend"
              ? t("user.suspend.confirm")
              : t(confirm.role === "owner" ? "role.confirm.owner" : "role.confirm.barber")}
          </p>
          <div className="col gap-10" style={{ marginTop: 6 }}>
            <Button
              variant="primary"
              onClick={() =>
                confirm.kind === "suspend" ? void act("suspend") : void setRole(confirm.role)
              }
            >
              {confirm.kind === "suspend" ? t("user.suspend") : t("common.save")}
            </Button>
            <Button variant="secondary" onClick={() => setConfirm(null)}>
              {t("common.cancel")}
            </Button>
          </div>
        </BottomSheet>
      )}
    </div>
  );
}
