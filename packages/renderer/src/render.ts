import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { chromium, type Browser } from "playwright";
import { injectTokens } from "./inject.js";

const templatesDir = join(dirname(fileURLToPath(import.meta.url)), "..", "templates");

export const TEMPLATE_SIZES = {
  "single-cut-card": { width: 1080, height: 1350 },
  "loading-card": { width: 1080, height: 1350 },
  "grid-sheet": { width: 2400, height: 2600 },
} as const;

export type TemplateName = keyof typeof TEMPLATE_SIZES;

// One browser instance shared across all renders — never launch per image.
let browser: Browser | undefined;

async function getBrowser(): Promise<Browser> {
  if (!browser || !browser.isConnected()) {
    browser = await chromium.launch({ headless: true });
  }
  return browser;
}

export async function closeBrowser(): Promise<void> {
  await browser?.close();
  browser = undefined;
}

/**
 * Render a template to a PNG buffer at 1×.
 *
 * Headless-safety measures (see TOKENS.md — templates stay verbatim):
 *  - waits for document.fonts.ready (Google Fonts race)
 *  - pre-decodes every CSS background-image URL (backgrounds fire no events)
 *  - clears the visible .tok placeholder labels so a failed image load can
 *    never expose a signed URL in the delivered picture
 */
export async function renderTemplate(
  name: TemplateName,
  tokens: Record<string, string>,
): Promise<Buffer> {
  const size = TEMPLATE_SIZES[name];
  const templateHtml = await readFile(join(templatesDir, `${name}.html`), "utf8");
  const html = injectTokens(templateHtml, tokens);

  const b = await getBrowser();
  const page = await b.newPage({
    viewport: size,
    deviceScaleFactor: 1,
  });
  try {
    await page.setContent(html, { waitUntil: "networkidle" });

    await page.evaluate(async () => {
      // Clear placeholder token labels (production must never show them).
      for (const el of Array.from(document.querySelectorAll(".tok"))) {
        el.textContent = "";
      }

      await document.fonts.ready;

      // Collect every url(...) from computed background-image values and
      // wait for each to decode before screenshotting.
      const urls = new Set<string>();
      for (const el of Array.from(document.querySelectorAll<HTMLElement>("*"))) {
        const bg = getComputedStyle(el).backgroundImage;
        if (!bg || bg === "none") continue;
        for (const m of bg.matchAll(/url\("?([^")]+)"?\)/g)) {
          const url = m[1];
          if (url) urls.add(url);
        }
      }
      await Promise.all(
        Array.from(urls).map(
          (url) =>
            new Promise<void>((resolve) => {
              const img = new Image();
              img.onload = () => resolve();
              img.onerror = () => resolve();
              img.src = url;
              if (img.complete) resolve();
            }),
        ),
      );
    });

    return await page.screenshot({
      type: "png",
      clip: { x: 0, y: 0, ...size },
      animations: "disabled",
    });
  } finally {
    await page.close();
  }
}

export interface CardTokens {
  cut_name: string;
  price: string;
  duration: string;
  barber_name: string;
  date: string;
  image_url: string;
}

export async function renderSingleCutCard(tokens: CardTokens): Promise<Buffer> {
  return renderTemplate("single-cut-card", { ...tokens });
}

export interface SheetSlot {
  cut_name: string;
  price: string;
  duration: string;
  image_url: string;
}

export interface SheetTokens {
  slots: [
    SheetSlot, SheetSlot, SheetSlot,
    SheetSlot, SheetSlot, SheetSlot,
    SheetSlot, SheetSlot, SheetSlot,
  ];
  qr_image: string;
  barber_name: string;
  date: string;
}

export async function renderGridSheet(tokens: SheetTokens): Promise<Buffer> {
  const flat: Record<string, string> = {
    qr_image: tokens.qr_image,
    barber_name: tokens.barber_name,
    date: tokens.date,
  };
  tokens.slots.forEach((slot, i) => {
    flat[`cut_name_${i + 1}`] = slot.cut_name;
    flat[`price_${i + 1}`] = slot.price;
    flat[`duration_${i + 1}`] = slot.duration;
    flat[`image_url_${i + 1}`] = slot.image_url;
  });
  return renderTemplate("grid-sheet", flat);
}
