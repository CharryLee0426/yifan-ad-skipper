import { chromium } from "playwright";
import { mkdir, mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

// Measures the shipped GPU upscaler on the live guest stream: output size,
// frame rate, full screen, and picture-in-picture. Public page, disposable
// signed-out profile. Records only dimensions, timings, API outcomes, and
// screenshots; never stream URLs, cookies, or response bodies.
const url = process.env.YIFAN_TEST_URL || "https://www.yifan.tv/play/X4r3180qOd2";
const headed = process.argv.includes("--headed");
const extension = path.resolve("extension");
const profile = await mkdtemp(path.join(tmpdir(), "yifan-upscale-"));
await mkdir("artifacts", { recursive: true });
const context = await chromium.launchPersistentContext(profile, {
  channel: "chromium", headless: !headed, viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2,
  args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`, "--autoplay-policy=no-user-gesture-required"]
});
const result = { checkedAt: new Date().toISOString(), url, headed, steps: {} };
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
try {
  const worker = context.serviceWorkers()[0] || await context.waitForEvent("serviceworker");
  const setMode = mode => worker.evaluate(mode => chrome.storage.local.set({ upscale: mode }), mode);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message.slice(0, 160)));
  await page.addInitScript(() => {
    // Research only: keep the last status the extension reports to its content script.
    window.addEventListener("message", event => {
      if (event.source === window && event.data?.source === "yifan-ad-skipper:page" && event.data.type === "upscale-status") window.__upscaleStatus = event.data;
    });
  });
  const status = () => page.evaluate(() => window.__upscaleStatus || null);
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
  const video = page.locator("#video_player");
  await video.waitFor({ timeout: 30000 });
  if (await video.evaluate(element => element.paused)) await page.locator("#play-pause-button").click({ force: true });
  await page.waitForFunction(() => window.__upscaleStatus?.state === "active", null, { timeout: 30000 });
  result.steps.environment = await page.evaluate(() => {
    const v = document.querySelector("#video_player");
    return { chrome: navigator.userAgent.match(/Chrome\/[\d.]+/)?.[0], devicePixelRatio, sourceScheme: new URL(v.currentSrc).protocol, crossOrigin: v.crossOrigin, hlsJs: typeof window.Hls === "function" };
  });
  const playerBox = () => page.locator("vg-player#main-player").boundingBox();
  const shots = async name => {
    const box = await playerBox();
    const clip = { x: box.x + box.width * 0.35, y: box.y + box.height * 0.3, width: box.width * 0.3, height: box.height * 0.3 };
    await page.mouse.move(5, 5);
    await page.screenshot({ path: `artifacts/upscale-${name}.png`, clip: box });
    await page.screenshot({ path: `artifacts/upscale-${name}-detail.png`, clip });
  };
  // Same-frame comparison: pause, then capture the identical frame natively and upscaled.
  await video.evaluate(v => { v.currentTime = Number(new URLSearchParams(location.search).get("t")) || 12; });
  await page.waitForFunction(() => { const v = document.querySelector("#video_player"); return v.readyState >= 2 && !v.seeking; }, null, { timeout: 15000 }).catch(() => {});
  await wait(1500);
  await video.evaluate(v => v.pause());
  await wait(500);
  const compare = async (name, mode, width) => {
    await page.evaluate(() => { document.querySelector("#yifan-upscale-canvas").style.display = "none"; });
    await wait(300);
    await shots(`${name}-native`);
    await setMode(mode);
    await page.waitForFunction(width => document.querySelector("#yifan-upscale-canvas")?.width === width, width);
    await page.evaluate(() => { document.querySelector("#yifan-upscale-canvas").style.display = ""; });
    await wait(300);
    await shots(`${name}-fsr`);
  };
  await compare("paused-1080p", "1080p", 1920);
  await compare("paused-2k", "2k", 2560);
  await video.evaluate(v => v.play());
  const measure = async (name, mode, width) => {
    await setMode(mode);
    await page.waitForFunction(width => document.querySelector("#yifan-upscale-canvas")?.width === width, width);
    await wait(6000);
    const s = await status();
    const quality = await video.evaluate(v => ({ dropped: v.getVideoPlaybackQuality().droppedVideoFrames, total: v.getVideoPlaybackQuality().totalVideoFrames }));
    result.steps[name] = { state: s.state, renderer: s.renderer, source: s.input, output: s.output, fps: s.fps, ...quality };
    await shots(name);
  };
  await measure("fsr1080", "1080p", 1920);
  await measure("fsr2k", "2k", 2560);
  // Full screen through the site's own control.
  await page.locator("vg-player#main-player").hover();
  await page.locator("vg-fullscreen").click({ force: true });
  await wait(2500);
  result.steps.fullscreen = await page.evaluate(() => {
    const canvas = document.querySelector("#yifan-upscale-canvas");
    const r = canvas.getBoundingClientRect();
    return { fullscreenElement: document.fullscreenElement ? document.fullscreenElement.tagName.toLowerCase() + "#" + document.fullscreenElement.id : null,
      canvasInsideFullscreen: !!document.fullscreenElement?.contains(canvas), canvasCss: { width: Math.round(r.width), height: Math.round(r.height) }, window: { width: innerWidth, height: innerHeight }, status: window.__upscaleStatus };
  });
  await page.mouse.move(5, 5);
  await page.screenshot({ path: "artifacts/upscale-fullscreen.png" });
  await page.evaluate(() => document.fullscreenElement && document.exitFullscreen()).catch(() => {});
  await wait(800);
  // Picture-in-picture through the extension's own button (a real click supplies
  // the user gesture). The button follows the site's controls, so reveal them first.
  const clickPip = async () => {
    const box = await playerBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.move(box.x + box.width / 2 + 20, box.y + box.height / 2 + 10);
    await page.waitForSelector("vg-player#main-player:not(.controls-hidden)", { timeout: 5000 });
    await page.screenshot({ path: "artifacts/upscale-controls.png", clip: box });
    await page.locator(".yifan-upscale-pip").click({ timeout: 5000 });
  };
  await clickPip();
  await wait(2500);
  result.steps.pictureInPicture = await page.evaluate(() => {
    const pip = document.pictureInPictureElement;
    return { active: !!pip, upscaledElement: pip?.classList.contains("yifan-upscale-pip-video") || false, frame: pip ? { width: pip.videoWidth, height: pip.videoHeight } : null, status: window.__upscaleStatus };
  });
  await clickPip();
  await wait(1000);
  result.steps.afterPip = { pipActive: await page.evaluate(() => !!document.pictureInPictureElement), status: await status(),
    playback: await video.evaluate(v => ({ paused: v.paused, readyState: v.readyState, error: v.error?.code || null, currentTime: Math.round(v.currentTime) })) };
  result.errors = errors;
  console.log(JSON.stringify(result, null, 2));
  await writeFile(`artifacts/upscale${headed ? "-headed" : ""}.json`, JSON.stringify(result, null, 2) + "\n");
} finally {
  await context.close();
  await rm(profile, { recursive: true, force: true });
}
