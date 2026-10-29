# Leather Studio

An offline-capable browser-based precision 2D pattern editor. Inspired by Plasticity's focused workspace; no 3D, accounts, server-side document processing, or installation required.

## Run with Podman

```
tools/dev/run.sh dev
```

Open **http://127.0.0.1:5174/**. This builds the Node/Rust toolchain image, installs locked dependencies, generates Wasm, and starts Vite. Stop another server using port 5174 first. Source changes reload; Rust changes require rerunning `npm run wasm` in the container.

```
tools/dev/run.sh check
```

Runs Rust tests, generated TypeScript contracts, production build, unit tests, and Chromium/Firefox/WebKit acceptance tests. Browser dependencies are installed inside the container. To test offline behavior, build and run `tools/dev/run.sh preview`; development mode intentionally does not register a service worker. Offline use starts after the first successful online load and cache installation. Serve deployments over HTTPS (localhost also works).

## Draw and edit

- **V/L/P/R/C/E**: select, line, polyline, rectangle, circle, ellipse.
- Click two points to draw. Polylines accept more points; Enter finishes and clicking the first vertex closes. Numeric creation fields appear after the first point.
- Inspector edits exact dimensions, position, corner radius, rotation, and vertices. Enter or blur accepts a field; Escape cancels the field. Coordinates use millimetres.
- Select outlines or use the object list. Shift toggles selection; dragging an empty area selects fully enclosed objects. Square handle scales uniformly; round handle rotates. Vertex handles edit lines/polylines.
- Space+drag or middle-drag pans. Scroll pans; Ctrl/Command+scroll zooms at the cursor. **F** fits all; **Shift+F** fits selected objects.
- **Ctrl/Command+Z**, **Ctrl/Command+Shift+Z**, **Ctrl/Command+D**, and Delete undo, redo, duplicate, and delete. Alt bypasses snapping; Escape cancels an active gesture.

## Project files and recovery

Save/Save As use native browser file pickers where supported. Other browsers download a JSON copy; the application reports that a download started rather than claiming a successful disk write. Unsaved work is protected before New/Open and by the browser's navigation prompt. IndexedDB recovery is offered at startup and is separate from a saved project file. Browser storage can be cleared or denied; retain downloaded/saved files.

Version 3 preserves shape parameters, rotation, IDs, and names. Versions 1 and 2 migrate on open; legacy stitch metadata is retained but stitch tools are deferred. Curves, booleans, offsets, export, printing, leather-specific tools, and mobile editing are outside this MVP.

## Code

`src/editor/` contains the controller, renderer, worker client and persistence; `src/model/` contains migration and geometry helpers; `crates/document/` owns validated documents and history in Rust/Wasm. `src/generated/` contains Rust-generated TypeScript contracts; `src/wasm/` is generated and ignored. The Tauri shell remains optional and is not required for browser delivery.
