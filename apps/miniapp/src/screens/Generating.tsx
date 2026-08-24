import { useCallback, useEffect, useState } from "react";
import { useI18n } from "../i18n.js";
import { useNav } from "../nav.js";
import { api } from "../api.js";
import { getWebApp } from "../telegram.js";
import { Button, ListRow, ProgressBar, TopBar } from "../ui/primitives.js";
import { Tile } from "../ui/Tile.js";
import { AlbumView } from "./Album.js";

export interface GenerationTile {
  id: string;
  haircut_name: string;
  status: "queued" | "running" | "done" | "failed";
  framed_url: string | null;
  raw_url?: string | null;
}

export interface SessionView {
  id: string;
  status: string;
  created_at: string;
  expires_at: string;
  sheet_url: string | null;
  generations: GenerationTile[];
}

function timeLeft(expiresAt: string): string {
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return "0m";
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

/**
 * B4/B5 (2C) — one screen that carries the session from skeleton grid through
 * per-tile fill-in to the results layout. Polls every 2s until settled; tiles
 * update as each generation lands, failed tiles expose Retry.
 */
export function Generating({ sessionId }: { sessionId: string }) {
  const { t } = useI18n();
  const nav = useNav();
  const [view, setView] = useState<SessionView | null>(null);
  const [enlarged, setEnlarged] = useState<number | null>(null);
  const [retrying, setRetrying] = useState<Set<string>>(new Set());

  const settled = !!view && ["complete", "partial", "failed"].includes(view.status);

  useEffect(() => {
    let stop = false;
    const tick = async () => {
      try {
        const v = await api<SessionView>(`/api/sessions/${sessionId}`);
        if (!stop) {
          setView(v);
          setRetrying((prev) => {
            if (prev.size === 0) return prev;
            const next = new Set(prev);
            for (const g of v.generations) {
              if (g.status !== "failed") next.delete(g.id);
            }
            return next;
          });
        }
      } catch {
        /* transient — keep polling */
      }
    };
    void tick();
    const timer = setInterval(() => {
      // Keep polling after settle too, but slower — a retry can un-settle.
      void tick();
    }, 2000);
    return () => {
      stop = true;
      clearInterval(timer);
    };
  }, [sessionId]);

  const retryTile = useCallback(
    async (generationId: string) => {
      setRetrying((prev) => new Set(prev).add(generationId));
      await api(`/api/generations/${generationId}/retry`, { method: "POST" }).catch(() => {
        setRetrying((prev) => {
          const next = new Set(prev);
          next.delete(generationId);
          return next;
        });
      });
    },
    [],
  );

  const gens = view?.generations ?? [];
  const total = gens.length || 9;
  const done = gens.filter((g) => g.status === "done").length;
  const failed = gens.filter((g) => g.status === "failed" && !retrying.has(g.id)).length;
  const latest = [...gens].reverse().find((g) => g.status === "done");
  const failedGen = gens.find((g) => g.status === "failed" && !retrying.has(g.id));

  const tiles = gens.length > 0 ? gens : (Array.from({ length: 9 }, () => null) as null[]);

  return (
    <div className="screen">
      <TopBar label={settled ? t("results.title") : undefined} onBack={settled ? () => nav.reset("home") : undefined} />

      <div style={{ padding: "24px 20px 0" }} className="col gap-4">
        <h1 className="serif-title screen-title">
          {settled ? t("results.title") : t("generating.title")}
        </h1>
        <span className="hint-copy">
          {settled
            ? t("results.sub", {
                time: view ? new Date(view.created_at).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }) : "",
              })
            : failed > 0
              ? t("generating.sub.partial")
              : t("generating.sub")}
        </span>
      </div>

      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", padding: "20px 20px 12px" }}>
        <span style={{ fontSize: 22, letterSpacing: "0.12em" }}>
          {done}{" "}
          <span style={{ fontSize: 12, letterSpacing: "0.28em", textTransform: "uppercase", color: "var(--c-tertiary)" }}>
            {t("generating.of", { total })}
          </span>
        </span>
        <span style={{ fontSize: 11, letterSpacing: "0.24em", textTransform: "uppercase", color: "var(--c-tertiary)" }}>
          {settled
            ? t("generating.done")
            : failed > 0
              ? t("generating.failedcount", { n: failed })
              : done === 0
                ? t("generating.queued")
                : ""}
        </span>
      </div>
      <div className="pad-x">
        <ProgressBar fraction={total > 0 ? done / total : 0} />
      </div>

      <div className="grid3" style={{ padding: "20px 16px" }}>
        {tiles.map((g, i) => {
          if (!g || g.status === "queued" || g.status === "running" || retrying.has(g.id)) {
            return <Tile key={g?.id ?? i} state="skeleton" label={g?.haircut_name} shimmerDelay={i * 150} />;
          }
          if (g.status === "failed") {
            return (
              <Tile
                key={g.id}
                state="failed"
                failedLabel={t("tile.failed")}
                retryLabel={t("tile.retry")}
                onRetry={() => void retryTile(g.id)}
              />
            );
          }
          return (
            <Tile
              key={g.id}
              state="done"
              label={g.haircut_name}
              imageUrl={g.framed_url}
              onOpen={g.framed_url ? () => setEnlarged(i) : undefined}
            />
          );
        })}
      </div>

      <div style={{ marginTop: "auto" }} className="pad-x col">
        <hr className="hairline" />
        {settled && view ? (
          <div style={{ height: 52, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: 11, letterSpacing: "0.2em", textTransform: "uppercase", color: "var(--c-tertiary)" }}>
              {t("results.deletedafter")}
            </span>
            <span className="meta-text">{timeLeft(view.expires_at)}</span>
          </div>
        ) : (
          <>
            <div style={{ height: 52, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: 11, letterSpacing: "0.2em", textTransform: "uppercase", color: "var(--c-tertiary)" }}>
                {latest ? t("generating.latest", { name: latest.haircut_name }) : t("generating.uploaded")}
              </span>
              <span className="meta-text">{latest ? "" : "✓"}</span>
            </div>
            {failedGen && (
              <>
                <hr className="hairline" />
                <div style={{ height: 52, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 11, letterSpacing: "0.2em", textTransform: "uppercase", color: "var(--c-secondary)" }}>
                    {t("generating.failedrow", { name: failedGen.haircut_name })}
                  </span>
                  <button className="btn inline" onClick={() => void retryTile(failedGen.id)}>
                    {t("tile.retry")}
                  </button>
                </div>
              </>
            )}
          </>
        )}
      </div>

      <div className="bottom-dock">
        {settled && view ? (
          <>
            {view.sheet_url && (
              <Button variant="primary" onClick={() => getWebApp()?.openLink(view.sheet_url!)}>
                {t("results.send")}
              </Button>
            )}
            <div className="row2">
              <Button variant="secondary" onClick={() => setEnlarged(0)}>
                {t("results.album")}
              </Button>
              <Button variant="secondary" onClick={() => nav.reset("home")}>
                {t("results.restart")}
              </Button>
            </div>
            <p className="hint-copy" style={{ fontSize: 11, textAlign: "center" }}>{t("results.sent")}</p>
          </>
        ) : (
          <Button variant="secondary" onClick={() => nav.reset("home")}>
            {t("generating.cancel")}
          </Button>
        )}
      </div>

      {enlarged !== null && view && (
        <AlbumView
          generations={view.generations.filter((g) => g.status === "done" && g.framed_url)}
          start={Math.max(0, view.generations.filter((g) => g.status === "done" && g.framed_url).findIndex((g) => g.id === view.generations[enlarged]?.id))}
          onClose={() => setEnlarged(null)}
        />
      )}
    </div>
  );
}
