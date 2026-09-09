import { chromium } from "playwright";
import { mkdir, mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

// Feasibility research for client-side upscaling of the guest stream. Public
// page, disposable signed-out profile. Records only dimensions, timings, API
// outcomes, and screenshots; never stream URLs, cookies, or response bodies.
const url = process.env.YIFAN_TEST_URL || "https://www.yifan.tv/play/X4r3180qOd2";
const headed = process.argv.includes("--headed");
const gpu = process.argv.includes("--gpu");
const extension = path.resolve("extension");
const prototype = await readFile(path.resolve("scripts/upscale-prototype.js"), "utf8");
const profile = await mkdtemp(path.join(tmpdir(), "yifan-upscale-"));
await mkdir("artifacts", { recursive: true });
const context = await chromium.launchPersistentContext(profile, {
  channel: "chromium", headless: !headed, viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2,
  args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`, "--autoplay-policy=no-user-gesture-required",
    ...(gpu ? ["--use-angle=metal", "--enable-unsafe-webgpu", "--ignore-gpu-blocklist"] : [])]
});
const result = { checkedAt: new Date().toISOString(), url, headed, gpuFlags: gpu, steps: {} };
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
try {
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message.slice(0, 160)));
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
  const video = page.locator("#video_player");
  await video.waitFor({ timeout: 30000 });
  if (await video.evaluate(element => element.paused)) await page.locator("#play-pause-button").click({ force: true });
  await page.waitForFunction(() => document.querySelector("#video_player")?.readyState >= 3, null, { timeout: 25000 }).catch(() => {});
  await wait(2000);
  // Hide the site's controls for like-for-like screenshots; keep them for the interaction steps.
  const playerBox = async () => page.locator("vg-player#main-player").boundingBox();
  const detail = async (name) => {
    const box = await playerBox();
    const clip = { x: box.x + box.width * 0.35, y: box.y + box.height * 0.3, width: box.width * 0.3, height: box.height * 0.3 };
    await page.mouse.move(5, 5);
    await page.screenshot({ path: `artifacts/upscale-${name}.png`, clip: box });
    await page.screenshot({ path: `artifacts/upscale-${name}-detail.png`, clip });
  };
  result.steps.environment = await page.evaluate(async () => {
    const v = document.querySelector("#video_player");
    let adapter = null;
    try { const a = await navigator.gpu?.requestAdapter(); adapter = a ? { ...(a.info ? { vendor: a.info.vendor, architecture: a.info.architecture } : {}), available: true } : { available: false }; }
    catch (error) { adapter = { available: false, error: error.name }; }
    return {
      chrome: navigator.userAgent.match(/Chrome\/[\d.]+/)?.[0], devicePixelRatio, sourceScheme: new URL(v.currentSrc).protocol, crossOrigin: v.crossOrigin,
      hlsJs: typeof window.Hls === "function", requestVideoFrameCallback: typeof v.requestVideoFrameCallback === "function",
      pictureInPictureEnabled: document.pictureInPictureEnabled, documentPictureInPicture: "documentPictureInPicture" in window, webgpu: adapter
    };
  });
  await detail("native");
  result.steps.native = await video.evaluate(v => { const r = v.getBoundingClientRect(); return { source: { width: v.videoWidth, height: v.videoHeight }, displayed: { cssWidth: Math.round(r.width), devicePixelWidth: Math.round(r.width * devicePixelRatio) } }; });
  await page.evaluate(prototype);
  await page.evaluate(() => window.__yifanUpscale.start({ width: 1920, maxHeight: 1080 }));
  // Same-frame comparison: pause, then screenshot the identical frame natively and upscaled.
  await video.evaluate(v => { v.currentTime = Number(new URLSearchParams(location.search).get("t")) || 12; });
  await page.waitForFunction(() => { const v = document.querySelector("#video_player"); return v.readyState >= 2 && !v.seeking; }, null, { timeout: 15000 }).catch(() => {});
  await wait(1500);
  await video.evaluate(v => v.pause());
  await wait(500);
  const compare = async (name, width, maxHeight) => {
    await page.evaluate(() => window.__yifanUpscale.show(false));
    await wait(300);
    await detail(`${name}-native`);
    await page.evaluate(([width, maxHeight]) => { window.__yifanUpscale.setResolution(width, maxHeight); window.__yifanUpscale.render(); window.__yifanUpscale.show(true); }, [width, maxHeight]);
    await wait(300);
    await detail(`${name}-fsr`);
  };
  await compare("paused-1080p", 1920, 1080);
  await compare("paused-2k", 2560, 1440);
  await video.evaluate(v => v.play());
  await page.evaluate(() => { window.__yifanUpscale.setResolution(1920, 1080); });
  await wait(1000);
  await page.evaluate(() => window.__yifanUpscale.resetStats());
  await wait(6000);
  result.steps.fsr1080 = await page.evaluate(() => window.__yifanUpscale.stats());
  await detail("1080p");
  await page.evaluate(() => window.__yifanUpscale.setResolution(2560, 1440));
  await wait(6000);
  result.steps.fsr2k = await page.evaluate(() => window.__yifanUpscale.stats());
  await detail("2k");
  // Full screen through the site's own control, so the overlay must follow the player element.
  await page.locator("vg-player#main-player").hover();
  await page.locator("vg-fullscreen").click({ force: true });
  await wait(1500);
  result.steps.fullscreen = await page.evaluate(() => {
    const canvas = document.querySelector("#yifan-upscale-canvas");
    const r = canvas.getBoundingClientRect();
    return { fullscreenElement: document.fullscreenElement ? document.fullscreenElement.tagName.toLowerCase() + (document.fullscreenElement.id ? "#" + document.fullscreenElement.id : "") : null,
      canvasInsideFullscreen: !!document.fullscreenElement?.contains(canvas), canvasCss: { width: Math.round(r.width), height: Math.round(r.height) },
      window: { width: innerWidth, height: innerHeight }, stats: window.__yifanUpscale.stats() };
  });
  await page.mouse.move(5, 5);
  await page.screenshot({ path: "artifacts/upscale-fullscreen.png" });
  await page.keyboard.press("Escape");
  await page.evaluate(() => document.fullscreenElement && document.exitFullscreen()).catch(() => {});
  await wait(800);
  // Both PiP APIs require a user gesture: route them through a real click on an injected button.
  const gesture = async (name, action) => {
    await page.evaluate(([name, action]) => {
      const button = document.createElement("button");
      button.id = `upscale-${name}`;
      button.style.cssText = "position:fixed;left:8px;top:8px;z-index:2147483647;";
      button.textContent = name;
      button.addEventListener("click", () => { window[`__${name}Result`] = (async () => { try { return { ok: true, ...(await eval(action)) }; } catch (error) { return { ok: false, error: `${error.name}: ${error.message}` }; } })(); });
      document.body.append(button);
    }, [name, action]);
    await page.locator(`#upscale-${name}`).click();
    const value = await page.evaluate(name => window[`__${name}Result`], name);
    await page.evaluate(name => document.getElementById(`upscale-${name}`)?.remove(), name);
    return value;
  };
  result.steps.pictureInPicture = await gesture("pip", "window.__yifanUpscale.pip()");
  if (result.steps.pictureInPicture.ok) {
    await wait(2500);
    result.steps.pictureInPicture.afterSeconds = await page.evaluate(() => ({ active: !!document.pictureInPictureElement, pipVideo: (v => ({ width: v.videoWidth, height: v.videoHeight, readyState: v.readyState }))(window.__yifanUpscale.pipVideo), stats: window.__yifanUpscale.stats() }));
    await page.evaluate(() => window.__yifanUpscale.exitPip());
  }
  result.steps.documentPictureInPicture = await gesture("docpip", "window.__yifanUpscale.documentPip()");
  await wait(1500);
  result.steps.afterInteractions = await page.evaluate(() => window.__yifanUpscale.stats());
  result.steps.afterInteractions.playback = await video.evaluate(v => ({ paused: v.paused, readyState: v.readyState, error: v.error?.code || null, currentTime: Math.round(v.currentTime) }));
  result.errors = errors;
  console.log(JSON.stringify(result, null, 2));
  await writeFile(`artifacts/upscale${gpu ? "-gpu" : ""}${headed ? "-headed" : ""}.json`, JSON.stringify(result, null, 2) + "\n");
} finally {
  await context.close();
  await rm(profile, { recursive: true, force: true });
}
