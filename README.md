# Leather Studio

An offline-capable browser-based precision 2D pattern editor built with Vue 3, TypeScript, Canvas 2D and Rust/Wasm. Inspired by Plasticity's focused workspace; no 3D, accounts, server-side document processing, or installation required.

## Run with Podman

```
tools/dev/run.sh dev
```

Open **http://127.0.0.1:5174/**. This builds the Node/Rust toolchain image, installs locked dependencies, generates Wasm, and starts Vite. Stop another server using port 5174 first. Source changes reload; Rust changes require rerunning `npm run wasm` in the container.

```
tools/dev/run.sh check
```

Runs Rust tests, generated TypeScript contracts, production build, unit tests, and Chromium/Firefox/WebKit acceptance tests. Browser dependencies are installed inside the container. To test offline behavior, build and run `tools/dev/run.sh preview`; development mode intentionally does not register a service worker. Offline use starts after the first successful online load and cache installation. Serve deployments over HTTPS (localhost also works).

## User manual

Open the ? link in the editor for the bundled, searchable user manual, or visit `/manual/index.html`. Sources live in [docs/manual](docs/manual/home.md).

## Project files and recovery

Projects save as version 5. Per-shape affine transforms preserve exact stretched arcs, rounded corners, and sheared shapes. Versions 1–4 open through migration; older application builds cannot open version-5 files. Inspector dimensions follow transformed local axes; stretched primitive radii are labeled as local dimensions.

Save/Save As use native browser file pickers where supported. Other browsers download a JSON copy; the application reports that a download started rather than claiming a successful disk write. Unsaved work is protected before New/Open and by the browser's navigation prompt. IndexedDB recovery is offered at startup and is separate from a saved project file. Browser storage can be cleared or denied; retain downloaded/saved files.

Version 4 preserves shape parameters, rotation, circular arc sweeps, IDs, and names. Versions 1–3 migrate on open; legacy stitch metadata is retained but stitch tools are deferred. Booleans, offsets, export, printing, leather-specific tools, and mobile editing are outside this MVP.

## Code

`src/editor/` contains the controller, renderer, worker client and persistence; `src/model/` contains migration and geometry helpers; `crates/document/` owns validated documents and history in Rust/Wasm. `src/generated/` contains Rust-generated TypeScript contracts; `src/wasm/` is generated and ignored. The Tauri shell remains optional and is not required for browser delivery.
