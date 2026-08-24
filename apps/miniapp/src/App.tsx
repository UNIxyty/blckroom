import { useEffect, useState } from "react";
import type { Lang } from "@blackroom/shared/i18n";
import { api, getMe, type Me } from "./api.js";
import { getWebApp } from "./telegram.js";
import { applyTheme } from "./theme.js";
import { I18nProvider, useI18n } from "./i18n.js";
import { NavProvider, useNav } from "./nav.js";
import { LanguageSelect, Tour } from "./screens/Onboarding.js";
import { Home } from "./screens/Home.js";
import { StatusScreen } from "./screens/Status.js";
import { Consent, type NewSession } from "./screens/Consent.js";
import { Capture } from "./screens/Capture.js";
import { Generating } from "./screens/Generating.js";
import { History } from "./screens/History.js";
import { Settings } from "./screens/Settings.js";
import { Admin } from "./screens/admin/Admin.js";

const TOUR_SEEN_KEY = "br.tour.seen";

function tourSeen(): boolean {
  try {
    return localStorage.getItem(TOUR_SEEN_KEY) === "1";
  } catch {
    return true;
  }
}

function markTourSeen(): void {
  try {
    localStorage.setItem(TOUR_SEEN_KEY, "1");
  } catch {
    /* private mode */
  }
}

export function App() {
  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    applyTheme();
    const wa = getWebApp();
    wa?.ready();
    wa?.expand();
    getMe().then(setMe, (e) => setError(String(e.message ?? e)));
  }, []);

  if (error) {
    return (
      <main className="app">
        <div className="centered">
          <h1 className="wordmark">Black Room</h1>
          <p className="hint-copy">{error}</p>
        </div>
      </main>
    );
  }
  if (!me) {
    return (
      <main className="app">
        <div className="centered anim">
          <h1 className="wordmark" style={{ animation: "shimmer 2.4s ease-in-out infinite" }}>
            Black Room
          </h1>
        </div>
      </main>
    );
  }

  return (
    <I18nProvider initial={me.language}>
      <Gate me={me} onMeChange={setMe} />
    </I18nProvider>
  );
}

function Gate({ me, onMeChange }: { me: Me; onMeChange: (me: Me) => void }) {
  const { chosen, setLanguage } = useI18n();
  const [showTour, setShowTour] = useState(() => !tourSeen());

  // First launch: language before anything else (§8).
  if (!chosen) {
    return (
      <main className="app">
        <LanguageSelect
          onDone={(lang: Lang) => {
            void setLanguage(lang);
          }}
        />
      </main>
    );
  }

  if (showTour && me.status === "active" && me.role !== "pending") {
    return (
      <main className="app">
        <Tour
          onDone={() => {
            markTourSeen();
            setShowTour(false);
          }}
        />
      </main>
    );
  }

  if (me.status === "suspended") {
    return (
      <main className="app">
        <StatusScreen me={me} kind="suspended" />
      </main>
    );
  }
  if (me.role === "pending" || me.status === "pending") {
    return (
      <main className="app">
        <StatusScreen me={me} kind="pending" />
      </main>
    );
  }

  const startOnAdmin =
    new URLSearchParams(window.location.search).get("screen") === "admin" &&
    (me.role === "owner" || me.role === "superadmin");

  return (
    <NavProvider root="home">
      <Routed me={me} onMeChange={onMeChange} startOnAdmin={startOnAdmin} onReplayTour={() => setShowTour(true)} />
    </NavProvider>
  );
}

function Routed({
  me,
  onMeChange,
  startOnAdmin,
  onReplayTour,
}: {
  me: Me;
  onMeChange: (me: Me) => void;
  startOnAdmin: boolean;
  onReplayTour: () => void;
}) {
  const nav = useNav();
  const [sessionCount, setSessionCount] = useState<number | null>(null);

  useEffect(() => {
    if (startOnAdmin) nav.push("admin");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (nav.current.name === "home") {
      api<unknown[]>("/api/sessions?days=7").then(
        (rows) => setSessionCount(rows.length),
        () => {},
      );
      getMe().then(onMeChange, () => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nav.current.name]);

  const screen = nav.current;
  return (
    <main className="app">
      {screen.name === "home" && <Home me={me} sessionCount={sessionCount} />}
      {screen.name === "consent" && <Consent />}
      {screen.name === "capture" && <Capture session={screen.params!.session as NewSession} />}
      {screen.name === "generating" && (
        <Generating sessionId={screen.params!.sessionId as string} />
      )}
      {screen.name === "history" && <History />}
      {screen.name === "settings" && <Settings me={me} onReplayTour={onReplayTour} />}
      {screen.name === "admin" && <Admin />}
    </main>
  );
}
