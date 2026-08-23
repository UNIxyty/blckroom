import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError } from "../api.js";
import { Generating } from "./Generating.js";

type Step =
  | { kind: "consent" }
  | { kind: "camera" }
  | { kind: "preview"; blob: Blob; url: string }
  | { kind: "uploading" }
  | { kind: "generating"; sessionId: string }
  | { kind: "error"; message: string; retakable: boolean };

interface NewSession {
  session_id: string;
  upload_url: string;
  source_path: string;
}

export function CaptureFlow() {
  const [step, setStep] = useState<Step>({ kind: "consent" });
  const sessionRef = useRef<NewSession | null>(null);

  const startCapture = useCallback(async () => {
    try {
      sessionRef.current = await api<NewSession>("/api/sessions", {
        method: "POST",
        body: JSON.stringify({ consent: true }),
      });
      setStep({ kind: "camera" });
    } catch (e) {
      setStep({
        kind: "error",
        message: e instanceof ApiError ? e.message : "Could not start a session.",
        retakable: false,
      });
    }
  }, []);

  const upload = useCallback(async (blob: Blob) => {
    const session = sessionRef.current;
    if (!session) return;
    setStep({ kind: "uploading" });
    try {
      const put = await fetch(session.upload_url, {
        method: "PUT",
        headers: { "content-type": "image/jpeg" },
        body: blob,
      });
      if (!put.ok) throw new Error(`upload failed (${put.status})`);
      await api(`/api/sessions/${session.session_id}/uploaded`, { method: "POST" });
      await api(`/api/sessions/${session.session_id}/generate`, { method: "POST" });
      setStep({ kind: "generating", sessionId: session.session_id });
    } catch (e) {
      setStep({
        kind: "error",
        message: e instanceof ApiError ? e.message : "Upload failed — check the connection.",
        retakable: e instanceof ApiError && e.status === 422,
      });
    }
  }, []);

  if (step.kind === "consent") return <Consent onAgree={startCapture} />;
  if (step.kind === "camera")
    return (
      <Camera
        onCapture={(blob, url) => setStep({ kind: "preview", blob, url })}
        onCancel={() => setStep({ kind: "consent" })}
      />
    );
  if (step.kind === "preview")
    return (
      <div className="pad col">
        <div className="capture-stage">
          <img src={step.url} alt="captured client" />
        </div>
        <div className="row2">
          <button className="btn" onClick={() => setStep({ kind: "camera" })}>
            Retake
          </button>
          <button className="btn primary" onClick={() => upload(step.blob)}>
            Use this photo
          </button>
        </div>
      </div>
    );
  if (step.kind === "uploading")
    return <p className="dim pad">Uploading…</p>;
  if (step.kind === "generating")
    return <Generating sessionId={step.sessionId} onRestart={() => setStep({ kind: "consent" })} />;

  return (
    <div className="pad col">
      <p className="dim">{step.message}</p>
      <button
        className="btn"
        onClick={() => setStep(step.retakable ? { kind: "camera" } : { kind: "consent" })}
      >
        {step.retakable ? "Retake" : "Start over"}
      </button>
    </div>
  );
}

function Consent({ onAgree }: { onAgree: () => void }) {
  const [agreed, setAgreed] = useState(false);
  return (
    <div className="pad col">
      <h2 className="section-title">Client consent</h2>
      <div className="consent-box">
        <p style={{ marginTop: 0 }}>
          Before the photo is taken, the client must agree to the following:
        </p>
        <ul style={{ paddingLeft: 18, margin: 0 }}>
          <li>Their photo is used only to generate haircut previews.</li>
          <li>Processing uses an AI image service (Google Gemini, paid tier).</li>
          <li>All images are automatically deleted within 24 hours.</li>
          <li>They can ask the barber to delete everything immediately.</li>
        </ul>
      </div>
      <label className="consent-check">
        <input
          type="checkbox"
          checked={agreed}
          onChange={(e) => setAgreed(e.target.checked)}
          style={{ width: "auto" }}
        />
        <span className="dim">The client has been informed and agrees.</span>
      </label>
      <button className="btn primary block" disabled={!agreed} onClick={onAgree}>
        Open camera
      </button>
    </div>
  );
}

function Camera({
  onCapture,
  onCancel,
}: {
  onCapture: (blob: Blob, url: string) => void;
  onCancel: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [cameraFailed, setCameraFailed] = useState(false);
  const [facing, setFacing] = useState<"environment" | "user">("environment");

  useEffect(() => {
    let cancelled = false;
    async function open() {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      try {
        // Ask for the highest resolution the device will give — Telegram's
        // photo pipeline is bypassed on purpose, don't lose quality here.
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: facing,
            width: { ideal: 4096 },
            height: { ideal: 4096 },
          },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
      } catch {
        // Telegram webviews (notably iOS) can refuse getUserMedia — fall back
        // to the native camera via file input, which still delivers full res.
        if (!cancelled) setCameraFailed(true);
      }
    }
    void open();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, [facing]);

  const snap = useCallback(() => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
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

  const onFile = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) onCapture(file, URL.createObjectURL(file));
    },
    [onCapture],
  );

  if (cameraFailed) {
    return (
      <div className="pad col">
        <p className="dim">
          In-app camera isn't available here — use the device camera instead. The photo keeps
          full resolution.
        </p>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={onFile}
          style={{ display: "none" }}
        />
        <button className="btn primary block" onClick={() => fileRef.current?.click()}>
          Take photo
        </button>
        <button className="btn block" onClick={onCancel}>
          Back
        </button>
      </div>
    );
  }

  return (
    <div className="pad col">
      <div className="capture-stage">
        <video ref={videoRef} playsInline muted />
        <FaceGuide />
      </div>
      <div className="row2">
        <button className="btn" onClick={onCancel}>
          Back
        </button>
        <button
          className="btn"
          onClick={() => setFacing((f) => (f === "user" ? "environment" : "user"))}
        >
          Flip
        </button>
        <button className="btn primary" onClick={snap}>
          Capture
        </button>
      </div>
      <p className="dim small">
        Fill the oval with the client's head, camera at eye level, even light.
      </p>
    </div>
  );
}

function FaceGuide() {
  return (
    <svg className="face-guide" viewBox="0 0 300 400" preserveAspectRatio="xMidYMid slice">
      <defs>
        <mask id="hole">
          <rect width="300" height="400" fill="white" />
          <ellipse cx="150" cy="170" rx="88" ry="118" fill="black" />
        </mask>
      </defs>
      <rect width="300" height="400" fill="rgba(8,9,9,0.55)" mask="url(#hole)" />
      <ellipse
        cx="150"
        cy="170"
        rx="88"
        ry="118"
        fill="none"
        stroke="#A8AEAB"
        strokeWidth="1.5"
        strokeDasharray="6 5"
      />
    </svg>
  );
}
