import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
const root = new URL("../extension/", import.meta.url);
const manifest = JSON.parse(readFileSync(new URL("manifest.json", root)));
const rules = JSON.parse(readFileSync(new URL("rules.json", root)));
test("the unpacked extension is self-contained and limited to yifan.tv", () => {
  assert.equal(manifest.manifest_version, 3);
  assert.deepEqual(manifest.host_permissions, ["https://*.yifan.tv/*"]);
  for (const path of [manifest.background.service_worker, manifest.action.default_popup, ...manifest.content_scripts.flatMap(script => script.js), ...manifest.declarative_net_request.rule_resources.map(rule => rule.path)]) {
    assert.ok(existsSync(new URL(path, root)), `Missing ${path}`);
  }
  assert.ok(manifest.content_scripts.every(script => script.run_at === "document_start"));
  assert.deepEqual(manifest.permissions, ["storage", "declarativeNetRequest"]);
});
test("network rules cannot block main navigations, other sites, or arbitrary video CDNs", () => {
  for (const rule of rules) {
    assert.deepEqual(rule.condition.initiatorDomains, ["yifan.tv"]);
    assert.ok(!rule.condition.resourceTypes.includes("main_frame"));
    assert.ok(!rule.condition.requestDomains.includes("yifan.tv"));
    assert.equal(rule.action.type, "block");
  }
});
