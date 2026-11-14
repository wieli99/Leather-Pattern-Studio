# Contributor and Agent Guidelines

## Project Structure & Module Organization

`src/main.ts` mounts the Vue application. `src/vue/` contains Vue single-file components, typed subscription composables, and keyboard bindings. `src/editor/` contains the independent editor controller, Canvas renderer, worker client, and browser persistence. `src/model/` contains geometry helpers and project migration. `crates/document/` owns typed documents, validation, and history in Rust/Wasm. `src/generated/` contains generated contracts; regenerate rather than editing them. `src/wasm/`, `dist/`, and test reports are generated artifacts. Browser acceptance tests live in `tests/`; unit tests sit beside their modules as `*.test.ts`. `src-tauri/` owns native desktop windows, file access, and platform integration; `packaging/` contains Flatpak metadata. Desktop builds share the Vue editor and Rust/Wasm engine with the website.

## Build, Test, and Development Commands

Prefer the provided **Podman** workflow for a reproducible Node.js, Rust/Wasm, and browser-test environment matching CI. It requires Bash and a working Podman installation. Contributors may use an equivalent local environment; use `tools/dev/Containerfile` and `package-lock.json` as the toolchain and dependency references. Do not assume a particular operating system or install system tools without the contributor's agreement.

- `tools/dev/run.sh dev`: install locked dependencies, generate Wasm, and serve at `http://127.0.0.1:5174`.
- `tools/dev/run.sh fast`: install locked dependencies, check TypeScript, and run unit tests using existing generated Wasm/contracts. Run `tools/dev/run.sh npm run wasm` first on a fresh checkout or after Rust/contract changes.
- `tools/dev/run.sh check`: run Rust tests, production build, unit tests, and three-engine browser tests.
- `tools/dev/run.sh manual-check`: verify all manual screenshots against an existing production build in the reference browser container.
- `tools/dev/run.sh npm run build`: generate contracts and release-optimized Wasm, check TypeScript, and build offline assets.
- `tools/dev/run.sh npm run wasm`: generate contracts and development Wasm; used by the development runner.
- `tools/dev/run.sh npm run wasm:release`: generate contracts and release-optimized Wasm; used by production builds.
- `tools/dev/run.sh preview`: serve an existing production build, including offline support.

## Coding Style & Architecture

Use Vue Composition API with `<script setup lang="ts">`, strict TypeScript, two-space indentation, PascalCase component/type names, and camelCase functions. Use rustfmt for Rust. No frontend formatter or linter is configured. Keep edits focused and split UI, controller, geometry, and persistence responsibilities.

Geometry uses double-precision millimetres. Screen coordinates must not change saved dimensions. Committed document state and history belong to Rust; pointer previews never mutate history. Preserve project migrations and inactive legacy stitch metadata.

For every numeric input you implement or change, verify valid bounds and steps for typing, arrow keys, and Alt+scroll, including modifier keys and boundary values.

## Testing Guidelines

Between commits, run focused tests for the behavior changed; use `tools/dev/run.sh fast` for a frontend TypeScript/unit pass. Regenerate Wasm/contracts and run Rust tests when Rust or document contracts change. Run `tools/dev/run.sh check` once before preparing a PR for meaningful editor changes; after further edits, repeat affected checks rather than the entire suite unless new failures or unresolved concerns justify it. CI independently runs full validation on PRs and protected-branch pushes. Test cancellation, invalid geometry, transaction boundaries, stale responses, and project round trips. For changes in `src-tauri/`, run native Rust tests with `cargo test --release --locked --manifest-path src-tauri/Cargo.toml` inside the toolchain from `tools/dev/Desktop.Containerfile` and exercise the affected desktop flow. Desktop CI builds and tests both CPU architectures for Linux, Windows, and macOS. Offline tests require the production build. No coverage percentage is mandated. Record browser-engine results separately from physical operating-system/device validation.

## Commits & Pull Requests

Use concise imperative commit subjects. Keep changes focused and avoid unrelated generated artifacts. PRs should describe resulting behavior, validation, remaining limitations, and linked issues. Include screenshots for UI changes. Do not claim completion based only on a successful build.

## User manual maintenance

Batch updates to `docs/manual/` and screenshot refreshes during PR preparation, after the behavior and UI have settled. Complete affected procedures, shortcut references, and screenshots in the same PR as the user-visible changes, before opening it. Intermediate tasks and commits may leave documentation pending; report that explicitly rather than claiming PR readiness.

When committing user-visible changes with deferred documentation, include a short `Pending documentation` checklist in the commit body naming the changed behavior, affected manual pages, and screenshots to review or refresh. During PR preparation, review the feature branch's commit messages and resolve the accumulated checklist. Continue focused tests and necessary UI inspection during implementation; deferring documentation does not defer behavior validation. Verify manual links and instructions against the final implementation and run the required screenshot checks before reporting PR readiness. The bundled manual is opened through the ? link and must remain available offline.

## Development and releases

Follow [the development and release workflow](docs/deployment.md) when preparing branches, dependency updates, or releases. Create feature/fix branches from updated `dev` and submit PRs to `dev`. External contributors should work in a fork and target the upstream `dev` branch. Maintainers use `dev` → `main` PRs for releases. Both branches require passing checks. Every successful `main` push deploys to Cloudflare, so treat merging a release PR as publishing.

Use semantic versioning by convention. Before a release, prepare a separate version-bump commit on a branch from `dev`, updating `package.json` and `package-lock.json` together with `tools/dev/run.sh npm version patch --no-git-tag-version` (or `minor`, `major`, or an explicit version). Merge it through a PR into `dev` before opening the release PR. Release preparation is a maintainer responsibility; ordinary contribution PRs do not need version bumps. Versions, tags, and GitHub Releases are not generated automatically. Do not change the Rust document/file-format version merely to bump the application release version.

## Security and credentials

Never commit API tokens, credentials, or local environment secrets. Cloudflare deployment credentials belong in the upstream repository's GitHub production environment; they are not needed to develop or test contributions. Review dependency updates and security findings before merging. Security scanning and deployment settings are documented in [docs/deployment.md](docs/deployment.md).
