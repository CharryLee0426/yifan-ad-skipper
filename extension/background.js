"use strict";
let pending = Promise.resolve();

async function applyEnabled(enabled) {
  await chrome.declarativeNetRequest.updateEnabledRulesets({
    enableRulesetIds: enabled ? ["ads"] : [],
    disableRulesetIds: enabled ? [] : ["ads"]
  });
  await chrome.action.setBadgeText({ text: enabled ? "ON" : "OFF" });
  await chrome.action.setBadgeBackgroundColor({ color: enabled ? "#116c55" : "#64748b" });
}
function enqueue(task) {
  const result = pending.then(task);
  pending = result.catch(() => {});
  return result;
}
function restore() {
  return enqueue(async () => {
    const { enabled = true } = await chrome.storage.local.get("enabled");
    await applyEnabled(enabled !== false);
  }).catch(error => console.error("Could not restore ad skipper settings:", error));
}
chrome.runtime.onInstalled.addListener(restore);
chrome.runtime.onStartup.addListener(restore);
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  // Page-world messages cannot control extension settings. Only our popup may.
  if (sender.url !== chrome.runtime.getURL("popup.html")) return;
  if (message?.type === "set-auto-quality" && typeof message.autoQuality === "boolean") {
    enqueue(async () => {
      await chrome.storage.local.set({ autoQuality: message.autoQuality });
      return { ok: true };
    }).then(respond, error => respond({ ok: false, error: error.message }));
    return true;
  }
  if (message?.type !== "set-enabled" || typeof message.enabled !== "boolean") return;
  enqueue(async () => {
    const { enabled: previous = true } = await chrome.storage.local.get("enabled");
    try {
      await applyEnabled(message.enabled);
      await chrome.storage.local.set({ enabled: message.enabled });
      return { ok: true };
    } catch (error) {
      await applyEnabled(previous).catch(() => {});
      return { ok: false, error: error.message };
    }
  }).then(respond, error => respond({ ok: false, error: error.message }));
  return true;
});
