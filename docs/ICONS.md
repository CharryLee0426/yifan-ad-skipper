# Icon family

The product mark combines a **shield** for ad protection with a **skip-forward symbol** for uninterrupted video playback. Its rounded dark-green tile remains distinct on both light and dark browser toolbars. The mint shield uses broad shapes so the mark remains readable at small sizes. It contains no lettering and is independent of yifan.tv's own branding.

![Yifan Ad Skipper](../extension/icons/icon-128.png)

| Icon | Meaning | Usage |
| --- | --- | --- |
| <img src="../extension/icons/skip-video.svg" width="32" alt="Skip video"> | Skip marked video ads | README features and popup video counters |
| <img src="../extension/icons/hide-overlays.svg" width="32" alt="Hide overlays"> | Hide pause ads and overlays | README features and popup pause counter |
| <img src="../extension/icons/filter-comments.svg" width="32" alt="Filter comments"> | Filter promotional comments | README features and popup comment counter |
| <img src="../extension/icons/local-control.svg" width="32" alt="Local control"> | Local on/off control | README features |

Editable sources live in `extension/icons/*.svg`. The product mark is exported as PNG at **16, 32, 48, 128, 256, and 512 pixels**. The manifest uses 16–128 px exports; the larger sizes are available for documentation or repository artwork. Decorative popup icons have empty alternative text because adjacent labels provide the meaning.

Regenerate the PNGs after editing `logo.svg`:

```sh
npm ci
npx playwright install chromium
npm run icons
```

The renderer uses Chromium's SVG and canvas APIs; there are no remote fonts, external artwork dependencies, or generative image assets. All original icons are covered by the repository's [MIT license](../LICENSE).
