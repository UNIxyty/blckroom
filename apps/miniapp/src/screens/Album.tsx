import { useEffect, useRef, useState } from "react";
import { useI18n } from "../i18n.js";
import { getWebApp } from "../telegram.js";
import type { GenerationTile } from "./Generating.js";

/**
 * B6 — full-screen horizontally swipeable album: one cut per slide,
 * cut name, position bars, close, single-image share.
 */
export function AlbumView({
  generations,
  start = 0,
  onClose,
}: {
  generations: GenerationTile[];
  start?: number;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [index, setIndex] = useState(start);

  useEffect(() => {
    const track = trackRef.current;
    if (track && start > 0) {
      track.scrollLeft = start * track.clientWidth;
    }
  }, [start]);

  const onScroll = () => {
    const track = trackRef.current;
    if (!track) return;
    setIndex(Math.round(track.scrollLeft / track.clientWidth));
  };

  const current = generations[index];
  if (generations.length === 0) return null;

  const share = () => {
    const url = current?.framed_url;
    if (url) {
      getWebApp()?.openLink(url);
    }
  };

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "var(--c-bg)", zIndex: 30, display: "flex", flexDirection: "column" }}
    >
      <div className="topbar borderless">
        <button className="back-target close" onClick={onClose}>✕</button>
        <span className="bar-label" style={{ margin: "0 auto", letterSpacing: "0.24em" }}>
          {index + 1} / {generations.length}
        </span>
        <button
          className="back-target"
          style={{ fontSize: 14, letterSpacing: "0.2em", textTransform: "uppercase", fontFamily: "var(--f-sans)" }}
          onClick={share}
        >
          ↑
        </button>
      </div>

      <div className="album-track" ref={trackRef} onScroll={onScroll}>
        {generations.map((g) => (
          <div key={g.id} className="album-slide">
            {g.framed_url && <img src={g.framed_url} alt={g.haircut_name} />}
          </div>
        ))}
      </div>

      <div style={{ flex: "0 0 132px", padding: "26px 24px" }} className="col gap-12">
        <div className="serif-title" style={{ fontSize: 30, letterSpacing: "0.16em" }}>
          {current?.haircut_name ?? ""}
        </div>
        <div className="album-dots">
          {generations.map((g, i) => (
            <i key={g.id} className={i === index ? "active" : ""} />
          ))}
        </div>
      </div>
    </div>
  );
}
