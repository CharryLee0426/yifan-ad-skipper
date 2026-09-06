import { chromium } from "playwright";
import { mkdir, mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

// Inspect only public page metadata in a disposable, signed-out profile.
// Never save stream URLs, signatures, cookies, user objects, or response bodies.
const mode = process.argv.includes("--baseline") ? "baseline" : "protected";
const urls = process.env.YIFAN_TEST_URL ? [process.env.YIFAN_TEST_URL] : [
  "https://www.yifan.tv/play/X4r3180qOd2", "https://www.yifan.tv/play/8kOpVaG31G3"
];
const extension = path.resolve("extension");
const profile = await mkdtemp(path.join(tmpdir(), "yifan-quality-"));
await mkdir("artifacts", { recursive: true });
const context = await chromium.launchPersistentContext(profile, {
  channel: "chromium", headless: true, viewport: { width: 1440, height: 1000 },
  args: mode === "protected" ? [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`] : []
});
try {
  const results = [];
  for (const [index, url] of urls.entries()) {
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", error => errors.push(error.name));
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
    const quality = page.locator("vg-quality-selector");
    await quality.waitFor({ timeout: 30000 });
    const video = page.locator("#video_player");
    if (await video.evaluate(element => element.paused)) await page.locator("#play-pause-button").click({ force: true });
    await page.waitForFunction(() => document.querySelector("#video_player")?.readyState >= 2, null, { timeout: 20000 }).catch(() => {});
    const metadata = await quality.evaluate(element => {
      // Read the observed Angular context for research only. Production uses the
      // existing component-definition hooks, without depending on this layout.
      const selector = element.__ngContext__?.find(value => value && typeof value.selectBitrate === "function");
      if (!selector) throw new Error("Quality selector context changed");
      return {
        signedIn: !!selector.user?.id, isLive: selector.isLive, isLine: selector.isLine,
        selected: selector.bitrateSelected?.bitrate,
        options: selector.bitrates.map(option => ({
          height: option.bitrate, enabled: option.isEnabled, vip: option.isVIP, bought: option.isBought,
          hasStream: !!option.path?.result
        }))
      };
    });
    const playback = await video.evaluate(element => ({
      width: element.videoWidth, height: element.videoHeight, readyState: element.readyState,
      paused: element.paused, error: element.error?.code || null
    }));
    let extensionStatus;
    if (mode === "protected") {
      const worker = context.serviceWorkers()[0] || await context.waitForEvent("serviceworker");
      extensionStatus = await worker.evaluate(async url => {
        const tabs = await chrome.tabs.query({});
        const tab = tabs.find(tab => tab.url === url);
        return chrome.tabs.sendMessage(tab.id, { type: "get-page-status" });
      }, page.url());
    }
    await quality.locator(".quality-selected").click({ force: true });
    await page.screenshot({ path: `artifacts/quality-${mode}-${index + 1}.png` });
    const result = { url: page.url(), title: await page.title(), ...metadata, playback, extensionStatus, errors };
    results.push(result);
    console.log(JSON.stringify(result, null, 2));
    await page.close();
  }
  await writeFile(`artifacts/quality-${mode}.json`, JSON.stringify({ checkedAt: new Date().toISOString(), mode, results }, null, 2) + "\n");
} finally {
  await context.close();
  await rm(profile, { recursive: true, force: true });
}
