import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import QRCode from "qrcode";
import {
  renderTemplate,
  renderSingleCutCard,
  renderGridSheet,
  closeBrowser,
  type SheetTokens,
} from "./render.js";
import { fixtureCuts, fixtureMeta } from "./fixtures.js";

const outDir = join(process.cwd(), "out");

async function main(): Promise<void> {
  await mkdir(outDir, { recursive: true });

  const qr = await QRCode.toDataURL(fixtureMeta.sheet_url, {
    margin: 2,
    width: 400,
    color: { dark: "#F2F3F1", light: "#101312" },
  });

  const first = fixtureCuts[0]!;

  console.log("rendering single-cut-card…");
  const card = await renderSingleCutCard({
    cut_name: first.name,
    price: first.price,
    duration: first.duration,
    barber_name: fixtureMeta.barber_name,
    date: fixtureMeta.date,
    image_url: first.image_url,
  });
  await writeFile(join(outDir, "single-cut-card.png"), card);

  console.log("rendering loading-card…");
  const loading = await renderTemplate("loading-card", {
    cut_name: first.name,
    barber_name: fixtureMeta.barber_name,
    date: fixtureMeta.date,
  });
  await writeFile(join(outDir, "loading-card.png"), loading);

  console.log("rendering grid-sheet…");
  const sheet = await renderGridSheet({
    slots: fixtureCuts.map((c) => ({
      cut_name: c.name,
      price: c.price,
      duration: c.duration,
      image_url: c.image_url,
    })) as SheetTokens["slots"],
    qr_image: qr,
    barber_name: fixtureMeta.barber_name,
    date: fixtureMeta.date,
  });
  await writeFile(join(outDir, "grid-sheet.png"), sheet);

  await closeBrowser();
  console.log(`done → ${outDir}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
