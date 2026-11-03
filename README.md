# Leather Pattern Studio

An offline-capable browser-based precision 2D pattern editor built with Vue 3, TypeScript, Canvas 2D and Rust/Wasm. Inspired by Plasticity's focused workspace; no 3D, accounts, server-side document processing, or installation required.

[Open Leather Pattern Studio](https://leather.wieli.at) · [Release notes](CHANGELOG.md)

## Run with Podman

```
tools/dev/run.sh dev
```

Open **http://127.0.0.1:5174/**. This builds the Node/Rust toolchain image, installs locked dependencies, generates Wasm, and starts Vite. Stop another server using port 5174 first. Source changes reload; Rust changes require rerunning `npm run wasm` in the container.

```
tools/dev/run.sh check
```

Runs Rust tests, generated TypeScript contracts, production build, unit tests, and Chromium/Firefox/WebKit acceptance tests. Browser system libraries are baked into the cached development image, using the locked Playwright version, so individual test containers retain the required libraries. Browser binaries use a persistent Podman volume; `check` installs any missing binaries. To test offline behavior, build and run `tools/dev/run.sh preview`; development mode intentionally does not register a service worker. Offline use starts after the first successful online load and cache installation. Serve deployments over HTTPS (localhost also works).

## User manual

Open the ? link in the editor for the bundled, searchable user manual, or visit `/manual/index.html`. Sources live in [docs/manual](docs/manual/home.md).

## Project files and recovery

Projects save as version 18, including linked print layouts, embedded images, text, object groups, indicators, measurements, and attached stitch groups. Versions 1–17 migrate on open; older application builds cannot open version-18 files. Keep backup copies before upgrading.

Save/Save As use native browser file pickers where supported; other browsers download JSON copies. Browser recovery is separate from saved files and can be cleared or evicted. Save before accepting an application update.

## Capabilities and limitations

Draw precise geometry in millimetres, organize objects into groups, import images, add text, measurements and stitch lines, and arrange linked artwork on print pages. Export layouts to PDF, SVG, or PNG. Print at 100% / actual size and measure a known dimension before using a pattern.

The desktop browser workflow is the validation target. CI exercises Chromium, Firefox, and WebKit on Linux; this does not certify physical Windows/macOS devices, native file dialogs, or touch/mobile editing. General-purpose booleans and offsets are outside the supported workflow. Offline use requires an initial successful online load and completed cache installation.

Bug reports may include project contents and system information. Review attachments before submitting a public GitHub issue. See the bundled manual for current procedures and limitations.

## Code

`src/editor/` contains the controller, renderer, worker client and persistence; `src/model/` contains migration and geometry helpers; `crates/document/` owns validated documents and history in Rust/Wasm. `src/generated/` contains Rust-generated TypeScript contracts; `src/wasm/` is generated and ignored. The Tauri shell remains optional and is not required for browser delivery.
