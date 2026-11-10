# Contributor and Agent Guidelines

## Project Structure & Module Organization

`src/main.ts` mounts the Vue application. `src/vue/` contains Vue single-file components, typed subscription composables, and keyboard bindings. `src/editor/` contains the independent editor controller, Canvas renderer, worker client, and browser persistence. `src/model/` contains geometry helpers and project migration. `crates/document/` owns typed documents, validation, and history in Rust/Wasm. `src/generated/` contains generated contracts; regenerate rather than editing them. `src/wasm/`, `dist/`, and test reports are generated artifacts. Browser acceptance tests live in `tests/`; unit tests sit beside their modules as `*.test.ts`. `src-tauri/` is optional future desktop packaging.

## Build, Test, and Development Commands

Prefer the provided **Podman** workflow for a reproducible Node.js, Rust/Wasm, and browser-test environment matching CI. It requires Bash and a working Podman installation. Contributors may use an equivalent local environment; use `tools/dev/Containerfile` and `package-lock.json` as the toolchain and dependency references. Do not assume a particular operating system or install system tools without the contributor's agreement.

- `tools/dev/run.sh dev`: install locked dependencies, generate Wasm, and serve at `http://127.0.0.1:5174`.
- `tools/dev/run.sh check`: run Rust tests, production build, unit tests, and three-engine browser tests.
- `tools/dev/run.sh npm run build`: generate contracts and release-optimized Wasm, check TypeScript, and build offline assets.
- `tools/dev/run.sh npm run wasm`: generate contracts and development Wasm; used by the development runner.
- `tools/dev/run.sh npm run wasm:release`: generate contracts and release-optimized Wasm; used by production builds.
- `tools/dev/run.sh preview`: serve an existing production build, including offline support.

## Coding Style & Architecture

Use Vue Composition API with `<script setup lang="ts">`, strict TypeScript, two-space indentation, PascalCase component/type names, and camelCase functions. Use rustfmt for Rust. No frontend formatter or linter is configured. Keep edits focused and split UI, controller, geometry, and persistence responsibilities.

Geometry uses double-precision millimetres. Screen coordinates must not change saved dimensions. Committed document state and history belong to Rust; pointer previews never mutate history. Preserve project migrations and inactive legacy stitch metadata.

## Testing Guidelines

Run Vitest unit tests, Rust tests, and Playwright acceptance tests for meaningful editor changes. Test cancellation, invalid geometry, transaction boundaries, stale responses, and project round trips. Offline tests require the production build. No coverage percentage is mandated. Record browser-engine results separately from physical operating-system/device validation.

## Commits & Pull Requests

Use concise imperative commit subjects. Keep changes focused and avoid unrelated generated artifacts. PRs should describe resulting behavior, validation, remaining limitations, and linked issues. Include screenshots for UI changes. Do not claim completion based only on a successful build.

## User manual maintenance

Keep `docs/manual/` updated with every user-visible behavior change in the same change. Update affected procedures, shortcut references, and screenshots. Verify internal links and instructions against the implementation before reporting completion. The bundled manual is opened through the ? link and must remain available offline.

## Development and releases

Follow [the development and release workflow](docs/deployment.md) when preparing branches, dependency updates, or releases. Create feature/fix branches from updated `dev` and submit PRs to `dev`. External contributors should work in a fork and target the upstream `dev` branch. Maintainers use `dev` → `main` PRs for releases. Both branches require passing checks. Every successful `main` push deploys to Cloudflare, so treat merging a release PR as publishing.

Use semantic versioning by convention. Before a release, prepare a separate version-bump commit on a branch from `dev`, updating `package.json` and `package-lock.json` together with `tools/dev/run.sh npm version patch --no-git-tag-version` (or `minor`, `major`, or an explicit version). Merge it through a PR into `dev` before opening the release PR. Release preparation is a maintainer responsibility; ordinary contribution PRs do not need version bumps. Versions, tags, and GitHub Releases are not generated automatically. Do not change the Rust document/file-format version merely to bump the application release version.

## Security and credentials

Never commit API tokens, credentials, or local environment secrets. Cloudflare deployment credentials belong in the upstream repository's GitHub production environment; they are not needed to develop or test contributions. Review dependency updates and security findings before merging. Security scanning and deployment settings are documented in [docs/deployment.md](docs/deployment.md).
