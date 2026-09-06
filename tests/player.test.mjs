import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../extension/page.js", import.meta.url), "utf8");
function harness({ active = true, autoQuality = true, deferred = false } = {}) {
  const listeners = [];
  const statuses = [];
  const window = { addEventListener: (_, fn) => listeners.push(fn), postMessage: data => statuses.push(data) };
  const tasks = [];
  const flush = () => { for (let i = 0; tasks.length; i++) { assert.ok(i < 100, "microtasks must settle"); tasks.shift()(); } };
  const context = vm.createContext({ window, location: { origin: "https://www.yifan.tv" }, queueMicrotask: fn => deferred ? tasks.push(fn) : fn() });
  vm.runInContext(source, context);
  const configure = (enabled, quality = autoQuality) => listeners.forEach(fn => fn({ source: window, origin: "https://www.yifan.tv", data: { source: "yifan-ad-skipper:content", type: "configure", enabled, autoQuality: quality } }));
  configure(active, autoQuality);
  const modules = {};
  const cache = {};
  // Webpack 4's previous-push chain is important: a naive interceptor recurses.
  const previousPush = window.webpackJsonp.push.bind(window.webpackJsonp);
  window.webpackJsonp.push = function (chunk) {
    Object.assign(modules, chunk[1]);
    previousPush(chunk);
    return 17;
  };
  function load(definitions) {
    window.webpackJsonp.push([[4], definitions]);
    const require = key => {
      if (!cache[key]) {
        const module = { exports: {} };
        cache[key] = module;
        modules[key](module, module.exports, require);
      }
      return cache[key].exports;
    };
    return require;
  }
  return { window, context, statuses, configure, load, flush };
}

function playbackFactory(module) {
  class Controller {
    invokePlayVideo(data) { this.received = data; return "original-result"; }
    converHtml5ToMedia2() {}
    assingPendding() {}
    reloadPause(data) { this.pauseData = data; }
  }
  module.exports = { Controller };
}

test("filters explicit ad data while preserving content, auth, subtitles and resume time", () => {
  const h = harness();
  const { Controller } = h.load({ playback: playbackFactory })("playback");
  const controller = new Controller();
  const content = { result: "https://media.example/feature.m3u8", link: "", isLive: false };
  const input = {
    clarity: [{ needBuy: true, bitrate: 1080 }], needLogin: true, startSecond: 732,
    tracks: [{ language: "zh" }], flvPathList: [{ link: "https://ads.example/", result: "ad.mp4" }, content],
    startData: [{}], pauseData: [{}], barrageData: [{}]
  };
  assert.equal(controller.invokePlayVideo(input), "original-result");
  assert.equal(controller.received.needLogin, true);
  assert.equal(controller.received.startSecond, 732);
  assert.equal(controller.received.clarity, input.clarity);
  assert.equal(controller.received.tracks, input.tracks);
  assert.deepEqual(Array.from(controller.received.flvPathList), [content]);
  assert.equal(controller.received.startData.length, 0);
  assert.equal(controller.received.pauseData.length, 0);
  assert.equal(controller.received.barrageData.length, 0);
  assert.equal(input.flvPathList.length, 2, "does not mutate the server response");
  assert.equal(h.statuses.at(-1).videoAds, 2);
});

test("off is pass-through, and unknown data shapes remain untouched", () => {
  const h = harness({ active: false });
  const { Controller } = h.load({ playback: playbackFactory })("playback");
  const instance = new Controller();
  const input = { clarity: [], flvPathList: [{ link: "ad" }] };
  instance.invokePlayVideo(input);
  assert.equal(instance.received, input);
  h.configure(true);
  const unknown = { startData: ["not a verified playback response"] };
  instance.invokePlayVideo(unknown);
  assert.equal(instance.received, unknown);
  h.configure(false);
  instance.invokePlayVideo(input);
  assert.equal(instance.received, input);
});

test("video playlist skips marked ads without seeking, muting, or discarding normal media", () => {
  const h = harness();
  const { API } = h.load({ api(module) {
    class API {
      playVideo(list, ad) { this.received = { list, ad }; return 42; }
      mutipleVideoHandler() {}
      intersitialHandler() {}
    }
    module.exports = { API };
  } })("api");
  const api = new API();
  const content = { isAd: false, src: "feature.mp4" };
  const unknown = { src: "another-feature.mp4" };
  assert.equal(api.playVideo([{ isAd: true, src: "ad.mp4" }, content, unknown]), 42);
  assert.deepEqual(Array.from(api.received.list), [content, unknown]);
  assert.equal(api.received.ad, false);
  const received = api.received;
  api.playVideo([{ src: "standalone-ad.mp4" }], true);
  assert.equal(api.received, received);
  h.configure(false);
  api.playVideo([{ isAd: true }], true);
  assert.equal(api.received.ad, true);
});

