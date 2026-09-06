(() => {
  "use strict";
  let enabled = true;
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
    window.postMessage({ source: "yifan-ad-skipper:content", type: "configure", enabled }, location.origin);
  }
  window.addEventListener("message", event => {
    if (event.source !== window || event.origin !== location.origin || event.data?.source !== "yifan-ad-skipper:page" || event.data.type !== "status") return;
    const data = event.data;
    pageStatus = {
      adapters: Array.isArray(data.adapters) ? data.adapters.filter(value => typeof value === "string").slice(0, 10) : [],
      ...Object.fromEntries(["videoAds", "scheduledAds", "pauseAds", "promotionalComments", "errors"].map(key => [key, Number.isSafeInteger(data[key]) && data[key] >= 0 ? data[key] : 0]))
    };
    if (configured && data.enabled !== enabled) apply();
  });
  chrome.storage.local.get({ enabled: true }).then(settings => {
    enabled = settings.enabled !== false;
    configured = true;
    apply();
  });
  document.addEventListener("DOMContentLoaded", () => { if (configured) apply(); }, { once: true });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.enabled) {
      enabled = changes.enabled.newValue !== false;
      configured = true;
      apply();
    }
  });
  chrome.runtime.onMessage.addListener((message, _sender, respond) => {
    if (message?.type === "get-page-status") {
      respond({ enabled, playerPresent: !!document.querySelector("aa-videoplayer, vg-player"), ...pageStatus });
    }
  });
})();
