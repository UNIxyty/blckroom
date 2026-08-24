import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { t as translate, resolveLang, type Lang, type MessageKey } from "@blackroom/shared/i18n";
import { api } from "./api.js";
import { getWebApp } from "./telegram.js";

interface I18nApi {
  lang: Lang;
  /** null until the user has explicitly chosen (drives the first-run selector). */
  chosen: Lang | null;
  t: (key: MessageKey, vars?: Record<string, string | number>) => string;
  setLanguage: (lang: Lang) => Promise<void>;
}

const I18nContext = createContext<I18nApi | null>(null);

function telegramLangCode(): string | undefined {
  const wa = getWebApp() as unknown as {
    initDataUnsafe?: { user?: { language_code?: string } };
  } | null;
  return wa?.initDataUnsafe?.user?.language_code;
}

export function I18nProvider({
  initial,
  children,
}: {
  initial: Lang | null;
  children: ReactNode;
}) {
  const [chosen, setChosen] = useState<Lang | null>(initial);
  const lang = resolveLang(chosen, telegramLangCode());

  const setLanguage = useCallback(async (next: Lang) => {
    setChosen(next);
    // Persisted on the users row — follows the barber across devices.
    await api("/api/me", { method: "PATCH", body: JSON.stringify({ language: next }) }).catch(
      () => {},
    );
  }, []);

  const api_ = useMemo<I18nApi>(
    () => ({
      lang,
      chosen,
      t: (key, vars) => translate(lang, key, vars),
      setLanguage,
    }),
    [lang, chosen, setLanguage],
  );

  return <I18nContext.Provider value={api_}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nApi {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n outside provider");
  return ctx;
}
