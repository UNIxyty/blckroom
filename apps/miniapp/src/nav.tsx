import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

/**
 * D1 navigation: Home is the hub, everything else is a push. The in-app ←
 * and Telegram's BackButton share one pop handler; BackButton hides on the
 * root screen. Full-screen views use ✕ but still pop.
 */
export interface NavEntry {
  name: string;
  params?: Record<string, unknown>;
}

interface NavApi {
  stack: NavEntry[];
  current: NavEntry;
  push: (name: string, params?: Record<string, unknown>) => void;
  /** Replace the current entry (Results replaces Generating). */
  replace: (name: string, params?: Record<string, unknown>) => void;
  pop: () => void;
  reset: (name: string) => void;
}

const NavContext = createContext<NavApi | null>(null);

interface TgBackButton {
  show(): void;
  hide(): void;
  onClick(cb: () => void): void;
  offClick(cb: () => void): void;
}

function backButton(): TgBackButton | null {
  return (
    (window as unknown as { Telegram?: { WebApp?: { BackButton?: TgBackButton } } }).Telegram
      ?.WebApp?.BackButton ?? null
  );
}

export function NavProvider({ root, children }: { root: string; children: ReactNode }) {
  const [stack, setStack] = useState<NavEntry[]>([{ name: root }]);
  const stackRef = useRef(stack);
  stackRef.current = stack;

  const pop = useCallback(() => {
    setStack((s) => (s.length > 1 ? s.slice(0, -1) : s));
  }, []);

  useEffect(() => {
    const bb = backButton();
    if (!bb) return;
    const handler = () => pop();
    bb.onClick(handler);
    return () => bb.offClick(handler);
  }, [pop]);

  useEffect(() => {
    const bb = backButton();
    if (!bb) return;
    if (stack.length > 1) bb.show();
    else bb.hide();
  }, [stack.length]);

  const api = useMemo<NavApi>(
    () => ({
      stack,
      current: stack[stack.length - 1]!,
      push: (name, params) => setStack((s) => [...s, params ? { name, params } : { name }]),
      replace: (name, params) =>
        setStack((s) => [...s.slice(0, -1), params ? { name, params } : { name }]),
      pop,
      reset: (name) => setStack([{ name }]),
    }),
    [stack, pop],
  );

  return <NavContext.Provider value={api}>{children}</NavContext.Provider>;
}

export function useNav(): NavApi {
  const api = useContext(NavContext);
  if (!api) throw new Error("useNav outside NavProvider");
  return api;
}
