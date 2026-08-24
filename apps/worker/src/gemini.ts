import type { AppConfig } from "@blackroom/shared/config";

export interface GeneratedImage {
  data: Buffer;
  mimeType: string;
}

const TRANSIENT_STATUSES = new Set([429, 500, 502, 503, 504]);
const MAX_TRIES = 3; // initial + 2 retries

/**
 * Edit the source portrait with the given prompt via the Gemini image API.
 * Retries twice with backoff on transient failures; a refusal (no image part
 * in the response) is permanent and throws immediately.
 */
export async function generateHaircutImage(
  config: AppConfig,
  source: Buffer,
  sourceMime: string,
  prompt: string,
): Promise<GeneratedImage> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${config.GEMINI_IMAGE_MODEL}:generateContent`;
  const body = JSON.stringify({
    contents: [
      {
        parts: [
          { inline_data: { mime_type: sourceMime, data: source.toString("base64") } },
          { text: prompt },
        ],
      },
    ],
  });

  let lastError = "unknown";
  for (let attempt = 1; attempt <= MAX_TRIES; attempt++) {
    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: { "x-goog-api-key": config.GEMINI_API_KEY, "content-type": "application/json" },
        body,
        signal: AbortSignal.timeout(90_000),
      });
    } catch (err) {
      lastError = `network: ${String(err)}`;
      await backoff(attempt);
      continue;
    }

    if (TRANSIENT_STATUSES.has(res.status)) {
      lastError = `gemini ${res.status}: ${(await res.text()).slice(0, 300)}`;
      await backoff(attempt);
      continue;
    }
    if (!res.ok) {
      throw new Error(`gemini ${res.status}: ${(await res.text()).slice(0, 500)}`);
    }

    const json = (await res.json()) as {
      candidates?: Array<{
        content?: { parts?: Array<{ inlineData?: { mimeType: string; data: string }; inline_data?: { mime_type: string; data: string }; text?: string }> };
        finishReason?: string;
      }>;
      promptFeedback?: { blockReason?: string };
    };

    if (json.promptFeedback?.blockReason) {
      // Prompt-level block is deterministic — retrying the identical request
      // cannot help. Permanent.
      throw new Error(`gemini blocked: ${json.promptFeedback.blockReason}`);
    }
    const parts = json.candidates?.[0]?.content?.parts ?? [];
    for (const part of parts) {
      const img = part.inlineData ?? part.inline_data;
      if (img?.data) {
        return {
          data: Buffer.from(img.data, "base64"),
          mimeType: (part.inlineData?.mimeType ?? part.inline_data?.mime_type) || "image/png",
        };
      }
    }
    // No image in a 200 response (finishReason IMAGE_OTHER & friends).
    // Diagnosed live as NON-deterministic — the same request typically
    // succeeds on retry — so treat it like any transient failure.
    const text = parts.find((p) => p.text)?.text?.slice(0, 300);
    lastError = `gemini returned no image (finish: ${json.candidates?.[0]?.finishReason ?? "?"}) ${text ?? ""}`;
    await backoff(attempt);
  }
  // "gemini transient" prefix routes this into the job queue's retry path.
  throw new Error(`gemini transient failure after ${MAX_TRIES} tries: ${lastError}`);
}

async function backoff(attempt: number): Promise<void> {
  const ms = 1000 * 2 ** (attempt - 1) + Math.random() * 500;
  await new Promise((r) => setTimeout(r, ms));
}
