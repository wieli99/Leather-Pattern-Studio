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

## Release 0.2.0 readiness

The suite also includes print layouts/export, embedded images, text, groups, indicators, persistent measurements, stitch tools, trimming, and object/page reordering. Test names describe coverage, not a guarantee that every workflow or physical device has been validated.

Release gates: merge the separate manual update, run the complete suite on the combined candidate, review repository security findings, confirm the public domain, and identify the previous successful Worker deployment for rollback. After deployment verify startup, save/open, manual availability, offline reload, and update acceptance. Production and physical-device checks must be recorded separately from automated results.

### Preparation evidence

The preparation run passed 38 Rust tests, 344 unit tests, TypeScript checking and the production build. The Wrangler deployment dry run passed without publishing. The documented production address responded with HTTP 200. GitHub reported zero open Dependabot, code-scanning, and secret-scanning alerts at inspection time; this is not a complete security audit.

The optional Tauri desktop shell retains its independent development version and is not part of this browser release. No physical printer, OS dialog, or real device validation was performed by the preparation agent.

Browser run: 407 passed and 6 skipped across Chromium, Firefox and WebKit. One WebKit rounded-stitch test failed waiting five seconds for the startup Open button to become enabled; its isolated rerun passed (1/1). The full run therefore did not pass cleanly. Investigate startup timing if this recurs and require a passing combined-candidate CI run before release.
