/**
 * Token injection for the imported design templates.
 *
 * Two contexts exist in the templates:
 *  - URL tokens (image_url*, qr_image) land inside CSS url('…') and in the
 *    visible .tok labels (which the renderer clears before screenshotting).
 *  - Text tokens land in HTML text content.
 */
const URL_TOKEN = /^(image_url(_[1-9])?|qr_image)$/;

function escapeHtmlText(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function assertSafeUrl(key: string, value: string): string {
  // A quote or paren would escape the CSS url('…') context; reject rather than
  // try to repair. Signed Supabase URLs, file:// paths and data: URIs all pass.
  if (/['"<>\\()\s]/.test(value)) {
    throw new Error(`unsafe characters in URL token ${key}`);
  }
  return value;
}

export function injectTokens(
  templateHtml: string,
  tokens: Record<string, string>,
): string {
  let html = templateHtml;
  for (const [key, value] of Object.entries(tokens)) {
    const safe = URL_TOKEN.test(key)
      ? assertSafeUrl(key, value)
      : escapeHtmlText(value);
    html = html.replaceAll(`{{${key}}}`, safe);
  }
  const leftover = /\{\{[a-z0-9_]+\}\}/i.exec(html);
  if (leftover) {
    throw new Error(`template token left unfilled: ${leftover[0]}`);
  }
  return html;
}
