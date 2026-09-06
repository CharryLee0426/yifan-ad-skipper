(() => {
  "use strict";
  let enabled = true;
  let autoQuality = true;
  let pageStatus = null;
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
    window.postMessage({ source: "yifan-ad-skipper:content", type: "configure", enabled, autoQuality }, location.origin);
  }
  window.addEventListener("message", event => {
    if (event.source !== window || event.origin !== location.origin || event.data?.source !== "yifan-ad-skipper:page" || event.data.type !== "status") return;
    const data = event.data;
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
  chrome.storage.local.get({ enabled: true, autoQuality: true }).then(settings => {
    enabled = settings.enabled !== false;
    autoQuality = settings.autoQuality !== false;
    configured = true;
    apply();
  });
  document.addEventListener("DOMContentLoaded", () => { if (configured) apply(); }, { once: true });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && (changes.enabled || changes.autoQuality)) {
      if (changes.enabled) enabled = changes.enabled.newValue !== false;
      if (changes.autoQuality) autoQuality = changes.autoQuality.newValue !== false;
      configured = true;
      apply();
    }
  });
  chrome.runtime.onMessage.addListener((message, _sender, respond) => {
    if (message?.type === "get-page-status") {
      respond({ enabled, autoQuality, playerPresent: !!document.querySelector("aa-videoplayer, vg-player"), ...pageStatus });
    }
  });
})();
