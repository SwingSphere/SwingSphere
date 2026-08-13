# Google Language Explorer Recovery Kit

Portable, read-only inspection package assembled from the GoogleGlobe
workspace. It contains only material directly related to the local analysis of
the Google Research Language Explorer page; unrelated globe prototypes are not
included.

## Provenance

- An analyzer in the source workspace fetched
  `https://sites.research.google/languages/language-explorer/` on March 17, 2026.
- The recorded response title was `Google Research Language Explorer` with HTTP
  status 200.
- The analyzer saved seven compiled JavaScript bundles and four compiled CSS
  files, then generated JSON and Markdown reports.
- `archive/raw/page_snapshot.html` is **not** a page snapshot. It contains only
  the 64-byte fetch representation of the URL and status.

## Contents

```text
archive/
  scripts/   7 recovered minified JavaScript bundles
  styles/    4 recovered compiled CSS files
  reports/   report.json and report.md from the analyzer
  raw/       the limited 64-byte fetch representation
tools/
  google_globe_analyzer.py
  test_scrapling.py
preview/
  index.html  original explanatory recovery exhibit
  README.md   local viewing instructions
```

Total: 19 files including this README.

The preview is self-contained and does not execute the recovered JavaScript or
CSS. Open `preview/index.html` directly, or serve this folder with a local
static server.

## What the recovered code appears to contain

- A Three.js/WebGL globe runtime with camera, rendering, shaders, atmosphere,
  country hover/selection, drag, zoom, labels, and an intro sequence.
- A Preact interface with routes, fuzzy search, country/language views, filters,
  responsive navigation, FAQ/modal UI, and Howler/Web Audio handling.
- Compiled styles for the dark globe interface, search and filter controls,
  panels, overlays, responsive layouts, animations, and a preloader.

See `archive/reports/` and the explanatory `preview/` for more detail.

## Missing and incomplete material

This is **not a runnable or complete copy of the original site**. Known gaps
include:

- at least eight imported JavaScript chunks;
- language, country, region, script, endangerment, and speaker-count datasets;
- country geometry used by the interactive globe;
- referenced audio, video, and other media;
- a complete HTML document, build manifest, source maps, and package metadata;
- backend/editorial systems and authoritative content provenance.

The minified entry files import absent modules, so they cannot run by
themselves. Treat them as evidence for inspection, not production-ready source.

## Licensing and reuse caution

The recovered assets originated from the Google-hosted page and may remain
subject to their original copyrights, licenses, terms, trademarks, and content
rights. Individual bundles include notices for Google LLC components
(BSD-3-Clause) and Three.js (MIT), but those notices do not establish the
license for every bundled asset or dataset. Review the original terms and all
embedded notices before copying, modifying, redistributing, or shipping any
recovered material.

The `preview/` exhibit is an original local explanation. Its placeholder globe
contains no recovered geography, media, or site code.
