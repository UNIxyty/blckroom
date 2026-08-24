import { useCallback, useEffect, useRef, useState } from "react";
import { useI18n } from "../i18n.js";
import { useNav } from "../nav.js";
import { api, ApiError } from "../api.js";
import { Button, ErrorPanel, TopBar } from "../ui/primitives.js";
import type { NewSession } from "./Consent.js";
import type { MessageKey } from "@blackroom/shared/i18n";

type Step =
  | { kind: "choice" }
  | { kind: "camera" }
  | { kind: "blocked" }
  | { kind: "preview"; blob: Blob; url: string }
  | { kind: "uploading" }
  | { kind: "rejected"; titleKey: MessageKey; bodyKey: MessageKey; raw?: string };

const REJECTION_KEYS: Record<string, [MessageKey, MessageKey]> = {
  no_face: ["capture.error.title.noface", "capture.error.noface"],
  too_small: ["capture.error.title.small", "capture.error.small"],
  face_off_center: ["capture.error.title.offcenter", "capture.error.offcenter"],
  face_too_small: ["capture.error.title.far", "capture.error.far"],
  not_an_image: ["capture.error.title.file", "capture.error.file"],
  too_big: ["capture.error.title.toobig", "capture.error.toobig"],
};

const MAX_UPLOAD_MB = 15;

/** B3 — camera with guide overlay, preview, server validation. */
export function Capture({ session }: { session: NewSession }) {
  const { t } = useI18n();
  const nav = useNav();
  const [step, setStep] = useState<Step>({ kind: "choice" });
  const fileRef = useRef<HTMLInputElement | null>(null);

  const upload = useCallback(
    async (blob: Blob) => {
      setStep({ kind: "uploading" });
      try {
        const put = await fetch(session.upload_url, {
          method: "PUT",
          headers: { "content-type": blob.type || "image/jpeg" },
          body: blob,
        });
        if (!put.ok) throw new Error(`upload ${put.status}`);
        await api(`/api/sessions/${session.session_id}/uploaded`, { method: "POST" });
        await api(`/api/sessions/${session.session_id}/generate`, { method: "POST" });
        nav.replace("generating", { sessionId: session.session_id });
      } catch (e) {
        if (e instanceof ApiError && e.status === 422 && e.reason && REJECTION_KEYS[e.reason]) {
          const [titleKey, bodyKey] = REJECTION_KEYS[e.reason]!;
          setStep({ kind: "rejected", titleKey, bodyKey });
        } else {
          setStep({
            kind: "rejected",
            titleKey: "capture.error.title.upload",
            bodyKey: "capture.error.upload",
            ...(e instanceof ApiError ? { raw: e.message } : {}),
          });
        }
      }
    },
    [session, nav],
  );

  const onFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    // Reject oversized files here with a clear message, not a timeout.
    if (file.size > MAX_UPLOAD_MB * 1024 * 1024) {
      setStep({ kind: "rejected", titleKey: "capture.error.title.toobig", bodyKey: "capture.error.toobig" });
      return;
    }
    setStep({ kind: "preview", blob: file, url: URL.createObjectURL(file) });
  }, []);

  const filePicker = (
    <input
      ref={fileRef}
      type="file"
      accept="image/*,.heic,.heif"
      style={{ display: "none" }}
      onChange={onFile}
    />
  );

  if (step.kind === "choice") {
    // B3 entry — camera and upload with equal weight.
    return (
      <div className="screen">
        <TopBar label={t("capture.bar")} onBack={nav.pop} />
        <div className="grow col gap-12" style={{ padding: "36px 20px 20px" }}>
          <h1 className="serif-title" style={{ fontSize: 30, letterSpacing: "0.12em" }}>
            {t("capture.title")}
          </h1>
          <p className="hint-copy" style={{ fontSize: 13 }}>{t("capture.sub")}</p>
          <div className="grow col gap-12" style={{ marginTop: 12 }}>
            <button className="choice-card hero" onClick={() => setStep({ kind: "camera" })}>
              <span style={{ width: 74, height: 74, border: "1px solid var(--c-secondary)", position: "relative", display: "block" }}>
                <span style={{ position: "absolute", left: "50%", top: "50%", width: 34, height: 44, margin: "-24px 0 0 -17px", border: "1px solid var(--c-tertiary)", borderRadius: "17px/22px", display: "block" }} />
              </span>
              <span className="choice-label">{t("capture.take")}</span>
            </button>
            <button className="choice-card" onClick={() => fileRef.current?.click()}>
              <span style={{ width: 74, height: 74, border: "1px solid var(--c-borderStrong)", display: "flex", alignItems: "flex-end", justifyContent: "center", paddingBottom: 14 }}>
                <span style={{ width: 40, height: 1, background: "var(--c-tertiary)", display: "block" }} />
              </span>
              <span className="choice-label">{t("capture.upload")}</span>
            </button>
          </div>
        </div>
        {filePicker}
      </div>
    );
  }

  if (step.kind === "camera") {
    return (
      <>
        <CameraView
          onCapture={(blob, url) => setStep({ kind: "preview", blob, url })}
          onBlocked={() => setStep({ kind: "blocked" })}
          onClose={() => setStep({ kind: "choice" })}
        />
        {filePicker}
      </>
    );
  }

  if (step.kind === "blocked") {
    // D3 permission-denied pattern: same frame as Error, secondary = upload.
    return (
      <div className="screen">
        <TopBar label={t("capture.bar")} onBack={nav.pop} />
        <div className="pad col gap-20 grow" style={{ justifyContent: "center" }}>
          <ErrorPanel
            title={t("camera.blocked.title")}
            body={t("camera.blocked.body")}
            actions={
              <Button variant="primary" onClick={() => fileRef.current?.click()}>
                {t("capture.upload")}
              </Button>
            }
          />
        </div>
        {filePicker}
      </div>
    );
  }

  if (step.kind === "preview" || step.kind === "uploading") {
    const uploading = step.kind === "uploading";
    return (
      <div className="screen">
        <TopBar
          label={t("capture.check.bar")}
          onBack={uploading ? undefined : () => setStep({ kind: "camera" })}
        />
        <div className="pad">
          <div className="capture-stage stage-fixed" style={{ border: "1px solid var(--c-border)" }}>
            {step.kind === "preview" && <img src={step.url} alt="" />}
          </div>
        </div>
        <div className="bottom-dock">
          <Button variant="primary" disabled={uploading} onClick={() => step.kind === "preview" && void upload(step.blob)}>
            {uploading ? t("common.loading") + "…" : t("capture.confirm")}
          </Button>
          <Button variant="secondary" disabled={uploading} onClick={() => setStep({ kind: "camera" })}>
            {t("capture.retake")}
          </Button>
        </div>
      </div>
    );
  }

  // rejected
  return (
    <div className="screen">
      <TopBar label={t("capture.check.bar")} onBack={nav.pop} />
      <div className="pad">
        <div
          className="capture-stage stage-fixed"
          style={{ border: "1px dashed var(--c-borderStrong)", opacity: 0.75, position: "relative" }}
        >
          <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} viewBox="0 0 300 375" preserveAspectRatio="xMidYMid slice">
            <ellipse cx="150" cy="170" rx="60" ry="75" fill="none" stroke="#3A403E" strokeWidth="1" strokeDasharray="5 4" />
          </svg>
        </div>
      </div>
      <div className="pad-x col gap-12" style={{ paddingTop: 8 }}>
        <div className="error-panel" style={{ border: "none", padding: 0 }}>
          <div className="panel-head">
            <span className="bang">!</span>
            <span className="panel-title">{t(step.titleKey)}</span>
          </div>
          <p className="body-copy">{step.raw ?? t(step.bodyKey)}</p>
        </div>
      </div>
      <div className="bottom-dock">
        <Button variant="primary" onClick={() => setStep({ kind: "camera" })}>
          {t("capture.retake")}
        </Button>
        <Button variant="secondary" onClick={() => fileRef.current?.click()}>
          {t("capture.upload.instead")}
        </Button>
      </div>
      {filePicker}
    </div>
  );
}

