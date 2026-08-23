# Renderer templates — token inventory

Imported verbatim from the Claude Design project
(`BLACK ROOM Frames.dc.html`, project `d67af9da-3d04-4575-ae6a-e50f6f990692`).
The canvas wrapper `BLACK ROOM Frames.dc.html` and `support.js` are the design-canvas
runtime and spec sheet — not needed for headless rendering, so not imported. The three
templates below are standalone HTML with no JS dependence.

## single-cut-card.html — 1080 × 1350

| Token | Where | Notes |
|---|---|---|
| `{{cut_name}}` | `h1.cut` | uppercase styling applied by CSS |
| `{{price}}` | `.price` | pre-formatted string, e.g. `€ 25` |
| `{{duration}}` | `.dur` | pre-formatted string, e.g. `45 min` |
| `{{barber_name}}` | `.meta-top` | |
| `{{date}}` | `.meta-top` | pre-formatted, shop-timezone |
| `{{image_url}}` | `.slot .img` CSS `background-image` **and** visible `.tok` label | see “tok labels” below |

## loading-card.html — 1080 × 1350

| Token | Where |
|---|---|
| `{{cut_name}}` | `h1.cut` (rendered dimmed) |
| `{{barber_name}}` | `.meta-top` |
| `{{date}}` | `.meta-top` |

No price/duration/image tokens — those areas are shimmer skeleton bars. This template
is the visual reference for the Mini App's loading tiles (it is animated; it is never
screenshotted by the pipeline).

## grid-sheet.html — 2400 × 2600

| Token | Where | Notes |
|---|---|---|
| `{{cut_name_1}}` … `{{cut_name_9}}` | `.cardname` | grid order: left→right, top→bottom |
| `{{price_1}}` … `{{price_9}}` | `.price` | |
| `{{duration_1}}` … `{{duration_9}}` | `.dur` | |
| `{{image_url_1}}` … `{{image_url_9}}` | `.s1`–`.s9` CSS `background-image` **and** `.tok` labels | |
| `{{qr_image}}` | `.qr .img` CSS `background-image` **and** `.qr .tok` label | QR links to the signed, expiring sheet URL |
| `{{barber_name}}` | footer `.fline` | |
| `{{date}}` | footer `.fline` | |

## Differences from the §1 guesses

- The grid sheet uses **numbered** tokens (`_1`–`_9`), not singular ones.
- `{{qr_image}}` exists only in the grid sheet.
- The loading card takes only `cut_name`/`barber_name`/`date`.
- Every image token appears **twice**: in a CSS `background-image` and in a visible
  monospace `.tok` placeholder label inside the slot.

## Headless rendering notes (handled in code, templates untouched)

1. **Webfont race** — the render fn waits for `document.fonts.ready` before
   screenshotting (Cormorant Garamond, Archivo, Mrs Saint Delafield from Google
   Fonts).
2. **Background-image race** — CSS backgrounds fire no load events; the render fn
   pre-decodes every injected image URL in the page before capture.
3. **`.tok` labels** — the visible token labels sit *under* the image layer. In the
   design canvas they are a placeholder affordance, but in production a failed image
   load would expose a signed Storage URL in the delivered photo. The render fn clears
   the text content of all `.tok` elements at render time via script — the template
   files themselves are unmodified.

No other changes were needed; the templates render headless as-is.
