# Repository Guidelines

## Project Structure & Module Organization

`src/main.ts` mounts the Vue application. `src/vue/` contains Vue single-file components, typed subscription composables, and keyboard bindings. `src/editor/` contains the independent editor controller, Canvas renderer, worker client, and browser persistence. `src/model/` contains geometry helpers and project migration. `crates/document/` owns typed documents, validation, and history in Rust/Wasm. `src/generated/` contains generated contracts; regenerate rather than editing them. `src/wasm/`, `dist/`, and test reports are generated artifacts. Browser acceptance tests live in `tests/`; unit tests sit beside their modules as `*.test.ts`. `src-tauri/` is optional future desktop packaging.

## Build, Test, and Development Commands

Use **Podman** for servers, dependency installation, builds, and tests. This Bluefin host is immutable; do not install toolchains on the host.

- `tools/dev/run.sh dev`: install locked dependencies, generate Wasm, and serve at `http://127.0.0.1:5174`.
- `tools/dev/run.sh check`: run Rust tests, production build, unit tests, and three-engine browser tests.
- `tools/dev/run.sh npm run build`: generate contracts/Wasm, check TypeScript, and build offline assets.
- `tools/dev/run.sh preview`: serve an existing production build, including offline support.

## Coding Style & Architecture

Use Vue Composition API with `<script setup lang="ts">`, strict TypeScript, two-space indentation, PascalCase component/type names, and camelCase functions. Use rustfmt for Rust. No frontend formatter or linter is configured. Keep edits focused and split UI, controller, geometry, and persistence responsibilities.

Geometry uses double-precision millimetres. Screen coordinates must not change saved dimensions. Committed document state and history belong to Rust; pointer previews never mutate history. Preserve project migrations and inactive legacy stitch metadata.

## Testing Guidelines

Run Vitest unit tests, Rust tests, and Playwright acceptance tests for meaningful editor changes. Test cancellation, invalid geometry, transaction boundaries, stale responses, and project round trips. Offline tests require the production build. No coverage percentage is mandated. Record browser-engine results separately from physical operating-system/device validation.

## Commits & Pull Requests

No established Git history convention exists. Use concise imperative commit subjects. PRs should describe resulting behavior, validation, remaining limitations, and linked issues. Include screenshots for UI changes. Do not claim completion based only on a successful build.

## User manual maintenance

Keep `docs/manual/` updated with every user-visible behavior change in the same change. Update affected procedures, shortcut references, and screenshots. Verify internal links and instructions against the implementation before reporting completion. The bundled manual is opened through the ? link and must remain available offline.