function CameraView({
  onCapture,
  onBlocked,
  onClose,
}: {
  onCapture: (blob: Blob, url: string) => void;
  onBlocked: () => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [facing, setFacing] = useState<"environment" | "user">("environment");

  useEffect(() => {
    let cancelled = false;
    async function open() {
      streamRef.current?.getTracks().forEach((tr) => tr.stop());
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: facing, width: { ideal: 4096 }, height: { ideal: 4096 } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((tr) => tr.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
      } catch {
        if (!cancelled) onBlocked();
      }
    }
    void open();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((tr) => tr.stop());
    };
  }, [facing, onBlocked]);

  const snap = useCallback(() => {
    const video = videoRef.current;
    if (!video?.videoWidth) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")!.drawImage(video, 0, 0);
    canvas.toBlob(
      (blob) => {
        if (blob) onCapture(blob, URL.createObjectURL(blob));
      },
      "image/jpeg",
      0.92,
    );
  }, [onCapture]);

  return (
    <div className="screen">
      <div className="topbar borderless">
        <button className="back-target close" onClick={onClose}>✕</button>
        <span className="bar-right">
          <button
            className="bar-label"
            style={{ minWidth: 44, height: 44, color: "var(--c-secondary)" }}
            onClick={() => setFacing((f) => (f === "user" ? "environment" : "user"))}
          >
            {t("capture.flip")}
          </button>
        </span>
      </div>
      <div className="capture-stage">
        <video ref={videoRef} playsInline muted />
        <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }} viewBox="0 0 390 560" preserveAspectRatio="xMidYMid slice">
          <ellipse cx="195" cy="246" rx="107" ry="137" fill="none" stroke="#A8AEAB" strokeWidth="1" />
          <line x1="45" y1="400" x2="345" y2="400" stroke="#3A403E" strokeWidth="1" />
        </svg>
        <div className="corner tl" /><div className="corner tr" />
        <div className="corner bl" /><div className="corner br" />
        <div style={{ position: "absolute", left: 0, right: 0, bottom: 24, textAlign: "center", fontSize: 11, letterSpacing: "0.28em", textTransform: "uppercase", color: "var(--c-secondary)" }}>
          {t("capture.guide")}
        </div>
      </div>
      <div className="shutter-zone">
        <button className="shutter" onClick={snap} aria-label={t("capture.take")}>
          <i />
        </button>
      </div>
    </div>
  );
}
