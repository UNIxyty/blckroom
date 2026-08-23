/**
 * Per-image generation cost in cents (EUR), keyed by Gemini model id.
 * Written to generations.cost_cents at completion and summed into
 * sessions.cost_cents. Update here when pricing changes — never inline.
 */
export const COST_PER_IMAGE_CENTS: Record<string, number> = {
  // ~$0.039/image → ~4 cents; keep a safety margin and treat as EUR cents.
  "gemini-2.5-flash-image": 4,
  "gemini-2.0-flash-preview-image-generation": 4,
};

/** Fallback for unknown models: assume the most expensive known tier. */
export const DEFAULT_COST_PER_IMAGE_CENTS = 4;

export function costForModelCents(model: string): number {
  return COST_PER_IMAGE_CENTS[model] ?? DEFAULT_COST_PER_IMAGE_CENTS;
}
