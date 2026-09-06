/* Runs in the page's world before its Webpack runtime. No remote code or eval. */
(() => {
  "use strict";
  const marker = Symbol.for("yifan-ad-skipper.installed");
  if (window[marker]) return;
  window[marker] = true;

  // Wait for the isolated script to read the saved preference. Hooks are installed
  // immediately, but remain pass-through until configuration arrives.
  let enabled = false;
  const stats = { adapters: [], videoAds: 0, scheduledAds: 0, pauseAds: 0, promotionalComments: 0, errors: 0 };
  const wrapped = new WeakSet();
  const inspected = new WeakSet();
  const definitionHooks = new WeakMap();
  const queues = new WeakSet();
  let reportPending = false;

  function report() {
    if (reportPending) return;
    reportPending = true;
    queueMicrotask(() => {
      reportPending = false;
      window.postMessage({ source: "yifan-ad-skipper:page", type: "status", enabled, ...stats }, location.origin);
    });
  }
  function count(key, value) {
    if (value > 0) { stats[key] += value; report(); }
  }
  function adapter(name) {
    if (!stats.adapters.includes(name)) { stats.adapters.push(name); report(); }
  }
  function withoutAds(list, key, predicate) {
    if (!Array.isArray(list)) return list;
    const result = list.filter(item => !predicate(item));
    count(key, list.length - result.length);
    return result.length === list.length ? list : result;
  }
  function clearList(list, key) {
    if (!Array.isArray(list)) return list;
    count(key, list.length);
    return [];
  }
  function cleanPlayData(data) {
    if (!data || !Array.isArray(data.flvPathList) || !Array.isArray(data.clarity)) return data;
    return {
      ...data,
      startData: clearList(data.startData, "videoAds"),
      pauseData: clearList(data.pauseData, "pauseAds"),
      barrageData: clearList(data.barrageData, "promotionalComments"),
      // The site's converter explicitly identifies these entries by `link`.
      flvPathList: withoutAds(data.flvPathList, "videoAds", item => !!item?.link)
    };
  }
  function wrap(proto, name, transform, skip) {
    const descriptor = Object.getOwnPropertyDescriptor(proto, name);
    if (!descriptor || typeof descriptor.value !== "function" || wrapped.has(descriptor.value)) return;
    const original = descriptor.value;
    const replacement = function (...args) {
      if (enabled) {
        if (skip) return skip.call(this, args);
        args = transform.call(this, args);
      }
      return Reflect.apply(original, this, args);
    };
    wrapped.add(replacement);
    Object.defineProperty(proto, name, { ...descriptor, value: replacement });
  }

  function inspectPrototype(proto) {
    if (!proto || proto === Object.prototype || inspected.has(proto)) return;
    inspected.add(proto);
    const has = (...names) => names.every(name => typeof Object.getOwnPropertyDescriptor(proto, name)?.value === "function");
    if (has("invokePlayVideo", "converHtml5ToMedia2", "assingPendding")) {
      adapter("playback-data");
      wrap(proto, "invokePlayVideo", ([data, ...rest]) => [cleanPlayData(data), ...rest]);
      wrap(proto, "reloadPause", ([data, ...rest]) => [data ? { ...data, pauseData: clearList(data.pauseData, "pauseAds") } : data, ...rest]);
    }
    if (has("playVideo", "mutipleVideoHandler", "intersitialHandler")) {
      adapter("video-playlist");
      wrap(proto, "playVideo", null, function ([list, isAd = false, ...rest]) {
        if (isAd) { count("videoAds", Array.isArray(list) ? list.length : 1); return; }
        const clean = withoutAds(list, "videoAds", item => item?.isAd === true);
        return Reflect.apply(originalPlay.get(proto), this, [clean, false, ...rest]);
      });
    }
    if (has("startCountDown", "startLoadCounter", "needToShow", "invokeList")) {
      adapter("ad-scheduler");
      // Skipping registration prevents preroll and midroll timers from starting.
      wrap(proto, "invokeList", null, ([list]) => { count("scheduledAds", Array.isArray(list) ? list.filter(item => item?.src).length : 0); });
      wrap(proto, "needToShow", null, () => {});
      wrap(proto, "startPlay", null, () => {});
    }
    if (has("onPlayNextVideo", "triggerCounter", "invokePauseList", "invokeInterstitial")) {
      adapter("player-overlays");
      wrap(proto, "invokePauseList", ([list, ...rest]) => [clearList(list, "pauseAds"), ...rest]);
      // Do not start the player's ad lifecycle for empty placeholder ad lists.
      wrap(proto, "invokeInterstitial", null, ([list]) => { count("scheduledAds", Array.isArray(list) ? list.filter(item => item?.src).length : 0); });
    }
    if (has("onCueChange", "getOCreateBullet")) {
      adapter("promotional-comments");
      wrap(proto, "onCueChange", ([list, ...rest]) => [withoutAds(list, "promotionalComments", item => item?.isAds === true), ...rest]);
    }
  }
  const originalPlay = new WeakMap();
  function inspect(value) {
    if (typeof value !== "function" || !value.prototype) return;
    for (let proto = value.prototype; proto && proto !== Object.prototype; proto = Object.getPrototypeOf(proto)) {
      if (!originalPlay.has(proto) && typeof Object.getOwnPropertyDescriptor(proto, "playVideo")?.value === "function") {
        originalPlay.set(proto, proto.playVideo);
      }
      inspectPrototype(proto);
    }
  }
  function inspectExports(exports) {
    inspect(exports);
    if (!exports || (typeof exports !== "object" && typeof exports !== "function")) return;
    for (const key of Object.keys(exports)) {
      // Webpack exports are getters. A circular import can still be uninitialized.
      try { inspect(exports[key]); } catch { /* Leave unknown exports untouched. */ }
    }
  }
  function hookComponentDefinitions(module) {
    const exports = module?.exports;
    if (!exports || typeof exports !== "object") return;
    const overrides = new Map();
    for (const key of Object.keys(exports)) {
      let value;
      try { value = exports[key]; } catch { continue; }
      if (typeof value !== "function") continue;
      // Angular's defineComponent is minified, but these metadata property names
      // survive. Some player classes are private to their Webpack module and can
      // only be observed when Angular registers the component definition.
      const source = Function.prototype.toString.call(value);
      if (!source.includes("ngContentSelectors:") || !source.includes("directiveDefs:null") || !source.includes("providersResolver:null")) continue;
      if (!definitionHooks.has(value)) {
        definitionHooks.set(value, function (...args) {
          try { inspect(args[0]?.type); } catch { stats.errors += 1; report(); }
          return Reflect.apply(value, this, args);
        });
      }
      overrides.set(key, definitionHooks.get(value));
    }
    if (overrides.size) {
      // Export getters are non-configurable. Replacing the module's export object
      // with a proxy preserves live bindings without redefining those getters.
      module.exports = new Proxy(exports, {
        get(target, key, receiver) { return overrides.has(key) ? overrides.get(key) : Reflect.get(target, key, receiver); }
      });
    }
  }
  function prepareChunk(chunk) {
    const modules = Array.isArray(chunk) && chunk[1];
    if (!modules || typeof modules !== "object") return;
    for (const key of Object.keys(modules)) {
      const factory = modules[key];
      if (typeof factory !== "function" || wrapped.has(factory)) continue;
      const replacement = function (...args) {
        const result = Reflect.apply(factory, this, args);
        try { hookComponentDefinitions(args[0]); inspectExports(args[0]?.exports); }
        catch { stats.errors += 1; report(); }
        return result;
      };
      wrapped.add(replacement);
      modules[key] = replacement;
    }
  }
  function watchQueue(queue) {
    if (!Array.isArray(queue) || queues.has(queue)) return queue;
    queues.add(queue);
    queue.forEach(prepareChunk);
    // The runtime replaces push and retains a bound copy of its predecessor.
    // Preserve that chain; wrapping each factory only once prevents recursion.
    let currentPush;
    const setPush = original => {
      currentPush = function (...chunks) {
        chunks.forEach(prepareChunk);
        return Reflect.apply(original, this, chunks);
      };
    };
    setPush(queue.push);
    Object.defineProperty(queue, "push", { configurable: true, get: () => currentPush, set: setPush });
    return queue;
  }
  const descriptor = Object.getOwnPropertyDescriptor(window, "webpackJsonp");
  if (!descriptor || descriptor.configurable) {
    let queue = watchQueue(window.webpackJsonp || []);
    Object.defineProperty(window, "webpackJsonp", {
      configurable: true, enumerable: true,
      get: () => queue,
      set: value => { queue = watchQueue(value); }
    });
  } else {
    watchQueue(window.webpackJsonp);
  }

  window.addEventListener("message", event => {
    if (event.source !== window || event.origin !== location.origin || event.data?.source !== "yifan-ad-skipper:content") return;
    if (event.data.type === "configure" && typeof event.data.enabled === "boolean") enabled = event.data.enabled;
    report();
  });
  report();
})();
