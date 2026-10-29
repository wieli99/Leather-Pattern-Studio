# Browser-first architecture

The Vue 3 + TypeScript interface presents panels and commands; a framework-independent TypeScript controller owns tool state, camera, selection, snapping and temporary previews. Canvas 2D renders via an animation-frame scheduler, independently of Vue rendering. Backing resolution changes only with viewport size/device pixel density.

A Rust core compiled with wasm-pack runs in a dedicated Web Worker and owns typed, validated documents and transaction history. Contracts are generated with ts-rs. Requests carry revision numbers; preview responses are discarded when obsolete. Pointer previews are coalesced. UI previews never modify authoritative history. One commit represents one gesture or accepted field edit; history retains the last 200 commits. Spatial hit testing and snap candidates are derived from the display snapshot in TypeScript to keep pointer interaction immediate.

Version-5 documents store IDs, names, primitive kinds, local defining points, corner radius, rotation and an optional affine transform. Shapes use double-precision millimetres. Circles use centre plus radius endpoint; rectangles/ellipses use opposite corners; lines and polylines use vertices. Rotation is around the primitive's centre. Uniform group scaling preserves circles. Imported version-1 stitch parameters remain inactive metadata. Unsupported or invalid projects never replace the current document.

Browser file handles provide native saves where available, with explicitly reported downloads elsewhere. Debounced IndexedDB snapshots provide recovery after all committed changes, including undo/redo. A production-only service worker precaches the application, worker and Wasm. Each build gets a separate cache; updates wait for explicit activation so active sessions are not replaced.

All builds, dependency installation, development and tests run through Podman on Bluefin. The immutable host is not modified. Browser delivery supports Linux, Windows and macOS without native packaging; automated browser-engine checks do not replace physical OS/device input validation.

Vue single-file components live in `src/vue/`. The controller stays outside Vue deep reactivity; scoped selector subscriptions invalidate only the UI, hover, or cursor views that changed. Reka UI provides unstyled menus, Settings popovers and the Help dialog. Build-time `vue-tsc` checks templates as well as TypeScript.

Circular arcs retain their center, defining radius point, rotation and signed sweep. Earlier project versions migrate on load; display precision never rounds stored coordinates.

Transform sessions are controller-owned previews. Selection does not activate a transform. Dedicated gizmos and numeric controls share a session; Apply commits once through Rust and cancellation invalidates pending worker responses. Version-5 shapes optionally store an affine matrix in Canvas convention (`x′ = a*x + c*y + e`, `y′ = b*x + d*y + f`), applied after primitive rotation about its local center. Parametric curve centers and basis vectors are transformed exactly for rendering, extrema, snapping, picking, and marquee selection. Primitives and inactive legacy metadata remain intact.
