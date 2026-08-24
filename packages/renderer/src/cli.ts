import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  renderTemplate,
  renderSingleCutCard,
  renderGridSheet,
  closeBrowser,
} from "./render.js";
import { fixtureCuts, fixtureMeta } from "./fixtures.js";

const outDir = join(process.cwd(), "out");

async function main(): Promise<void> {
  await mkdir(outDir, { recursive: true });

  const first = fixtureCuts[0]!;

  console.log("rendering single-cut-card…");
  const card = await renderSingleCutCard({
    cut_name: first.name,
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
    slots: fixtureCuts.map((c) => ({ cut_name: c.name, image_url: c.image_url })),
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