test("midroll scheduling is suppressed and original methods work again when disabled", () => {
  const h = harness();
  const { Scheduler } = h.load({ scheduler(module) {
    class Scheduler {
      invokeList(list) { this.registered = list; }
      startCountDown() {}
      startLoadCounter() {}
      needToShow() { this.triggered = true; }
      startPlay() { this.played = true; }
    }
    module.exports = { Scheduler };
  } })("scheduler");
  const scheduler = new Scheduler();
  scheduler.invokeList([{ src: "ad.mp4" }]);
  scheduler.needToShow(1800);
  scheduler.startPlay();
  assert.equal(scheduler.registered, undefined);
  assert.equal(scheduler.triggered, undefined);
  assert.equal(scheduler.played, undefined);
  h.configure(false);
  scheduler.needToShow(1800);
  assert.equal(scheduler.triggered, true);
});

test("pause overlays clear their lists and normal danmu comments survive", () => {
  const h = harness();
  const { Player, Bullets } = h.load({ components(module) {
    class Player {
      onPlayNextVideo() {}
      triggerCounter() {}
      invokePauseList(list) { this.pause = list; }
      invokeInterstitial(list) { this.scheduled = list; }
    }
    class Bullets {
      onCueChange(list, speed) { this.list = list; this.speed = speed; }
      getOCreateBullet() {}
    }
    module.exports = { Player, Bullets };
  } })("components");
  const player = new Player();
  player.invokePauseList([{}]);
  player.invokeInterstitial([{ src: "ad.mp4" }]);
  assert.equal(player.pause.length, 0);
  assert.equal(player.scheduled, undefined);
  const bullets = new Bullets();
  const comment = { text: "ordinary comment", isAds: false };
  bullets.onCueChange([{ isAds: true }, comment], 0.5);
  assert.deepEqual(Array.from(bullets.list), [comment]);
  assert.equal(bullets.speed, 0.5);
});

test("lazy chunks, inherited methods, export getters and queue replacement are supported", () => {
  const h = harness();
  const factory = module => {
    class Base {
      invokePlayVideo(data) { this.data = data; }
      converHtml5ToMedia2() {}
      assingPendding() {}
    }
    class Child extends Base {}
    Object.defineProperty(module.exports, "Child", { enumerable: true, get: () => Child });
  };
  const require = h.load({ later: factory });
  const { Child } = require("later");
  const instance = new Child();
  instance.invokePlayVideo({ clarity: [], flvPathList: [], startData: [{}] });
  assert.equal(instance.data.startData.length, 0);
  assert.equal(h.statuses.at(-1).videoAds, 1, "runtime push chain does not double-wrap");
  h.window.webpackJsonp = [];
  assert.equal(typeof h.window.webpackJsonp.push, "function");
  vm.runInContext(source, h.context);
  assert.equal(h.statuses.at(-1).videoAds, 1, "reinjection does not reset or duplicate hooks");
});

test("the interceptor preserves unrelated module behavior and thrown exceptions", () => {
  const h = harness();
  const require = h.load({ ordinary(module) { module.exports = { result: 123 }; }, broken() { throw new Error("site error"); } });
  assert.equal(require("ordinary").result, 123);
  assert.throws(() => require("broken"), /site error/);
});

function qualityFixture(settings) {
  const h = harness({ deferred: true, ...settings });
  const { Selector } = h.load({ quality(module) {
    class Selector {
      constructor() { this.calls = []; this.isLive = false; this.isLine = false; }
      getAutoLevelName() {}
      checkForSameBitrate() {}
      ngOnChanges() { return "changed"; }
      ngOnInit() {}
      ngOnDestroy() { this.destroyed = true; }
      selectBitrate(option) { this.calls.push(option); this.bitrateSelected = option; return 42; }
    }
    module.exports = { Selector };
  } })("quality");
  const selector = new Selector();
  const option = (height, overrides = {}) => ({ key: `video-${height}`, bitrate: height, isVIP: false, isBought: false,
    isEnabled: true, path: { result: "https://media.example/content.m3u8", isLive: false, link: "" }, ...overrides });
  selector.bitrates = [option(720), option(1080), option(576)];
  selector.bitrateSelected = selector.bitrates[2];
  return { h, selector, option };
}

