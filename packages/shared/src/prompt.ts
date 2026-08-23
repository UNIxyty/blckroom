/**
 * The generation prompt template. haircuts.prompt in the DB holds only the
 * per-cut description; the guardrail clauses live here so they can be improved
 * globally without touching nine rows.
 */
const PROMPT_TEMPLATE = `Edit this portrait photograph. Change ONLY the hair.

New hairstyle: {{HAIRCUT_DESCRIPTION}}

Preserve exactly, with no alteration whatsoever:
- the subject's facial features, bone structure, and expression
- skin tone and skin texture
- the subject's natural hairline position and natural hair density
- hair color
- head angle, framing, background, and lighting direction

Do not beautify, slim, smooth, or otherwise retouch the face.
Do not add hair volume or density the subject does not have.
Photorealistic. Same photograph, same person, different haircut.`;

export function buildGenerationPrompt(haircutDescription: string): string {
  return PROMPT_TEMPLATE.replace("{{HAIRCUT_DESCRIPTION}}", haircutDescription.trim());
}
