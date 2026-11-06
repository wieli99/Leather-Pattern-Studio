# Validation

Run the complete checks with `tools/dev/run.sh check`. Tests use production assets and the real Rust/Wasm worker, not a JavaScript fallback.

## Reference environment

Bluefin Linux x86_64 host, AMD Ryzen 5 3600X (6 cores / 12 threads). Node 22 and Rust 1.90 run in Podman. Playwright engines are Chromium 156, Firefox 157, and WebKit 27.2. These are automated Linux engine tests; physical Windows/macOS browsers and real trackpad gestures have not been manually exercised.

## Coverage

- Rust: document validation, duplicate IDs, degenerate shapes, history, no-op transactions, preview isolation, stale revisions, generated contracts.
- Unit: migrations from versions 1–4, malformed input, geometry hit testing, rotated bounds/transforms, circle scaling, controller cancellation, numeric geometry rejection, screen-space snapping and cursor-anchored zoom.
- Browser: all drawing tools, exact dimensions, rounded corners, undo/redo, multi-selection/delete, cancellation, transform tool activation, full-arrow dragging, stable snapping, numeric precision, affine resize/rotate/move previews, cancellation, duplication, JSON download/open, malformed-file preservation, recovery, and offline cold reload with Wasm.
- Chromium additionally exercises the native save API via a controlled picker/writable stub, including user cancellation. Real OS file dialogs still require manual validation. Firefox/WebKit use the tested download fallback.

## Performance

A 1,000-rounded-rectangle document at 1280 × 800, headless Chromium in Podman, measured 90 navigation frames after warm-up: mean **16.66 ms**, 95th percentile **17.60 ms**. This is approximately 60 Hz in this reference environment, not a guarantee for every GPU or browser. Test output attaches timing JSON; a regression threshold of 40 ms mean allows for shared CI load.

## Manual follow-up

Open the running Podman preview on localhost port 5174. Verify mouse/trackpad feel, keyboard focus, native file picker behavior and offline reload in your preferred browser. Recovery uses browser-managed storage and is separate from a project saved to disk. Manually verify physical print scale at 100%, native file dialogs, real trackpad gestures, and the update transition with unsaved work before public release.

## Stitching validation (2026-11-05)

The combined stitching candidate passed 43 Rust tests, 366 Vitest tests, TypeScript checking, and the production build in the provided Podman environment. The complete production browser suite used three workers and finished with 459 passed and 6 skipped:

- Chromium: 155 passed, 0 skipped.
- Firefox: 152 passed, 3 skipped.
- WebKit: 152 passed, 3 skipped.

All 48 manual screenshot checks and all 6 development-server manual-loading checks also passed. The bundled illustrations include the new receiving-layer registration workflow. Coverage includes counted runs and continuation gaps, master-centered receiving holes, clipping and edge warnings, exact registration-coordinate correction, per-hole appearance, presets, cancellation/history, native curve extraction, and project round trips through format 20.

These are automated Linux browser-engine results. No physical printer, native OS dialog, tablet/iPad, or real trackpad validation was performed. This run did not publish or deploy the application.

## Contextual stitching toolbar (2026-11-06)

The toolbar redesign passed 45 Rust tests, 382 unit tests, TypeScript checking and the production build in Podman. The complete production browser run finished with 471 passed and 6 skipped:

- Chromium: 159 passed, 0 skipped.
- Firefox: 156 passed, 3 skipped.
- WebKit: 156 passed, 3 skipped.

All 49 manual screenshot comparisons and all 6 development-server manual-loading checks passed. The toolbar and contextual options screenshots were inspected visually. Coverage includes per-tool availability, active states, compact settings with Apply/Cancel in their footer, baseline-based previews, switching and cancellation, one-step undo, selection preservation, repeated split previews, counted runs, transfer/detach, keyboard control and narrow-screen containment.

An additional geometry-exception recovery guard was verified by the final 382-test unit run; the final production build and six focused toolbar browser checks were rerun after that guard. No document-format change was added for toolbar state. The unsupported-version diagnostic now lists format 21 correctly. These are automated Linux browser-engine results; physical devices, native file dialogs and real trackpads were not manually validated. No deployment or publishing was performed.

## Release 0.2.0 readiness

The suite also includes print layouts/export, embedded images, text, groups, indicators, persistent measurements, stitch tools, trimming, and object/page reordering. Test names describe coverage, not a guarantee that every workflow or physical device has been validated.

