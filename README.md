<p align="center">
  <img src="extension/icons/icon-128.png" width="96" height="96" alt="Yifan Ad Skipper — a protection shield with a skip-forward symbol">
</p>

# Yifan Ad Skipper

**English** · [简体中文](README.zh-CN.md)

**v1.2** · Chrome 111+ · Manifest V3 · [MIT License](LICENSE)

A Chrome Manifest V3 extension for **https://www.yifan.tv/**. It removes known video ad entries, prevents the site's ad timers from starting, and hides pause ads and surrounding ad banners. It also filters promotional danmu entries while preserving ordinary comments.

**v1.1** added automatic selection of the highest accessible desktop-web quality, with a separate switch and quality status in the popup. It does not unlock VIP video or promise HD on signed-out videos; it picks the highest tier the server actually supplies to the current session.

**v1.2** adds **GPU upscaling**: the delivered stream is upscaled on your graphics card to 1080P or 2K with AMD FidelityFX Super Resolution 1.0 and shown inside the same player, with full screen and picture-in-picture. It runs through WebGL2, so it works on NVIDIA, AMD, Intel, and Apple Silicon GPUs. This is reconstruction from the delivered frames, not the site's HD stream.

## Features

| | Feature | What it does |
| --- | --- | --- |
| <img src="extension/icons/skip-video.svg" width="32" alt="Skip video"> | Video ad skipping | Filters marked preroll and midroll ad entries and suppresses known ad timers. |
| <img src="extension/icons/hide-overlays.svg" width="32" alt="Hide overlays"> | Cleaner player | Hides identified pause ads and surrounding banners. |
| <img src="extension/icons/filter-comments.svg" width="32" alt="Filter comments"> | Promotional comment filtering | Removes marked ad comments while keeping ordinary danmu. |
| <img src="extension/icons/local-control.svg" width="32" alt="Local control"> | Local controls | Includes an on/off switch, connection status, and per-page diagnostic counts. |
| | Best available quality | Chooses the highest enabled stream supplied to the current viewer, up to the site's 1080P web limit. Preserves manual selections and player recovery choices. |
| | GPU upscaling | Upscales the delivered frames to 1080P or 2K on your GPU (FSR 1.0, WebGL2) inside the same player. Follows the site's full-screen mode and adds a PiP button that shows the upscaled picture. |

The shield and skip-forward mark represents protected video playback. See the [icon family](docs/ICONS.md) for editable assets and the design rationale.

## Install in Chrome

