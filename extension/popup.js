"use strict";
const toggle = document.getElementById("enabled");
const qualityToggle = document.getElementById("auto-quality");
const qualityStatus = document.getElementById("quality-status");
const reload = document.getElementById("reload");
const status = document.getElementById("status");
let activeTab;
function showError(error) {
  const element = document.getElementById("error");
  element.textContent = error.message || String(error);
  element.hidden = false;
}
function renderSetting() {
  document.getElementById("setting-state").textContent = toggle.checked ? "On for yifan.tv" : "Off";
}
async function refreshStatus() {
  if (!activeTab) {
    status.textContent = "Open a yifan.tv video to see player protection.";
    qualityStatus.textContent = "Open a video to check available quality.";
    return;
  }
  try {
    const data = await chrome.tabs.sendMessage(activeTab.id, { type: "get-page-status" });
    const quality = data.quality;
    qualityStatus.textContent = !qualityToggle.checked ? "Automatic quality is off." : !quality ? "Waiting for the video quality selector." : !quality.supported ? "This live or line-based player uses the site's quality selection." :
      `Selected: ${quality.selected ? quality.selected + "P" : "unknown"}. Highest available: ${quality.available ? quality.available + "P" : "unknown"}.` +
      (quality.manual ? " Keeping your selection or the player's recovery choice." : "") +
      (quality.listed > quality.available ? " Higher options are restricted or unavailable in this web player." : "");
    for (const [id, key] of [["video-ads", "videoAds"], ["scheduled-ads", "scheduledAds"], ["pause-ads", "pauseAds"], ["comments", "promotionalComments"]]) {
      document.getElementById(id).textContent = data[key] ?? "—";
    }
    const connected = data.adapters?.includes("playback-data") && data.adapters?.includes("player-overlays");
    status.textContent = !toggle.checked ? "Protection is off. Reload to restore the original player." : data.errors ? "A player adapter encountered an error. Reload, or turn protection off if playback fails." : !data.playerPresent ? "Protection is on. Choose a video to activate the player filters." : connected ? "Player filters connected. Known ad overlays are hidden." : "Player filters are not connected yet. Reload; this player may need an extension update.";
  } catch {
    status.textContent = "Reload this page to connect the extension.";
    qualityStatus.textContent = "Reload to check video quality.";
  }
}
toggle.addEventListener("change", async () => {
  toggle.disabled = true;
  try {
    const response = await chrome.runtime.sendMessage({ type: "set-enabled", enabled: toggle.checked });
    if (!response?.ok) throw new Error(response?.error || "Could not save protection settings.");
    renderSetting();
    await refreshStatus();
  } catch (error) { toggle.checked = !toggle.checked; renderSetting(); showError(error); }
  finally { toggle.disabled = false; }
});
qualityToggle.addEventListener("change", async () => {
  qualityToggle.disabled = true;
  try {
    const response = await chrome.runtime.sendMessage({ type: "set-auto-quality", autoQuality: qualityToggle.checked });
    if (!response?.ok) throw new Error(response?.error || "Could not save quality settings.");
    await refreshStatus();
  } catch (error) { qualityToggle.checked = !qualityToggle.checked; showError(error); }
  finally { qualityToggle.disabled = false; }
});
reload.addEventListener("click", async () => {
  try { await chrome.tabs.reload(activeTab.id); window.close(); } catch (error) { showError(error); }
});
(async () => {
  const [{ enabled = true, autoQuality = true }, [tab]] = await Promise.all([
    chrome.storage.local.get(["enabled", "autoQuality"]), chrome.tabs.query({ active: true, currentWindow: true })
  ]);
  toggle.checked = enabled !== false;
  toggle.disabled = false;
  qualityToggle.checked = autoQuality !== false;
  qualityToggle.disabled = false;
  renderSetting();
  if (tab?.url) {
    const url = new URL(tab.url);
    if (url.protocol === "https:" && (url.hostname === "yifan.tv" || url.hostname.endsWith(".yifan.tv"))) activeTab = tab;
  }
  reload.disabled = !activeTab;
  await refreshStatus();
})().catch(showError);
