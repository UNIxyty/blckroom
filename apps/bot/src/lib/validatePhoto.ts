import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import sharp, { type Sharp } from "sharp";
import * as ort from "onnxruntime-node";

/**
 * Cheap server-side photo validation before spending nine Gemini calls:
 *  - decodable image, min 800×800
 *  - exactly-ish one face, roughly centred, large enough to be a portrait
 * Uses UltraFace RFB-320 (1.2MB ONNX, CPU, ~30ms).
 */

const MODEL_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  "..", "..", "models", "version-RFB-320.onnx",
);
const IN_W = 320;
const IN_H = 240;
const SCORE_THRESHOLD = 0.7;

let sessionPromise: Promise<ort.InferenceSession> | undefined;

function getModel(): Promise<ort.InferenceSession> {
  sessionPromise ??= ort.InferenceSession.create(MODEL_PATH, { logSeverityLevel: 3 });
  return sessionPromise;
}

export interface PhotoValidation {
  ok: boolean;
  reason?: "too_small" | "not_an_image" | "no_face" | "face_off_center" | "face_too_small";
  width?: number;
  height?: number;
}

interface Detection {
  score: number;
  cx: number; // normalized [0,1]
  cy: number;
  w: number;
  h: number;
}

async function detectBestFace(image: Sharp): Promise<Detection | null> {
  const { data } = await image
    .clone()
    .resize(IN_W, IN_H, { fit: "fill" })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  // HWC uint8 → CHW float32, (x - 127) / 128
  const chw = new Float32Array(3 * IN_H * IN_W);
  for (let i = 0; i < IN_H * IN_W; i++) {
    chw[i] = (data[i * 3]! - 127) / 128;
    chw[IN_H * IN_W + i] = (data[i * 3 + 1]! - 127) / 128;
    chw[2 * IN_H * IN_W + i] = (data[i * 3 + 2]! - 127) / 128;
  }

  const model = await getModel();
  const output = await model.run({
    input: new ort.Tensor("float32", chw, [1, 3, IN_H, IN_W]),
  });
  const scores = output["scores"]!.data as Float32Array; // [1, N, 2]
  const boxes = output["boxes"]!.data as Float32Array; // [1, N, 4] x1,y1,x2,y2 normalized

  let best: Detection | null = null;
  const n = scores.length / 2;
  for (let i = 0; i < n; i++) {
    const score = scores[i * 2 + 1]!;
    if (score < SCORE_THRESHOLD) continue;
    const x1 = boxes[i * 4]!;
    const y1 = boxes[i * 4 + 1]!;
    const x2 = boxes[i * 4 + 2]!;
    const y2 = boxes[i * 4 + 3]!;
    if (!best || score > best.score) {
      best = { score, cx: (x1 + x2) / 2, cy: (y1 + y2) / 2, w: x2 - x1, h: y2 - y1 };
    }
  }
  return best;
}

export async function validatePortraitPhoto(buffer: Buffer): Promise<PhotoValidation> {
  let image: Sharp;
  let width: number;
  let height: number;
  try {
    image = sharp(buffer, { failOn: "error" });
    const meta = await image.metadata();
    if (!meta.width || !meta.height) return { ok: false, reason: "not_an_image" };
    width = meta.width;
    height = meta.height;
  } catch {
    return { ok: false, reason: "not_an_image" };
  }

  if (width < 800 || height < 800) {
    return { ok: false, reason: "too_small", width, height };
  }

  const face = await detectBestFace(image);
  if (!face) return { ok: false, reason: "no_face", width, height };

  // Roughly centred: face centre inside the middle 60% horizontally and
  // upper-middle band vertically (portraits put the face above centre).
  if (face.cx < 0.2 || face.cx > 0.8 || face.cy < 0.1 || face.cy > 0.75) {
    return { ok: false, reason: "face_off_center", width, height };
  }
  // Big enough to actually be the subject, not a bystander.
  if (face.h < 0.12) {
    return { ok: false, reason: "face_too_small", width, height };
  }

  return { ok: true, width, height };
}
