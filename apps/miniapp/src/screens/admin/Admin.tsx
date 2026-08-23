import { useState } from "react";
import { Users } from "./Users.js";
import { Catalog } from "./Catalog.js";
import { Spend } from "./Spend.js";
import { Settings } from "./Settings.js";

type Sub = "users" | "catalog" | "spend" | "settings";

export function Admin() {
  const [sub, setSub] = useState<Sub>("users");
  const tabs: Array<[Sub, string]> = [
    ["users", "Users"],
    ["catalog", "Catalog"],
    ["spend", "Spend"],
    ["settings", "Settings"],
  ];
  return (
    <div className="col" style={{ gap: 0 }}>
      <nav className="tabs" style={{ padding: "10px 18px", borderBottom: "1px solid var(--hairline)" }}>
        {tabs.map(([key, label]) => (
          <button
            key={key}
            className={sub === key ? "tab active" : "tab"}
            onClick={() => setSub(key)}
          >
            {label}
          </button>
        ))}
      </nav>
      {sub === "users" && <Users />}
      {sub === "catalog" && <Catalog />}
      {sub === "spend" && <Spend />}
      {sub === "settings" && <Settings />}
    </div>
  );
}
