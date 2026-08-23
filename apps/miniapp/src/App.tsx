import { useEffect, useState } from "react";
import { getMe, type Me } from "./api.js";
import { getWebApp } from "./telegram.js";
import { CaptureFlow } from "./screens/CaptureFlow.js";
import { History } from "./screens/History.js";
import { Admin } from "./screens/admin/Admin.js";

type Tab = "new" | "history" | "admin";

export function App() {
  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>(() =>
    new URLSearchParams(window.location.search).get("screen") === "admin" ? "admin" : "new",
  );

  useEffect(() => {
    const wa = getWebApp();
    wa?.ready();
    wa?.expand();
    getMe().then(setMe, (e) => setError(String(e.message ?? e)));
  }, []);

  if (error) {
    return (
      <Centered>
        <h1 className="wordmark">Black Room</h1>
        <p className="dim">Open this app from Telegram.</p>
        <p className="dim small">{error}</p>
      </Centered>
    );
  }
  if (!me) {
    return (
      <Centered>
        <h1 className="wordmark">Black Room</h1>
        <p className="dim">…</p>
      </Centered>
    );
  }

  if (me.status === "suspended") {
    return (
      <Centered>
        <h1 className="wordmark">Black Room</h1>
        <p className="dim">Your access has been suspended. Contact the shop owner.</p>
      </Centered>
    );
  }
  if (me.role === "pending" || me.status === "pending") {
    return (
      <Centered>
        <h1 className="wordmark">Black Room</h1>
        <p className="dim">
          Waiting for the owner to approve your access. You'll get a Telegram message once
          you're in.
        </p>
      </Centered>
    );
  }

  const isOwner = me.role === "owner" || me.role === "superadmin";
  const effectiveTab: Tab = tab === "admin" && !isOwner ? "new" : tab;

  return (
    <div className="app">
      <header className="appbar">
        <span className="appbar-mark">Black Room</span>
        <nav className="tabs">
          <button
            className={effectiveTab === "new" ? "tab active" : "tab"}
            onClick={() => setTab("new")}
          >
            New
          </button>
          <button
            className={effectiveTab === "history" ? "tab active" : "tab"}
            onClick={() => setTab("history")}
          >
            History
          </button>
          {isOwner && (
            <button
              className={effectiveTab === "admin" ? "tab active" : "tab"}
              onClick={() => setTab("admin")}
            >
              Admin
            </button>
          )}
        </nav>
      </header>
      <main className="content">
        {effectiveTab === "new" && <CaptureFlow />}
        {effectiveTab === "history" && <History />}
        {effectiveTab === "admin" && isOwner && <Admin />}
      </main>
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <main className="shell">{children}</main>;
}
