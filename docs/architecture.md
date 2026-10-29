# Browser-first architecture

The React interface presents panels and commands; a framework-independent TypeScript controller owns tool state, camera, selection, snapping and temporary previews. Canvas 2D renders via an animation-frame scheduler, independently of React rendering. Backing resolution changes only with viewport size/device pixel density.

A Rust core compiled with wasm-pack runs in a dedicated Web Worker and owns typed, validated documents and transaction history. Contracts are generated with ts-rs. Requests carry revision numbers; preview responses are discarded when obsolete. Pointer previews are coalesced. UI previews never modify authoritative history. One commit represents one gesture or accepted field edit; history retains the last 200 commits. Spatial hit testing and snap candidates are derived from the display snapshot in TypeScript to keep pointer interaction immediate.

Version-3 documents store IDs, names, primitive kinds, local defining points, corner radius and rotation. Shapes use double-precision millimetres. Circles use centre plus radius endpoint; rectangles/ellipses use opposite corners; lines and polylines use vertices. Rotation is around the primitive's centre. Uniform group scaling preserves circles. Imported version-1 stitch parameters remain inactive metadata. Unsupported or invalid projects never replace the current document.

Browser file handles provide native saves where available, with explicitly reported downloads elsewhere. Debounced IndexedDB snapshots provide recovery after all committed changes, including undo/redo. A production-only service worker precaches the application, worker and Wasm. Each build gets a separate cache; updates wait for explicit activation so active sessions are not replaced.

All builds, dependency installation, development and tests run through Podman on Bluefin. The immutable host is not modified. Browser delivery supports Linux, Windows and macOS without native packaging; automated browser-engine checks do not replace physical OS/device input validation.