Release gates: merge the separate manual update, run the complete suite on the combined candidate, review repository security findings, confirm the public domain, and identify the previous successful Worker deployment for rollback. After deployment verify startup, save/open, manual availability, offline reload, and update acceptance. Production and physical-device checks must be recorded separately from automated results.

### Preparation evidence

The preparation run passed 38 Rust tests, 344 unit tests, TypeScript checking and the production build. The Wrangler deployment dry run passed without publishing. The documented production address responded with HTTP 200. GitHub reported zero open Dependabot, code-scanning, and secret-scanning alerts at inspection time; this is not a complete security audit.

The optional Tauri desktop shell retains its independent development version and is not part of this browser release. No physical printer, OS dialog, or real device validation was performed by the preparation agent.

Browser run: 407 passed and 6 skipped across Chromium, Firefox and WebKit. One WebKit rounded-stitch test failed waiting five seconds for the startup Open button to become enabled; its isolated rerun passed (1/1). The full run therefore did not pass cleanly. Investigate startup timing if this recurs and require a passing combined-candidate CI run before release.

## Stitching test-feedback refinement (2026-11-06)

Verified in Podman: 45 Rust tests; 386 unit tests, including preset backup merging, Auto continuations, logical rectangle-edge retention and ordered multi-line merge; TypeScript and production build. The full production browser suite passed 471 tests with 6 skips, followed by all 6 development-server manual checks. The subsequent expanded stitching suite passed 36 tests across Chromium, Firefox and WebKit, including the preset export/delete/import/restore round trip. All 49 manual screenshot scenarios were refreshed successfully and the reduced toolbar/settings illustration was inspected. Final wording corrections were checked by another unit/build run.

Sections and source geometry remain in format 21. Legacy embedded project presets remain readable compatibility data; new library edits use browser storage and exported backups. No deployment, publishing, physical-device or real trackpad validation was performed.

## Transfer responsiveness, snapping and numbered indicators (2026-11-06)

The shared snapping and transfer-performance candidate passed 45 Rust tests, TypeScript/build checks, the full production browser suite (475 passed, 8 skipped), and all 6 development-server manual checks. Final transfer-number additions passed 393 unit tests and 36 focused browser checks across Chromium, Firefox and WebKit. All 49 manual screenshot scenarios were refreshed, and the collapsed preset panel and matching source/receiver number badges were inspected visually.

The reference Chromium stress fixture uses approximately 1,000 source holes, five receivers (including a rounded piece), 250 unrelated shapes and bursts of three pointer events per frame. The initial attempt timed out at 30 seconds. After removing quadratic hole-distance work, sharing preview results, coalescing pointer input and indexing exact material checks, an isolated run measured mean 26.98 ms and p95 34.30 ms; under the concurrent full suite it measured mean 32.98 ms and p95 46.40 ms. This passes the existing 40-ms mean CI ceiling, not a universal 60-Hz guarantee. Timing JSON is attached to the benchmark results. Physical trackpads/devices were not manually exercised.

Transfer numbers are optional backward-compatible contract fields normalized on load and saved per placement. Tests cover sharing across receivers, deletion without renumbering, legacy migration, copy allocation and conflicting number rejection. No deployment or publishing was performed.

## Staged transfer confirmation and Continue run eligibility (2026-11-06)

The staged-transfer candidate passed 45 Rust tests, 395 unit tests, TypeScript and production build checks, all 49 manual screenshot scenarios, the full production browser suite (475 passed, 8 skipped), and all 6 development-server manual checks. The transfer stress test measured a 33.33-ms mean and 41.80-ms p95 under the full concurrent suite.

Regression checks cover left-click placement and repositioning without document/history changes, explicit confirmation as one undo entry, rejection of queued pointer input after placement, rotation about the placed center, viewport zoom preserving the placement, and disabling Continue run for an Auto-filled rectangle section. A fixed-count predecessor can still create an Auto-count continuation. Invalid geometry displays its actual diagnostic instead of always blaming inset. No publishing or physical-device validation was performed.

After the final empty-placement guidance and shortcut-help refinements, all 395 unit tests, the production build, all 49 manual screenshot scenarios and 12 focused stitching browser checks passed again. A partial screenshot capture was rejected by the complete-manual coverage guard; the subsequent complete capture passed.
