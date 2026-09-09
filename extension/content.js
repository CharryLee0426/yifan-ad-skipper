(() => {
  "use strict";
  let enabled = true;
  let autoQuality = true;
  let upscale = "1080p";
  let pageStatus = null;
  let upscaleStatus = null;
  const UPSCALE_MODES = ["off", "1080p", "2k"];
  let configured = false;
  const style = document.createElement("style");
  style.id = "yifan-ad-skipper-style";
  // Verified ad-only components. Never hide the player, controls, or all iframes.
  const css = `
    .dabf, vg-pause-f, .vg-vvk-p { display: none !important; }
  `;
  function apply() {
    style.textContent = enabled ? css : "";
    if (!style.isConnected && document.documentElement) document.documentElement.append(style);
    window.postMessage({ source: "yifan-ad-skipper:content", type: "configure", enabled, autoQuality, upscale }, location.origin);
  }
  window.addEventListener("message", event => {
    if (event.source !== window || event.origin !== location.origin || event.data?.source !== "yifan-ad-skipper:page") return;
    const data = event.data;
    if (data.type === "upscale-status") {
      const size = value => value && typeof value === "object" && Number.isInteger(value.width) && Number.isInteger(value.height) && value.width >= 0 && value.height >= 0 && value.width <= 16384 && value.height <= 16384 ? { width: value.width, height: value.height } : null;
      upscaleStatus = {
        state: ["idle", "waiting", "active", "unsupported", "error"].includes(data.state) ? data.state : "idle",
        renderer: typeof data.renderer === "string" ? data.renderer.slice(0, 120) : "",
        source: size(data.input), output: size(data.output),
        fps: Number.isInteger(data.fps) && data.fps >= 0 && data.fps <= 1000 ? data.fps : 0,
        pip: data.pip === true,
        error: typeof data.error === "string" ? data.error.slice(0, 160) : ""
      };
      if (configured && data.mode !== upscale) apply();
      return;
    }
    if (data.type !== "status") return;
    pageStatus = {
      adapters: Array.isArray(data.adapters) ? data.adapters.filter(value => typeof value === "string").slice(0, 10) : [],
      ...Object.fromEntries(["videoAds", "scheduledAds", "pauseAds", "promotionalComments", "errors"].map(key => [key, Number.isSafeInteger(data[key]) && data[key] >= 0 ? data[key] : 0]))
    };
    if (data.quality && typeof data.quality === "object") {
      pageStatus.quality = {
        ...Object.fromEntries(["selected", "available", "listed"].map(key => [key, Number.isInteger(data.quality[key]) && data.quality[key] >= 0 && data.quality[key] <= 16384 ? data.quality[key] : 0])),
        manual: data.quality.manual === true,
        supported: data.quality.supported === true
      };
    }
    if (configured && (data.enabled !== enabled || data.autoQuality !== autoQuality)) apply();
  });
  chrome.storage.local.get({ enabled: true, autoQuality: true, upscale: "1080p" }).then(settings => {
    enabled = settings.enabled !== false;
    autoQuality = settings.autoQuality !== false;
    upscale = UPSCALE_MODES.includes(settings.upscale) ? settings.upscale : "1080p";
    configured = true;
    apply();
  });
  document.addEventListener("DOMContentLoaded", () => { if (configured) apply(); }, { once: true });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && (changes.enabled || changes.autoQuality || changes.upscale)) {
      if (changes.enabled) enabled = changes.enabled.newValue !== false;
      if (changes.autoQuality) autoQuality = changes.autoQuality.newValue !== false;
      if (changes.upscale) upscale = UPSCALE_MODES.includes(changes.upscale.newValue) ? changes.upscale.newValue : "1080p";
      configured = true;
      apply();
    }
  });
  chrome.runtime.onMessage.addListener((message, _sender, respond) => {
    if (message?.type === "get-page-status") {
      respond({ enabled, autoQuality, upscale, upscaleStatus, playerPresent: !!document.querySelector("aa-videoplayer, vg-player"), ...pageStatus });
    }
  });
})();
