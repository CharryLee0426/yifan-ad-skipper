"use strict";
const toggle = document.getElementById("enabled");
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
  if (!activeTab) { status.textContent = "Open a yifan.tv video to see player protection."; return; }
  try {
    const data = await chrome.tabs.sendMessage(activeTab.id, { type: "get-page-status" });
    for (const [id, key] of [["video-ads", "videoAds"], ["scheduled-ads", "scheduledAds"], ["pause-ads", "pauseAds"], ["comments", "promotionalComments"]]) {
      document.getElementById(id).textContent = data[key] ?? "—";
    }
    const connected = data.adapters?.includes("playback-data") && data.adapters?.includes("player-overlays");
    status.textContent = !toggle.checked ? "Protection is off. Reload to restore the original player." : data.errors ? "A player adapter encountered an error. Reload, or turn protection off if playback fails." : !data.playerPresent ? "Protection is on. Choose a video to activate the player filters." : connected ? "Player filters connected. Known ad overlays are hidden." : "Player filters are not connected yet. Reload; this player may need an extension update.";
  } catch {
    status.textContent = "Reload this page to connect the extension.";
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
reload.addEventListener("click", async () => {
  try { await chrome.tabs.reload(activeTab.id); window.close(); } catch (error) { showError(error); }
});
(async () => {
  const [{ enabled = true }, [tab]] = await Promise.all([
    chrome.storage.local.get("enabled"), chrome.tabs.query({ active: true, currentWindow: true })
  ]);
  toggle.checked = enabled !== false;
  toggle.disabled = false;
  renderSetting();
  if (tab?.url) {
    const url = new URL(tab.url);
    if (url.protocol === "https:" && (url.hostname === "yifan.tv" || url.hostname.endsWith(".yifan.tv"))) activeTab = tab;
  }
  reload.disabled = !activeTab;
  await refreshStatus();
})().catch(showError);
