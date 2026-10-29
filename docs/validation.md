# MVP validation

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

Open the running Podman preview on localhost port 5174. Verify mouse/trackpad feel, keyboard focus, native file picker behavior and offline reload in your preferred browser. Recovery uses browser-managed storage and is separate from a project saved to disk. Export, printing and leather tools remain outside the agreed MVP scope.
