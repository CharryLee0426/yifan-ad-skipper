<p align="center">
  <img src="extension/icons/icon-128.png" width="96" height="96" alt="Yifan Ad Skipper — a protection shield with a skip-forward symbol">
</p>

# Yifan Ad Skipper

**English** · [简体中文](README.zh-CN.md)

**v1.0** · Chrome 111+ · Manifest V3 · [MIT License](LICENSE)

A Chrome Manifest V3 extension for **https://www.yifan.tv/**. It removes known video ad entries, prevents the site's ad timers from starting, and hides pause ads and surrounding ad banners. It also filters promotional danmu entries while preserving ordinary comments.

## Features

| | Feature | What it does |
| --- | --- | --- |
| <img src="extension/icons/skip-video.svg" width="32" alt="Skip video"> | Video ad skipping | Filters marked preroll and midroll ad entries and suppresses known ad timers. |
| <img src="extension/icons/hide-overlays.svg" width="32" alt="Hide overlays"> | Cleaner player | Hides identified pause ads and surrounding banners. |
| <img src="extension/icons/filter-comments.svg" width="32" alt="Filter comments"> | Promotional comment filtering | Removes marked ad comments while keeping ordinary danmu. |
| <img src="extension/icons/local-control.svg" width="32" alt="Local control"> | Local controls | Includes an on/off switch, connection status, and per-page diagnostic counts. |

The shield and skip-forward mark represents protected video playback. See the [icon family](docs/ICONS.md) for editable assets and the design rationale.

## Install in Chrome

1. [Download v1.0](https://github.com/CharryLee0426/yifan-ad-skipper/archive/refs/tags/v1.0.zip) and extract the ZIP, or clone this repository.
2. Open `chrome://extensions` and turn on **Developer mode** in the upper-right corner.
3. Click **Load unpacked** and select the extracted project's **`extension`** folder—the folder containing `manifest.json`.
4. Reload any open yifan.tv pages, then start a video.
5. Pin **Yifan Ad Skipper** from Chrome's Extensions menu to access its switch and status.

No build, npm installation, account, or API key is needed to use the extension. The locally generated `dist/yifan-ad-skipper.zip` uses the same layout: extract it and load its **`extension`** folder. Installation currently uses an unpacked extension; there is no Chrome Web Store listing.

## Use and troubleshooting

Protection defaults to **on**. The popup shows whether the player filters connected and how many ad entries were filtered during the current page load. These are processed entries, not a count of unique impressions or network requests; changing a video or quality can process an entry again.

Reload the page after changing the switch. Turning protection off immediately stops filtering future calls and disables the network rules, but previously removed ad lists require a reload to restore.

If the popup says the player filters are not connected, reload. If playback fails or the warning remains, turn protection off and reload; the site may have changed its player implementation. The extension cannot repair an unavailable video or a failing content CDN.

**Coverage:** the current desktop yifan.tv player and its known ad paths. Ads baked into the video, unmarked server-inserted segments, new ad implementations, and unrelated embedded players may remain. There is no reliable promise to remove every future ad. Mobile layouts and other site aliases have not been validated.

## How it works

- A script runs at document start in the page's main world. It observes Webpack module registration and Angular component definitions to find specific player methods, using method signatures instead of bundle filenames or minified class names.
- It filters the site's explicit ad fields (`startData`, `pauseData`, `barrageData`, linked entries in `flvPathList`) and `isAd`/`isAds` items. A second layer suppresses the known ad scheduler and pause-ad registration.
- An isolated content script applies CSS to verified ad-only elements: `.dabf`, `vg-pause-f`, and `.vg-vvk-p`.
- Chrome's declarative network rules block three Google advertising domain families only when the request originates from yifan.tv. Content CDNs and video manifests remain available. Some hidden first-party banners can still be downloaded by the site.

The extension leaves login requirements, purchased-content flags, available quality levels, subtitles, and resume positions intact. It does not change account entitlements, accelerate the movie, or blindly seek every short video.

## Permissions and privacy

- `storage`: saves the on/off preference locally.
- `declarativeNetRequest`: blocks matching ad requests. Although Chrome describes this permission broadly, the packaged rules require a yifan.tv initiator.
- `https://*.yifan.tv/*`: permits the player hooks and allows the popup to recognize supported tabs.

No analytics, external service, remote code download, or viewing-history collection is included. Diagnostic counts stay in the page until it closes or reloads. Communication between the page hook and isolated script contains settings and counts only; it does not forward arbitrary page messages to extension APIs.

## Development and verification

From a source checkout, use Node.js 20+ for the development tools:

```sh
npm ci --registry=https://registry.npmjs.org
npx playwright install chromium
npm run icons
npm test
npm run test:browser
npm run research:live
npm run research:live -- --baseline
npm run research:live -- --spa
npm run package
```

`npm test` exercises playlist filtering, scheduler suppression, ordinary-content preservation, unknown shapes, disabled behavior, lazy modules, inheritance, and manifest constraints. `test:browser` loads the actual unpacked extension in Chromium and verifies main/isolated-world integration under CSP, private Angular components, real DNR matching, the popup switch, and persistence across reloads.

Live research uses a disposable browser profile and saves observations and screenshots under `artifacts/`. It requires network access, changes the video position, and is observational rather than a deterministic test. Override the public test page with `YIFAN_TEST_URL`. Logs contain network hostnames and request types, excluding signed stream paths, queries, cookies, and response bodies.

See [RESEARCH.md](RESEARCH.md) for the inspected sources and measured live behavior. `npm run package` creates `dist/yifan-ad-skipper.zip` using the system `zip` command.

## Verification for v1.0

The nine automated tests and Chromium integration checks passed. Live testing on two public videos confirmed that playback continued past a midpoint where the original player switched to a roughly 20-second ad, pause ads remained hidden, and the filters stayed connected when navigating to another video without reloading the page. These were short playback experiments, not full-length viewing tests.

## License

Copyright © 2026 Charlie Li (CharryLee0426). Distributed under the [MIT License](LICENSE), including the original icon artwork. This is an independent project and is not affiliated with yifan.tv.
