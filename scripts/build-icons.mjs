import { chromium } from "playwright";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

// Deterministic raster exports of the editable SVG mark. Chrome manifest icons
// must be raster images; SVG stays the source of truth for this icon family.
const source = await readFile("extension/icons/logo.svg", "utf8");
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  for (const size of [16, 32, 48, 128, 256, 512]) {
    const bytes = await page.evaluate(async ({ source, size }) => {
      const url = URL.createObjectURL(new Blob([source], { type: "image/svg+xml" }));
      try {
        const img = new Image();
        img.src = url;
        await img.decode();
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = size;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, size, size);
        return canvas.toDataURL("image/png").split(",")[1];
      } finally { URL.revokeObjectURL(url); }
    }, { source, size });
    const destination = path.join("extension/icons", `icon-${size}.png`);
    await writeFile(destination, Buffer.from(bytes, "base64"));
    console.log(destination);
  }
} finally { await browser.close(); }
