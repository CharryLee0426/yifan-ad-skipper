# yifan.tv player research

Inspected September 5–6, 2026, using public pages and a fresh Chromium profile without signing in. This report covers the desktop web player.

## Findings from the site's code

The [homepage](https://www.yifan.tv/) loads an Angular application with Webpack 4 chunks. Its [runtime bundle](https://www.yifan.tv/app/runtime.c92c09ec9bf336115ef4.js) registers lazy modules through `window.webpackJsonp`. The extension watches that queue and Angular's component-definition function, so it can reach both exported and private player classes. It does not load or rewrite remote scripts.

The [main bundle](https://www.yifan.tv/app/main.36703714fcb3e6bdf20e.js) contains a player API that distinguishes ad media with `isAd`, and a scheduler with `invokeList`, `needToShow`, and `startPlay`. The scheduler can insert ads when playback crosses defined time points. Ad timers operate independently of media requests, which explains why blocking an ad file alone can leave a countdown or blank player.

The [video-page bundle](https://www.yifan.tv/app/4.c007dbd76ff47360426c.js) supplies separate ad fields: `startData` for initial ads, `pauseData` for pause placements, and `barrageData` for promotional danmu. Its media converter treats a non-empty `link` as an advertisement; ordinary playable entries share `flvPathList` with ad entries. The extension filters this known structure before the player consumes it and preserves the remaining response fields.

The [player bundle](https://www.yifan.tv/app/2.753b38471977268c9049.js) registers pause ads through `invokePauseAds` and renders them inside `vg-pause-f` / `.vg-vvk-p`. It also marks promotional danmu with `isAds`. Ordinary danmu remains enabled. Surrounding display placements use `.dabf` in the main application.

The site's [ad-block detector](https://www.yifan.tv/assets/prebid-ads.js) fetches Google's ad script and records whether it failed. The extension does not spoof account privileges or this flag; it suppresses the known ad lifecycle before that branch needs to play ad media.

## Live comparison

Test page: [the inspected public video](https://www.yifan.tv/play/X4r3180qOd2). Content duration was approximately **7,282.816 seconds**. These were short playback/seek experiments, not a complete viewing of the movie.

| Observation | Extension off | Extension on |
| --- | --- | --- |
| Initial content playback | Played normally | Played normally |
| Seeking just past the midpoint | Switched away from the movie into an approximately 20.22-second ad | Continued the movie at about 3,649.82 seconds |
| Pause attempt around that transition | Ad playback was active in the final observation | Movie stayed paused |
| Known pause/banner elements | Visible | Hidden |
| Ad video host in recorded requests | `s1-a1.global-cdn.me` | Not observed |
| Uncaught page JavaScript errors | None observed | None observed |

The protected run connected all five adapters: playback data, video playlist, ad scheduler, player overlays, and promotional comments. An additional run followed the site's related-video link to [a second public video](https://www.yifan.tv/play/8kOpVaG31G3). Navigation stayed in the same document, and the second video played normally with the hooks still active. Across these two videos, the final run filtered four video ad entries and two pause ad entries. No promotional-comment entries were supplied in that run; their filtering was verified with controlled fixtures.

Local measurements and screenshots are written to `artifacts/baseline.json`, `artifacts/protected.json`, `artifacts/baseline.png`, and `artifacts/protected.png`. Request counts include attempted requests, so they are not independently proof that a request reached the network. Chromium's `testMatchOutcome` separately verified the packaged network rule matches yifan.tv-initiated advertising requests and does not match the same request from an unrelated site.

## Chrome implementation references

Chrome documents [main and isolated content-script worlds](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts). This extension uses the main world only to integrate with the player; extension APIs and saved settings stay in the isolated script/service worker.

Chrome's [declarativeNetRequest documentation](https://developer.chrome.com/docs/extensions/reference/api/declarativeNetRequest) describes static rules, initiator-domain conditions, and enabling/disabling rulesets. The extension packages one narrowly scoped blocking rule and uses its popup to toggle the complete ruleset.

## Signed-out quality research (September 6, 2026)

The same public bundles were fetched again in a fresh Chromium session. In the [video-page bundle](https://www.yifan.tv/app/4.c007dbd76ff47360426c.js), `invokeClarity` maps the response's `clarity` entries into `bitrates` and divides their `bitrate` values by 1,000 to obtain the displayed quality number. Each option includes `isEnabled`, `isVIP`, `isBought`, and `path`. `invokePlayVideo` separately enforces `needLogin`.

In the [player bundle](https://www.yifan.tv/app/2.753b38471977268c9049.js), `vg-quality-selector.selectBitrate` checks guest login for VIP entries, then purchase status for ordinary accounts. A resolution above 1080 opens the app-download dialog. An accepted selection emits `onBitrateChange` through the original player. Changing a menu label alone cannot provide a missing stream path.

`npm run research:quality` and `npm run research:quality -- --baseline` inspected two public videos without signing in:

| Video | Guest options with a supplied stream | Listed options without streams | Selected tier, off / on | Decoded frame size, off / on |
| --- | --- | --- | --- | --- |
| [特立独行](https://www.yifan.tv/play/X4r3180qOd2) | 576P, enabled and non-VIP | 720P, 1080P, 2160P; disabled, VIP, not bought | 576P / 576P | 864 × 362 / 864 × 362 |
| [飞驰人生3](https://www.yifan.tv/play/8kOpVaG31G3) | 576P, enabled and non-VIP | 720P, 1080P, 2160P; disabled, VIP, not bought | 576P / 576P | 864 × 366 / 864 × 366 |

Both protected runs had six adapters connected, zero adapter errors, no uncaught page errors, and playing video at ready state 4 with no media error. These are short observations. They do not establish an HD stream for guests or coverage of every video. The menu's 576P tier is not the actual decoded height of these widescreen encodes.

The development quality adapter waits until the selector's inputs initialize and requests the highest accessible, enabled web option through the original selector method. It requires a supplied non-ad stream path, skips guest VIP and unknown access states, and leaves live/line-based players alone. It never alters login, purchase flags, stream signatures, media URLs, or manifests. It attempts one selection per set of quality/access options and preserves later manual choices or the site's recovery downgrade. Its setting is independent of ad filtering and defaults to on.

Sixteen unit tests and Chromium integration checks passed for this development change. Controlled fixtures demonstrate an automatic 576P-to-1080P selection, setting persistence under CSP, manual-choice preservation, and a new selection for another episode, including inputs arriving separately. The live tests verify connected hooks and continued guest playback at the available tier; they do **not** verify live guest HD switching.

Local evidence: `artifacts/quality-baseline.json`, `artifacts/quality-protected.json`, and corresponding `quality-*-1.png` / `quality-*-2.png` screenshots. The research command records only quality metadata, boolean access/path flags, playback dimensions, and extension counts. It uses a disposable profile and does not persist stream URLs, signatures, cookies, user objects, or response bodies. `YIFAN_TEST_URL` can select another public video.

## Limits

Known client-side ad paths are covered. Embedded sponsorships, burned-in ads, unmarked server-side ad insertion, different mobile/embedded players, and future site changes are outside the verified coverage. No stream-manifest rewriting or speculative content seeking is used. Login, subscription, and quality restrictions remain those of the original player.

## Client-side upscaling research (September 8, 2026)

Guests receive only the 576P tier (decoded at 864 × 362), so the remaining way to a 1080P or 2K picture is to upscale on the viewer's GPU. The player uses hls.js over Media Source Extensions with `crossOrigin="anonymous"` and a CORS-enabled CDN, so the `<video>` is same-origin and canvas/WebGL can read its frames. A WebGL2 port of AMD FidelityFX Super Resolution 1.0 (EASU + RCAS) rendered every decoded frame to an overlay canvas inside `vg-player` at 1920 × 804 and 2560 × 1072 with about 1.2 ms and 2.0 ms of GPU time per frame on an Apple M4 Pro, at the source's 24 fps with no dropped frames. The site's own full-screen button fullscreens `vg-player`, so the overlay follows it; picture-in-picture works by feeding `canvas.captureStream()` to a hidden video and calling `requestPictureInPicture()`, and Document Picture-in-Picture can adopt the canvas directly. See [docs/UPSCALING.md](docs/UPSCALING.md) for the survey, design, measurements, and limits, and `npm run research:upscale` for the reproducible experiment. Evidence: `artifacts/upscale.json`, `artifacts/upscale-compare-2k.png`, and the `upscale-*.png` screenshots.
