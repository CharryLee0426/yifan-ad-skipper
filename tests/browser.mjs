import assert from "node:assert/strict";
import { chromium } from "playwright";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const profile = await mkdtemp(path.join(tmpdir(), "yifan-browser-test-"));
const extension = path.resolve("extension");
const context = await chromium.launchPersistentContext(profile, {
  channel: "chromium", headless: true,
  args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`]
});
const fixture = `
window.webpackJsonp = window.webpackJsonp || [];
const registry = {}, cache = {};
const previous = window.webpackJsonp.push.bind(window.webpackJsonp);
window.webpackJsonp.push = function(chunk) { Object.assign(registry, chunk[1]); previous(chunk); };
function requireModule(id) {
  if (!cache[id]) { cache[id] = {exports:{}}; registry[id](cache[id], cache[id].exports, requireModule); }
  return cache[id].exports;
}
webpackJsonp.push([[1], {
  angular(module, exports) {
    function defineComponent(t) { return { type: t.type, providersResolver:null, ngContentSelectors:t.ngContentSelectors, directiveDefs:null }; }
    Object.defineProperty(exports, 'minified', {enumerable:true, get:() => defineComponent});
  },
  player(module, exports, require) {
    class PrivateController {
      invokePlayVideo(data) { this.data = data; }
      converHtml5ToMedia2() {}
      assingPendding() {}
    }
    require('angular').minified({type: PrivateController});
    window.controller = new PrivateController();
    class PrivateQualitySelector {
      constructor() { this.isLive = false; this.isLine = false; this.calls = []; }
      getAutoLevelName() {}
      checkForSameBitrate() {}
      ngOnChanges() {}
      ngOnInit() {}
      ngOnDestroy() {}
      selectBitrate(option) { this.bitrateSelected = option; this.calls.push(option.bitrate); }
    }
    require('angular').minified({type: PrivateQualitySelector});
    window.runQuality = () => {
      const selector = window.qualitySelector = new PrivateQualitySelector();
      selector.bitrates = [576, 1080, 2160].map(bitrate => ({
        key: 'quality-' + bitrate, bitrate, isVIP: bitrate === 2160,
        isBought: false, isEnabled: bitrate !== 2160,
        path: bitrate === 2160 ? null : {result:'feature.m3u8', isLive:false, link:''}
      }));
      selector.bitrateSelected = selector.bitrates[0];
      selector.ngOnChanges({bitrates:{}});
      selector.ngOnInit();
    };
    class Player {
      onPlayNextVideo() {}
      triggerCounter() {}
      invokePauseList(list) { this.pauseList = list; }
      invokeInterstitial(list) { this.interstitials = list; }
    }
    module.exports = {Player};
  }
}]);
window.Player = requireModule('player').Player;
window.runPlayback = () => {
  const data = {clarity:[{needBuy:true}], needLogin:true, startSecond:120,
    flvPathList:[{link:'https://ad.example', result:'ad.mp4'}, {link:'', result:'feature.m3u8'}],
    startData:[{}], pauseData:[{}], barrageData:[{}]};
  controller.invokePlayVideo(data);
  const p = new Player(); p.invokePauseList([{}]); p.invokeInterstitial([{src:'ad.mp4'}]);
  return {data:controller.data, pause:p.pauseList, interstitials:p.interstitials};
};
`;
try {
  await context.route("https://www.yifan.tv/__extension_test__", route => route.fulfill({
    contentType: "text/html",
    headers: { "content-security-policy": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'" },
    body: `<!doctype html><html><body><h1>Player fixture</h1><aa-videoplayer><vg-player><video></video><button id="control">Play</button><vg-pause-f>Pause advertisement</vg-pause-f></vg-player></aa-videoplayer><div class="dabf">Banner advertisement</div><div id="ordinary">Normal content</div><script src="/fixture.js"></script></body></html>`
  }));
  await context.route("https://www.yifan.tv/fixture.js", route => route.fulfill({ contentType: "text/javascript", body: fixture }));
  const worker = context.serviceWorkers()[0] || await context.waitForEvent("serviceworker");
  const extensionId = new URL(worker.url()).hostname;
  const errors = [];
  const page = await context.newPage();
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("https://www.yifan.tv/__extension_test__");
  await page.waitForFunction(() => window.runPlayback && document.querySelector("#yifan-ad-skipper-style")?.textContent.includes("display"));
  let result = await page.evaluate(() => runPlayback());
  assert.equal(result.data.flvPathList.length, 1);
  assert.equal(result.data.flvPathList[0].result, "feature.m3u8");
  assert.equal(result.data.startData.length, 0);
  assert.equal(result.data.needLogin, true);
  assert.equal(result.data.clarity[0].needBuy, true);
  assert.equal(result.data.startSecond, 120);
  assert.equal(result.pause.length, 0);
  assert.equal(result.interstitials, undefined);
  assert.equal(await page.locator(".dabf").isVisible(), false);
  assert.equal(await page.locator("vg-pause-f").isVisible(), false);
  assert.equal(await page.locator("#control").isVisible(), true);
  assert.equal(await page.locator("#ordinary").isVisible(), true);
  console.log("PASS: main-world hooks reach private Angular components under CSP; overlays hide and content survives");
  await page.evaluate(() => runQuality());
  await page.waitForFunction(() => qualitySelector.bitrateSelected.bitrate === 1080);
  assert.deepEqual(await page.evaluate(() => qualitySelector.calls), [1080]);

  const matches = await worker.evaluate(async () => {
    const check = initiator => chrome.declarativeNetRequest.testMatchOutcome({
      url: "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js",
      type: "script", initiator
    });
    return { yifan: await check("https://www.yifan.tv"), unrelated: await check("https://example.com") };
  });
  assert.equal(matches.yifan.matchedRules.length, 1);
  assert.equal(matches.unrelated.matchedRules.length, 0);
  console.log("PASS: Chromium validates the actual DNR rules and limits blocking to yifan.tv");

  const popup = await context.newPage();
  popup.on("pageerror", error => errors.push(error.message));
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  // Extension pages can be opened as tabs for testing; focus the video tab before
  // reloading the popup so tabs.query sees the same tab an actual action popup sees.
  await page.bringToFront();
  await popup.reload();
  await popup.waitForFunction(() => !document.querySelector("#enabled").disabled);
  assert.equal(await popup.locator("#enabled").isChecked(), true);
  assert.equal(await popup.locator("#auto-quality").isChecked(), true);
  assert.match(await popup.locator("#quality-status").textContent(), /Selected: 1080P.*Highest available: 1080P/);
  await popup.waitForFunction(() => document.querySelector("#status").textContent.includes("connected"));
  await mkdir("artifacts", { recursive: true });
  await popup.locator("body").screenshot({ path: "artifacts/popup.png", animations: "disabled" });
  await popup.locator("#auto-quality").uncheck();
  await popup.waitForFunction(() => !document.querySelector("#auto-quality").disabled);
  assert.equal(await worker.evaluate(async () => (await chrome.storage.local.get("autoQuality")).autoQuality), false);
  assert.deepEqual(await worker.evaluate(() => chrome.declarativeNetRequest.getEnabledRulesets()), ["ads"]);
  await page.reload();
  await page.waitForFunction(() => window.runQuality && document.querySelector("#yifan-ad-skipper-style")?.textContent.includes("display"));
  await page.evaluate(() => runQuality());
  assert.deepEqual(await page.evaluate(() => qualitySelector.calls), []);
  assert.equal(await page.evaluate(() => qualitySelector.bitrateSelected.bitrate), 576);
  await popup.locator("#auto-quality").check();
  await popup.waitForFunction(() => !document.querySelector("#auto-quality").disabled);
  await page.waitForFunction(() => qualitySelector.bitrateSelected.bitrate === 1080);
  await page.evaluate(() => { qualitySelector.selectBitrate(qualitySelector.bitrates[0]); qualitySelector.ngOnChanges({bitrateSelected:{}}); });
  assert.equal(await page.evaluate(() => qualitySelector.bitrateSelected.bitrate), 576);
  console.log("PASS: quality hooks connect under CSP; popup shows resolution; quality switch persists independently and manual choices survive");
  await popup.locator("#enabled").uncheck();
  await popup.waitForFunction(() => !document.querySelector("#enabled").disabled);
  await page.waitForFunction(() => document.querySelector("#yifan-ad-skipper-style")?.textContent === "");
  result = await page.evaluate(() => runPlayback());
  assert.equal(result.data.flvPathList.length, 2);
  assert.equal(result.pause.length, 1);
  assert.equal(result.interstitials.length, 1);
  assert.equal(await page.locator(".dabf").isVisible(), true);
  assert.deepEqual(await worker.evaluate(() => chrome.declarativeNetRequest.getEnabledRulesets()), []);
  await page.reload();
  await page.waitForFunction(() => window.runPlayback && document.querySelector("#yifan-ad-skipper-style"));
  assert.equal((await page.evaluate(() => runPlayback())).data.flvPathList.length, 2);
  console.log("PASS: popup switch disables filters, CSS and DNR; off persists across page reload");

  await popup.locator("#enabled").check();
  await popup.waitForFunction(() => !document.querySelector("#enabled").disabled);
  await page.reload();
  await page.waitForFunction(() => window.runPlayback && document.querySelector("#yifan-ad-skipper-style")?.textContent.includes("display"));
  assert.equal((await page.evaluate(() => runPlayback())).data.flvPathList.length, 1);
  assert.deepEqual(await worker.evaluate(() => chrome.declarativeNetRequest.getEnabledRulesets()), ["ads"]);
  assert.deepEqual(errors, []);
  await writeFile("artifacts/browser-tests.json", JSON.stringify({ passed: true, checkedAt: new Date().toISOString(), errors }, null, 2) + "\n");
  console.log("PASS: protection re-enables after reload, with no page or popup JavaScript errors");
} finally {
  await context.close();
  await rm(profile, { recursive: true, force: true });
}