test("quality selects the highest accessible stream once through the original selector", () => {
  const { h, selector } = qualityFixture({ active: false });
  const originalOptions = structuredClone(selector.bitrates);
  assert.equal(selector.ngOnChanges({ bitrates: {} }), "changed");
  selector.ngOnInit();
  assert.equal(selector.calls.length, 0, "selection waits until Angular lifecycle finishes");
  h.flush();
  assert.equal(selector.bitrateSelected.bitrate, 1080);
  assert.equal(selector.calls.length, 1, "quality works independently of ad protection");
  assert.deepEqual(selector.bitrates, originalOptions, "never rewrites paths or entitlement fields");
  selector.ngOnChanges({ bitrateSelected: {} });
  h.flush();
  assert.equal(selector.calls.length, 1);
  assert.equal(h.statuses.at(-1).quality.available, 1080);
});

test("guest quality excludes VIP, missing paths, disabled options, app-only and unknown fields", () => {
  const { h, selector, option } = qualityFixture();
  const free = option(576);
  selector.bitrates = [null, option(2160), option(1080, { isVIP: true, isBought: true }),
    option(1080, { path: null }), option(1080, { isEnabled: false }), option(1080, { isVIP: undefined }),
    option(1080, { needBuy: true }), option(1080, { needLogin: true }),
    option(1080, { path: { result: "ad.mp4", link: "https://ad.example" } }), free];
  selector.bitrateSelected = free;
  selector.ngOnInit(); h.flush();
  assert.equal(selector.calls.length, 0);
  assert.equal(h.statuses.at(-1).quality.available, 576);
  assert.equal(h.statuses.at(-1).quality.listed, 2160);
});

test("manual choices and recovery downgrades survive repeated updates; another episode selects afresh", () => {
  const { h, selector, option } = qualityFixture();
  selector.ngOnInit(); h.flush();
  assert.equal(selector.selectBitrate(selector.bitrates[2]), 42);
  selector.ngOnChanges({ bitrates: {} }); h.flush();
  assert.equal(selector.bitrateSelected.bitrate, 576);
  assert.equal(h.statuses.at(-1).quality.manual, true);
  selector.bitrates = [option(720, { key: "episode2-high" }), option(480, { key: "episode2-low" })];
  selector.bitrateSelected = selector.bitrates[1];
  selector.ngOnChanges({ bitrates: {} }); h.flush();
  assert.equal(selector.bitrateSelected.bitrate, 720);
  assert.equal(h.statuses.at(-1).quality.manual, false);
  // A direct player downgrade also must not cause an automatic retry loop.
  selector.bitrateSelected = selector.bitrates[1];
  selector.ngOnChanges({ bitrateSelected: {} }); h.flush();
  assert.equal(selector.bitrateSelected.bitrate, 480);
});

test("quality off, late configuration, and disabling before queued work are respected", () => {
  const { h, selector } = qualityFixture({ autoQuality: false });
  selector.ngOnInit(); h.flush();
  assert.equal(selector.calls.length, 0);
  h.configure(true, true);
  h.configure(true, false);
  h.flush();
  assert.equal(selector.calls.length, 0);
  h.configure(false, true); h.flush();
  assert.equal(selector.bitrateSelected.bitrate, 1080);
});

test("live, line-based, destroyed, and uninitialized selectors are left alone", () => {
  for (const field of ["isLive", "isLine"]) {
    const { h, selector } = qualityFixture();
    selector[field] = true; selector.ngOnInit(); h.flush();
    assert.equal(selector.calls.length, 0);
    assert.equal(h.statuses.at(-1).quality.supported, false);
  }
  const { h, selector } = qualityFixture();
  selector.ngOnInit(); selector.ngOnDestroy(); h.flush();
  assert.equal(selector.calls.length, 0);
  assert.equal(selector.destroyed, true);
  const other = qualityFixture();
  other.selector.bitrates = undefined;
  other.selector.bitrateSelected = undefined;
  other.selector.ngOnChanges({}); other.h.flush();
  assert.equal(other.selector.calls.length, 0);
});

test("a manual selection before queued initialization wins", () => {
  const { h, selector } = qualityFixture();
  selector.ngOnInit();
  selector.selectBitrate(selector.bitrates[0]); h.flush();
  assert.equal(selector.bitrateSelected.bitrate, 720);
  assert.equal(selector.calls.length, 1);
});

test("an episode's options arriving before its selected input do not consume the quality attempt", () => {
  const { h, selector, option } = qualityFixture();
  selector.bitrateSelected = option(1080, { key: "previous-episode" });
  selector.ngOnChanges({ bitrates: {} }); h.flush();
  assert.equal(selector.calls.length, 0);
  selector.bitrateSelected = selector.bitrates[2];
  selector.ngOnChanges({ bitrateSelected: {} }); h.flush();
  assert.equal(selector.bitrateSelected.bitrate, 1080);
  assert.equal(selector.calls.length, 1);
});
