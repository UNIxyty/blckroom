import { useEffect, useState } from "react";
import { api } from "../api.js";
import { getWebApp } from "../telegram.js";

export interface GenerationTile {
  id: string;
  haircut_name: string;
  status: "queued" | "running" | "done" | "failed";
  framed_url: string | null;
}

export interface SessionView {
  id: string;
  status: string;
  sheet_url: string | null;
  generations: GenerationTile[];
}

/**
 * 3×3 grid of shimmer skeletons (loading-card style), tiles filling in as
 * generations land. Doubles as the result screen once the session settles.
 */
export function Generating({
  sessionId,
  onRestart,
}: {
  sessionId: string;
  onRestart: () => void;
}) {
  const [view, setView] = useState<SessionView | null>(null);
  const [enlarged, setEnlarged] = useState<GenerationTile | null>(null);

  const settled = view && ["complete", "partial", "failed"].includes(view.status);

  useEffect(() => {
    if (settled) return;
    let stop = false;
    const tick = async () => {
      try {
        const v = await api<SessionView>(`/api/sessions/${sessionId}`);
        if (!stop) setView(v);
      } catch {
        /* transient — keep polling */
      }
    };
    void tick();
    const t = setInterval(tick, 2000);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, [sessionId, settled]);

  const tiles: (GenerationTile | null)[] =
    view?.generations && view.generations.length > 0
      ? view.generations
      : Array.from({ length: 9 }, () => null);

  const doneCount = view?.generations.filter((g) => g.status === "done").length ?? 0;

  return (
    <div className="pad col">
      <div className="gen-head">
        <h2 className="section-title" style={{ margin: 0 }}>
          {settled ? "Preview sheet" : `Generating ${doneCount}/9`}
        </h2>
        {!settled && <span className="dim small">10–30 seconds</span>}
      </div>

      <div className="grid3">
        {tiles.map((g, i) => {
          if (!g || g.status === "queued" || g.status === "running") {
            return (
              <div key={g?.id ?? i} className="tile skeleton">
                {g && <span className="tile-label">{g.haircut_name}</span>}
              </div>
            );
          }
          if (g.status === "failed" || !g.framed_url) {
            return (
              <div key={g.id} className="tile failed">
                <span className="tile-label">{g.haircut_name} — failed</span>
              </div>
            );
          }
          return (
            <button key={g.id} className="tile" onClick={() => setEnlarged(g)}>
              <img src={g.framed_url} alt={g.haircut_name} />
              <span className="tile-label">{g.haircut_name}</span>
            </button>
          );
        })}
      </div>

      {settled && (
        <>
          {view.sheet_url && (
            <button
              className="btn primary block"
              onClick={() => getWebApp()?.openLink(view.sheet_url!)}
            >
              Open sheet
            </button>
          )}
          <p className="dim small">
            The sheet has also been sent to your Telegram chat — forward it to the client from
            there.
          </p>
          <button className="btn block" onClick={onRestart}>
            New client
          </button>
        </>
      )}

      {enlarged && (
        <div className="modal" onClick={() => setEnlarged(null)}>
          <img src={enlarged.framed_url!} alt={enlarged.haircut_name} />
        </div>
      )}
    </div>
  );
}