1. [Download v1.2](https://github.com/CharryLee0426/yifan-ad-skipper/archive/refs/tags/v1.2.zip) and extract the ZIP, or clone this repository.
2. Open `chrome://extensions` and turn on **Developer mode** in the upper-right corner.
3. Click **Load unpacked** and select the extracted project's **`extension`** folder—the folder containing `manifest.json`.
4. Reload any open yifan.tv pages, then start a video.
5. Pin **Yifan Ad Skipper** from Chrome's Extensions menu to access its switch and status.

No build, npm installation, account, or API key is needed to use the extension. The locally generated `dist/yifan-ad-skipper.zip` uses the same layout: extract it and load its **`extension`** folder. Installation currently uses an unpacked extension; there is no Chrome Web Store listing.

## Use and troubleshooting

Protection defaults to **on**. The popup shows whether the player filters connected and how many ad entries were filtered during the current page load. These are processed entries, not a count of unique impressions or network requests; changing a video or quality can process an entry again.

Reload the page after changing the switch. Turning protection off immediately stops filtering future calls and disables the network rules, but previously removed ad lists require a reload to restore.

**Best available quality** defaults to on and works independently of ad protection. Reload after changing it. The popup reports the site's selected quality tier and highest accessible tier; these labels are not measurements of decoded frame dimensions. Selection runs once per video's quality/access options, so it does not fight a manual downgrade or repeatedly retry a failing higher stream. Live and line-based players retain the site's selection.

**Upscale picture** defaults to 1080P and applies immediately, without a reload. The popup reports the source and output size, the frame rate, and the GPU in use. Choose 2K on a high-resolution display, or Off to see the stream exactly as delivered. The overlay sits inside the site's player, so the site's full-screen button works unchanged; a small **PiP** button (visible with the player controls) opens picture-in-picture with the upscaled picture. Upscaling sharpens compression artifacts along with detail; it cannot equal a real HD encode. It uses roughly 1 to 2 ms of GPU time per frame on an Apple M4 Pro and needs WebGL2, which every desktop Chrome supports.

This does **not** unlock VIP video or promise HD on every signed-out video. In fresh guest profiles, both inspected movies supplied only the 576P tier; 720P, 1080P, and 4K entries had no stream path. The site's desktop web selector also routes resolutions above 1080P to its app. See the [quality research](RESEARCH.md#signed-out-quality-research-september-6-2026) for measured results.

If the popup says the player filters are not connected, reload. If playback fails or the warning remains, turn protection off and reload; the site may have changed its player implementation. The extension cannot repair an unavailable video or a failing content CDN.

**Coverage:** the current desktop yifan.tv player and its known ad paths. Ads baked into the video, unmarked server-inserted segments, new ad implementations, and unrelated embedded players may remain. There is no reliable promise to remove every future ad. Mobile layouts and other site aliases have not been validated.

## How it works

- A script runs at document start in the page's main world. It observes Webpack module registration and Angular component definitions to find specific player methods, using method signatures instead of bundle filenames or minified class names.
- It filters the site's explicit ad fields (`startData`, `pauseData`, `barrageData`, linked entries in `flvPathList`) and `isAd`/`isAds` items. A second layer suppresses the known ad scheduler and pause-ad registration.
- An isolated content script applies CSS to verified ad-only elements: `.dabf`, `vg-pause-f`, and `.vg-vvk-p`.
- Chrome's declarative network rules block three Google advertising domain families only when the request originates from yifan.tv. Content CDNs and video manifests remain available. Some hidden first-party banners can still be downloaded by the site.
- A quality-selector adapter uses the site's original `selectBitrate` method after Angular initializes its inputs. It considers only enabled, accessible entries with supplied stream paths and makes no additional stream requests itself.
- The upscaler reads each decoded frame of the site's own `<video>` through `requestVideoFrameCallback`, runs FSR 1.0's EASU and RCAS passes in WebGL2, and draws into a canvas positioned over the video's letterbox box under the site's controls. The video keeps playing underneath, so audio, seeking, subtitles, and quality selection are untouched. Picture-in-picture feeds the canvas through `captureStream()` to a hidden video element. Frames are readable because the player uses hls.js over Media Source Extensions with a CORS-enabled CDN; if that ever changes, the overlay reports itself unavailable instead of failing.

The extension leaves login requirements, purchased-content flags, available quality levels, subtitles, and resume positions intact. It does not change account entitlements, accelerate the movie, or blindly seek every short video.

## Permissions and privacy

- `storage`: saves ad-protection and automatic-quality preferences locally.
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
npm run research:quality
npm run research:quality -- --baseline
npm run research:upscale
npm run package
```

`npm test` exercises playlist filtering, scheduler suppression, ordinary-content preservation, unknown shapes, disabled behavior, lazy modules, inheritance, and manifest constraints. `test:browser` loads the actual unpacked extension in Chromium and verifies main/isolated-world integration under CSP, private Angular components, real DNR matching, the popup switch, and persistence across reloads.

Quality tests cover selection order, unavailable/locked options, lifecycle timing, independent settings, manual choices, recovery downgrades, episode changes, and destroyed/unsupported players. `research:quality` observes guest quality metadata and decoded frame dimensions in both modes; it saves only boolean access/path flags and quality numbers, never stream URLs or account data. Automatic 576P-to-1080P selection has been verified with controlled fixtures, not on a live guest stream: the inspected live movies did not offer guest HD paths.

Live research uses a disposable browser profile and saves observations and screenshots under `artifacts/`. It requires network access, changes the video position, and is observational rather than a deterministic test. Override the public test page with `YIFAN_TEST_URL`. Logs contain network hostnames and request types, excluding signed stream paths, queries, cookies, and response bodies.

`research:upscale` measures the shipped GPU upscaler on the live guest stream at 1080P and 2K, including full screen and picture-in-picture, and writes same-frame comparison screenshots; see [docs/UPSCALING.md](docs/UPSCALING.md). `test:browser` also verifies the overlay on a synthetic video: output size, rendered pixels, popup status, and live switching between 1080P, 2K, and Off.

See [RESEARCH.md](RESEARCH.md) for the inspected sources and measured live behavior. `npm run package` creates `dist/yifan-ad-skipper.zip` using the system `zip` command.

## Verification for v1.0

The nine automated tests and Chromium integration checks passed. Live testing on two public videos confirmed that playback continued past a midpoint where the original player switched to a roughly 20-second ad, pause ads remained hidden, and the filters stayed connected when navigating to another video without reloading the page. These were short playback experiments, not full-length viewing tests.

## Verification for v1.1

The sixteen automated tests and Chromium integration checks pass. v1.1 folds in the best-available-quality adapter, verified with controlled fixtures (including an automatic 576P-to-1080P selection) and unit tests covering selection order, locked options, lifecycle timing, manual choices, recovery downgrades, episode changes, and destroyed or unsupported players. Live guest runs on two public videos confirmed connected hooks and continued playback at the available tier; live guest HD switching was not verified, because the inspected movies supplied no guest HD paths. See the [signed-out quality research](RESEARCH.md#signed-out-quality-research-september-6-2026) for the measured baseline.

## Verification for v1.2

The sixteen unit tests and six Chromium integration checks pass, including the new upscaling check. On the live guest stream (864 × 362 source, 24 fps) the extension rendered every frame at 1920 × 804 and 2560 × 1072 with zero dropped video frames, followed the site's full-screen mode, and opened picture-in-picture with the upscaled frames. Measured on an Apple M4 Pro through Chrome's Metal backend; NVIDIA, AMD, and Intel GPUs use the same WebGL2 shaders through Chrome's Direct3D or OpenGL backends and have not been measured here. See [docs/UPSCALING.md](docs/UPSCALING.md).

## License

Copyright © 2026 Charlie Li (CharryLee0426). Distributed under the [MIT License](LICENSE), including the original icon artwork. This is an independent project and is not affiliated with yifan.tv.
