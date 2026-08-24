# Renderer templates — token inventory (v2)

Imported verbatim from the Claude Design project
(project `d67af9da-3d04-4575-ae6a-e50f6f990692`). v2 revision: price, duration
and the QR code are gone from every frame; image slots grew (card slot
1024×1130, grid slots 460²); the grid footer is a centered name/date lockup
plus disclaimer. The signed expiring share link (`/s/:id`) still exists — it
just isn't rendered as a QR anymore.

## single-cut-card.html — 1080 × 1350

| Token | Where | Notes |
|---|---|---|
| `{{cut_name}}` | centered `h1.cut` | RU name used when the barber works in Russian |
| `{{barber_name}}` | `.meta-top` | |
| `{{date}}` | `.meta-top` | shop-timezone, `24 Aug 2026` style |
| `{{image_url}}` | `.slot .img` CSS background **and** visible `.tok` label | `.tok` cleared at render time |

## loading-card.html — 1080 × 1350

`{{cut_name}}`, `{{barber_name}}`, `{{date}}` — Mini App visual reference only,
never screenshotted by the pipeline.

## grid-sheet.html — 2400 × 2600

| Token | Where | Notes |
|---|---|---|
| `{{cut_name_1..9}}` | `.cardname` | empty string for unfilled slots (< 9 active cuts) |
| `{{image_url_1..9}}` | `.s1`–`.s9` CSS backgrounds + `.tok` labels | unfilled slots get a 1×1 transparent PNG so the stripe backdrop shows; failed cuts get an explicit dashed FAILED tile |
| `{{barber_name}}`, `{{date}}` | footer `.fline` | |

Removed since v1: `{{price_*}}`, `{{duration_*}}`, `{{qr_image}}`.

## Headless rendering notes (unchanged from v1)

1. Render fn waits for `document.fonts.ready` (Google Fonts race).
2. CSS backgrounds are pre-decoded before capture (no load events on them).
3. Visible `.tok` labels are cleared via script at render time so a failed
   image load can never expose a signed URL — template files stay verbatim.
