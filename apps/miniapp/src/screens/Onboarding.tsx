import { useState } from "react";
import { useI18n } from "../i18n.js";
import { Button } from "../ui/primitives.js";
import type { Lang } from "@blackroom/shared/i18n";

/**
 * B0 — first launch: language selector, then the four-step tour.
 * Language persists on the users row; tour-seen is a per-device convenience.
 */
export function LanguageSelect({ onDone }: { onDone: (lang: Lang) => void }) {
  const { t } = useI18n();
  return (
    <div className="screen">
      <div className="topbar borderless" />
      <div className="grow col" style={{ justifyContent: "center", padding: "0 28px" }}>
        <div style={{ textAlign: "center", marginBottom: 64 }}>
          <div
            className="serif-title"
            style={{ fontSize: 29, letterSpacing: "0.32em", textIndent: "0.32em" }}
          >
            {t("lang.title")}
          </div>
          <div style={{ width: 180, height: 1, background: "var(--c-borderStrong)", margin: "18px auto 14px" }} />
          <div style={{ fontSize: 11, letterSpacing: "0.52em", textIndent: "0.52em", color: "var(--c-tertiary)" }}>
            {t("lang.sub")}
          </div>
        </div>
        <div className="col gap-12">
          <button className="lang-option" onClick={() => onDone("en")}>
            {t("lang.en")}
          </button>
          <button className="lang-option" onClick={() => onDone("ru")}>
            {t("lang.ru")}
          </button>
        </div>
      </div>
    </div>
  );
}

const OFFSETS: Array<[number, number]> = [
  [72, 72], [0, 72], [-72, 72],
  [72, 0], [0, 0], [-72, 0],
  [72, -72], [0, -72], [-72, -72],
];
const DELAYS = [0.34, 0.26, 0.42, 0.18, 0, 0.18, 0.5, 0.26, 0.5];

function StageMultiply() {
  return (
    <div className="tour-grid anim">
      {OFFSETS.map(([dx, dy], i) => (
        <i
          key={i}
          className={i === 4 ? "hero" : ""}
          style={{
            ["--dx" as string]: `${dx}px`,
            ["--dy" as string]: `${dy}px`,
            opacity: 0,
            animation: `tourTileIn 3.4s ease-in-out ${DELAYS[i]}s infinite`,
          }}
        />
      ))}
    </div>
  );
}

function StageCapture() {
  const guide = { opacity: 0, animation: "tourGuide 3.6s ease-in-out infinite" };
  return (
    <div className="anim" style={{ width: 232, height: 232, position: "relative" }}>
      <div style={{ position: "absolute", inset: 0, background: "var(--c-primary)", opacity: 0, animation: "tourFlash 3.6s ease-in-out infinite" }} />
      <div style={{ position: "absolute", left: "50%", top: "50%", width: 104, height: 132, margin: "-74px 0 0 -52px", border: "1px solid var(--c-secondary)", borderRadius: "52px/66px", ...guide }} />
      <div style={{ position: "absolute", left: "50%", top: "50%", width: 150, height: 1, margin: "66px 0 0 -75px", background: "var(--c-borderStrong)", ...guide }} />
      <div style={{ position: "absolute", left: "50%", top: "50%", width: 120, height: 120, margin: "-60px 0 0 -60px", border: "1px solid var(--c-primary)", borderRadius: "50%", opacity: 0, animation: "tourPulse 3.6s ease-out infinite" }} />
      {(["tl", "tr", "bl", "br"] as const).map((c) => (
        <div key={c} className={`corner ${c}`} style={{ width: 26, height: 26, ...guide, left: c.includes("l") ? 26 : undefined, right: c.includes("r") ? 26 : undefined, top: c.includes("t") ? 26 : undefined, bottom: c.includes("b") ? 26 : undefined }} />
      ))}
    </div>
  );
}

function StageFill() {
  return (
    <div className="anim col" style={{ alignItems: "center", gap: 26 }}>
      <div className="tour-grid" style={{ width: "auto", height: "auto" }}>
        {Array.from({ length: 9 }, (_, i) => (
          <i key={i} style={{ opacity: 0.13, animation: `tourFill 3.2s ease-out ${0.1 + i * 0.3}s infinite` }} />
        ))}
      </div>
    </div>
  );
}

function StageAlbum() {
  return (
    <div className="anim" style={{ width: 232, height: 232, position: "relative", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ position: "absolute", width: 132, height: 150, border: "1px solid var(--c-border)", background: "var(--c-surface)", display: "grid", gridTemplateColumns: "repeat(3,1fr)", gridTemplateRows: "repeat(3,1fr)", gap: 5, padding: 12, animation: "tourSheetOut 3.6s ease-in-out infinite" }}>
        {Array.from({ length: 9 }, (_, i) => (
          <div key={i} style={{ background: "#202523" }} />
        ))}
      </div>
      <div style={{ position: "absolute", width: 150, height: 180, border: "1px solid var(--c-borderStrong)", background: "#161A19", opacity: 0, animation: "tourCardIn 3.6s ease-in-out infinite" }} />
      <div style={{ position: "absolute", width: 150, height: 180, border: "1px solid var(--c-borderStrong)", background: "#1C211F", opacity: 0, animation: "tourCardNext 3.6s ease-in-out infinite" }} />
    </div>
  );
}

const STAGES = [StageMultiply, StageCapture, StageFill, StageAlbum];

export function Tour({ onDone }: { onDone: () => void }) {
  const { t } = useI18n();
  const [step, setStep] = useState(0);
  const Stage = STAGES[step]!;
  const last = step === 3;

  return (
    <div className="screen">
      <div className="topbar borderless">
        <span style={{ width: 8 }} />
        <button
          className="bar-right"
          style={{ marginLeft: "auto", minWidth: 44, height: 44, fontSize: 11, letterSpacing: "0.28em", textTransform: "uppercase", color: "var(--c-tertiary)" }}
          onClick={onDone}
        >
          {t("tour.skip")}
        </button>
      </div>
      <div className="grow col" style={{ padding: "0 28px 28px" }}>
        <div className="tour-stage">
          <Stage />
        </div>
        <div className="tour-copy">
          <h2>{t(`tour.s${step + 1}.title` as "tour.s1.title")}</h2>
          <p className="body-copy">{t(`tour.s${step + 1}.body` as "tour.s1.body")}</p>
        </div>
        <div className="tour-dots">
          {[0, 1, 2, 3].map((i) => (
            <button key={i} className={i === step ? "active" : ""} onClick={() => setStep(i)}>
              <span />
            </button>
          ))}
        </div>
        <Button variant="primary" onClick={() => (last ? onDone() : setStep(step + 1))}>
          {last ? t("tour.start") : t("tour.next")}
        </Button>
      </div>
    </div>
  );
}
