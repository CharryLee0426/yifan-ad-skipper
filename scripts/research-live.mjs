import { chromium } from "playwright";
import { mkdir, mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

// Public pages only; uses a disposable browser profile, never a personal login.
const url = process.env.YIFAN_TEST_URL || "https://www.yifan.tv/play/X4r3180qOd2";
const mode = process.argv.includes("--baseline") ? "baseline" : "protected";
const extension = path.resolve("extension");
const profile = await mkdtemp(path.join(tmpdir(), "yifan-research-"));
await mkdir("artifacts", { recursive: true });
const context = await chromium.launchPersistentContext(profile, {
  channel: "chromium", headless: true, viewport: { width: 1440, height: 1000 },
  args: mode === "protected" ? [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`] : []
});
try {
  const page = await context.newPage();
  const requests = new Map();
  const errors = [];
  let extensionStatus;
  await page.exposeFunction("captureSkipperStatus", data => { extensionStatus = data; });
  await page.addInitScript(() => {
    window.addEventListener("message", event => {
      if (event.source === window && event.data?.source === "yifan-ad-skipper:page") window.captureSkipperStatus(event.data);
    });
  });
  page.on("request", request => {
    // Store hosts and types only. Stream paths and queries can contain signatures.
    const key = `${request.resourceType()} ${new URL(request.url()).hostname}`;
    requests.set(key, (requests.get(key) || 0) + 1);
  });
  page.on("pageerror", error => errors.push(error.message.slice(0, 200)));
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.locator("#video_player").waitFor({ timeout: 30000 });
  await page.waitForTimeout(4000);
  const video = page.locator("#video_player");
  const snapshots = [];
  const snapshot = async label => {
    const state = await video.evaluate(element => ({
      currentTime: element.currentTime, duration: element.duration,
      paused: element.paused, readyState: element.readyState, error: element.error?.code || null
    }));
    snapshots.push({ label, ...state });
    console.log(label, state, extensionStatus || "No extension");
  };
  await snapshot("loaded");
  // Use a real UI gesture to satisfy autoplay policy without changing site settings.
  if (await video.evaluate(element => element.paused)) await page.locator("#play-pause-button").click({ force: true });
  await page.waitForTimeout(5000);
  await snapshot("playing");
  await video.evaluate(element => { element.currentTime = Math.floor(element.duration / 2) + 2; });
  await page.waitForTimeout(7000);
  await snapshot("after-midpoint");
  await video.evaluate(element => element.pause());
  await page.waitForTimeout(1200);
  await snapshot("paused");
  const overlays = await page.locator(".dabf, vg-pause-f, .vg-vvk-p").evaluateAll(elements => elements.map(element => ({
    tag: element.tagName, visible: !!(element.getClientRects().length && getComputedStyle(element).display !== "none")
  })));
  await page.screenshot({ path: `artifacts/${mode}.png` });
  let navigation;
  if (process.argv.includes("--spa")) {
    await page.evaluate(() => { window.__researchDocument = true; });
    const related = page.locator('a[href^="/play/"]').first();
    const target = await related.getAttribute("href");
    await related.click();
    await page.waitForURL(`https://www.yifan.tv${target}`);
    await page.waitForTimeout(8000);
    await snapshot("related-video");
    navigation = { url: page.url(), sameDocument: await page.evaluate(() => window.__researchDocument === true) };
  }
  const result = { checkedAt: new Date().toISOString(), mode, url, snapshots, extensionStatus, overlays, navigation, requests: Object.fromEntries(requests), errors };
  await writeFile(`artifacts/${mode}.json`, JSON.stringify(result, null, 2) + "\n");
  console.log("RESULT", JSON.stringify(result, null, 2));
} finally {
  await context.close();
  await rm(profile, { recursive: true, force: true });
}
