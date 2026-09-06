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

## Limits

Known client-side ad paths are covered. Embedded sponsorships, burned-in ads, unmarked server-side ad insertion, different mobile/embedded players, and future site changes are outside the verified coverage. No stream-manifest rewriting or speculative content seeking is used. Login, subscription, and quality restrictions remain those of the original player.
