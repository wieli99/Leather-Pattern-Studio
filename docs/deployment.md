# Deployment

GitHub Actions builds PRs and pushes to dev and main using Podman, then runs browser engines in parallel on standard Ubuntu runners. Only a successful push to main deploys the tested dist artifact to the leather-pattern-studio Worker. No preview deployment is created. Wrangler is pinned in the workflow; update both occurrences together.

## Maintainer setup

These settings apply to the upstream repository. Contributors do not need Cloudflare access or production credentials. Fork maintainers should configure their own Worker name and account before enabling production deployment.

1. Create `dev` from `main` if needed and make `dev` the GitHub default branch.
2. Protect main: require a pull request and the Build and test check, block force pushes and deletion. Release PRs should come from dev. Protect dev with the same test requirement.
3. Create a GitHub environment named production. Restrict deployment branches to main. Add secret CLOUDFLARE_API_TOKEN and variable CLOUDFLARE_ACCOUNT_ID. Create the token in Cloudflare with Account / Workers Scripts / Edit restricted to your account. Never commit credentials.
4. Disable Cloudflare Git build triggers if connected. GitHub Actions owns deployment.
5. Keep Access scoped to previews only if production should be public. Keep domain and Access settings in the Cloudflare dashboard.
6. Enable Dependabot alerts and security updates in GitHub security settings. Security-update PRs target the default branch (dev); weekly version updates also target dev. Review and test updates before merging.

## Development workflow

1. Start from an updated upstream `dev` and create a feature or fix branch. External contributors work in a fork and target upstream `dev` with their PR.
2. Implement the change and run focused tests and necessary UI inspection using Podman. Defer bundled manual edits and screenshot refreshes until PR preparation. For user-visible changes with deferred documentation, add a short `Pending documentation` checklist to the commit body naming the changed behavior, affected manual pages, and screenshots to review or refresh; report pending work explicitly.
3. Before opening a PR, review the feature branch's commit messages, resolve the accumulated documentation checklist, and update affected procedures, shortcuts, and screenshots together. Verify manual links and instructions against the final implementation and complete the validation below. Include documentation and screenshot updates in the same PR as the behavior changes. Open the PR into `dev` and merge after required checks pass; do not push directly to protected branches.
4. Review Dependabot PRs in the same way. They update `dev` and reach production in a subsequent release; prioritize releases for urgent security fixes.

The Podman runner keeps Vite's optimizer cache in container-local temporary storage, separate from the shared dependency volume. This prevents dependency installs in validation containers from deleting a running dev server's optimized modules. After changing dependencies, restart your development server and reload open editor/manual tabs. If an older running container reports `504 Outdated Optimize Dep` or a module MIME-type error, stop it and rerun `tools/dev/run.sh dev` to pick up the isolated-cache setting.

### Validation cadence

Between commits, run focused tests for the changed behavior. For a frontend TypeScript and unit-test pass, use `tools/dev/run.sh fast`. It installs locked dependencies but reuses generated Wasm/contracts: on a fresh checkout or after Rust/contract changes, run `tools/dev/run.sh npm run wasm` first. Regenerate these outputs and run `tools/dev/run.sh npm run test:rust` when Rust or document contracts change. This fast pass does not validate production assets or browser behavior.

Before preparing a PR for editor changes, run `tools/dev/run.sh check` once. After subsequent edits, repeat affected checks; rerun the full suite when failures or unresolved concerns warrant it. For manual illustration changes, build production assets and run `tools/dev/run.sh manual-check`. A full suite is not required before each individual commit.

CI retains full validation on every PR and protected-branch push:
- One Podman job runs Rust tests, the production build and unit tests, validates the deployment bundle, and uploads the production assets plus generated Wasm/contracts.
- Three parallel jobs each run one browser engine's production and source-module tests against those same outputs inside the Debian reference browser container. Each retains one Playwright worker and installs only its engine.
- A parallel manual job checks every illustration against the shared production build in a Debian browser container with the same browser dependencies as the development container.
- The required **Build and test** gate succeeds only when the build, every browser job, and screenshot verification succeed. Failed, cancelled or skipped dependencies block it.
- Reports are stored separately for each engine and manual verification. Superseded runs of the same PR are cancelled; protected-branch runs and production deployments are not cancelled by this policy.

All web validation and deployment jobs use standard `ubuntu-24.04` runners. Desktop packaging uses the OS/architecture matrix described below. Standard hosted runner execution is free for this public repository; no larger runners are configured. PR merge commits and protected-branch pushes remain independently validated. No browser coverage is deferred to prerelease, and development changes do not deploy a preview site.

Deployment downloads the same production artifact consumed by validation. A successful release PR does not bypass validation of the subsequent main push.

## Versioning and releases

Use [Semantic Versioning](https://semver.org/) (`MAJOR.MINOR.PATCH`) as the application's release convention:

- Patch: backward-compatible bug fixes, for example `0.1.0` → `0.1.1`.
- Minor: new functionality, for example `0.1.1` → `0.2.0`.
- Major: breaking compatibility after the stable `1.0.0` release, for example `1.2.3` → `2.0.0`.

During initial `0.x` development, minor releases may contain breaking changes; describe them in release notes. Preserve existing project migrations as required by the architecture. The application release version and saved-document format version are separate.

Maintainers prepare one version bump per release; ordinary contribution PRs do not need a version bump:

1. Create a release-preparation branch from updated `dev`.
2. Run the version command in the project container:

   ```bash
   tools/dev/run.sh npm version patch --no-git-tag-version
   ```

   Replace `patch` with `minor`, `major`, or an explicit version such as `0.2.0`. This updates `package.json` and `package-lock.json` without creating a Git commit or tag.
3. Refresh the manual illustrations in the same Podman environment as CI. On a fresh environment, first run `tools/dev/run.sh sh -c 'npm ci && npx playwright install chromium'` to populate dependencies and the browser cache:

   ```bash
   tools/dev/run.sh npm run build
   tools/dev/run.sh npm run manual:screenshots:update
   tools/dev/run.sh npm run build
   tools/dev/run.sh npm run manual:screenshots:check
   ```

   The first build supplies the current editor for captures; the second packages the refreshed images into the offline manual. Review every changed image alongside its article and commit the refreshed images in the preparation PR. The check command regenerates screenshots in memory and compares their pixels with the committed files (zero differing pixels after Playwright’s 0.1 perceptual threshold for rasterization noise); differences fail the required CI gate before deployment. Failure reports include actual, expected, and difference images under `test-results/manual/` and `playwright-report/manual/`. Do not update images merely to silence a failure: first check the UI and documentation agree.

   Captures use Chromium at 1280×800 and scale 1 in the Debian reference environment. CI uses `tools/dev/Browser.Containerfile`, which installs the same browser dependencies as the development container without the Rust toolchain. Each test starts with clean browser storage; locale, timezone, color scheme and reduced motion are fixed. `tests/manual-capture.ts` captures stable frames with animations and carets hidden. Existing browser scenarios supply the illustrated interaction and assert its state. Every referenced illustration must be captured in each run. Ordinary browser tests never update source illustrations. Add a named capture call and the `@manual` test tag when adding a manual image; remove its asset and capture when retiring it. Keep Playwright and the container environment aligned when updating dependencies.

4. Review and commit both files as a separate version-bump commit. Merge the preparation PR into `dev` after checks pass.
5. Open a `dev` → `main` release PR with the target version, resulting behavior, breaking changes if any, and validation results.
6. Merge after checks pass. Every push to `main` runs checks again, then deploys the tested `dist/` artifact to the production Worker. A failed check prevents deployment.
7. Verify the production workflow and smoke-test the deployed app. Merge `main` back into `dev` through a PR to keep the branch histories synchronized; merge any emergency fixes back as well.

The build reads `package.json` to display the application version. Version selection and bumping are manual: CI does not enforce a new version, create tags, or publish GitHub Release entries. Never reuse an already published version for changed application contents. Production deployments are serialized and stale main commits are skipped.

## Repository security

Dependabot monitors dependencies and opens update PRs; review them before merging. In repository Settings → Advanced Security, enable Secret Protection and push protection, and configure CodeQL default setup for JavaScript/TypeScript and Rust. Review findings under Security → Code scanning. These are repository settings, separate from personal push protection, and are not enabled merely by adding the deployment workflow. Making CodeQL findings block merges requires separate merge-protection configuration.

### Dependency compatibility

Keep `@types/node` on Node 22 to match the build container and deployment tooling. TypeScript 7 is deferred because the current `vue-tsc` integration imports `typescript/lib/tsc`, which TypeScript 7 does not export. Dependabot ignores those upgrades until the toolchain is migrated; compatible updates remain enabled. Revisit these limits when updating the runtime or Vue type checker.

Playwright is pinned to 1.64.1 while [the Firefox file chooser regression in 1.65.0](https://github.com/microsoft/playwright/issues/43994) remains unresolved. Dependabot skips 1.65.x; verify project Open and file import on Firefox before accepting a later version.

CI uploads and downloads the production artifact and compares its contents before merging dependency updates, exercising both artifact actions without deploying a PR. The immediate compatibility download uses the upload’s artifact ID and the REST API after a bounded visibility check, avoiding transient name-lookup failures immediately after upload finalization. Missing artifacts still fail validation.

## Domains and verification

Use the Worker's workers.dev URL while DNS activation is pending. Once wieli.at is active in Cloudflare, attach leather.wieli.at under Worker Settings / Domains & Routes / Add / Custom Domain. This requires no workflow change. Do not add a routes list to Wrangler unless you intend to manage domain bindings in source control.

After deployment verify editor startup and Wasm loading, the bundled manual, project save/open, offline use after cache installation, and the update prompt across two releases. Save projects before accepting an update. Browser storage is hostname-specific: export projects on the temporary address and open them on the final address. Browser CI results do not establish physical device compatibility.

For the manual, wait until the editor's service worker controls the page, then open Help in a new tab, reload normally, and open an article offline. Repeat after accepting an update from the previous release. A hard reload bypasses the worker and cannot validate this behavior. Cloudflare redirects `/manual/index.html` to `/manual/`; the worker must serve cached followed responses without their redirect metadata to avoid browser `ERR_FAILED` navigation errors. `tests/manual-redirect.spec.ts` reproduces these hosting redirects against the production build. Worker source is included in the offline cache fingerprint so worker-only fixes also replace the cache.

## Rollback

Use the Worker's Deployments dashboard to roll back to a previous successful deployment. Then revert the faulty change through dev and main so the next automated deployment retains the correction. Verify offline/update behavior after rollback; installed clients may still have cached assets until they accept an update.

## Desktop packages

Desktop packages use the same Vue application and Rust/Wasm document engine as the website. `.github/workflows/desktop.yml` builds Linux Flatpak, Windows NSIS, and macOS DMG packages for x64 and ARM64. GitHub Actions artifacts are available for PR verification. A `vVERSION` tag matching `package.json`, on a commit contained in main with a successful Build and test check, creates a draft release after all packages build. Review the packages and generated SHA256SUMS before publishing the draft. A hyphenated version creates a prerelease. No publisher certificates or updater signing secrets are used.

On Linux install the matching GitHub bundle with `flatpak install --user ./Leather-Pattern-Studio-x86_64.flatpak` (or aarch64), then launch `flatpak run studio.leather.pattern-designer`. Flathub supplies the GNOME runtime; installing may require network access. Install a newer bundle the same way to update. No system layering or OS package installation is needed on Bluefin. Flatpak launcher integration registers `.leather`; choose the application in your file manager's Open With dialog if needed.

Windows packages are unsigned and may show publisher warnings or be blocked by Smart App Control or organization policy. macOS packages are ad-hoc signed without notarization; users may need to allow the application in Privacy & Security. Do not promise that unsigned packages run under every security policy.

The desktop application queries published GitHub Releases automatically once per launch. Background failures remain silent; Settings → Check for updates retries manually and reports failures. Stable installations exclude prereleases. An available update links to its release page; installation is manual. No private download server is required. Validate native dialogs, file associations, clipboard, offline help, exports and upgrade behavior on each target before publishing. Build success and browser-engine tests alone do not establish native OS compatibility.

Require **Desktop build and test** alongside **Build and test** in branch protection. This additional gate fails when any desktop package job fails or is skipped; it does not certify physical-device validation.

The Linux bundle disables WebKit DMA-BUF rendering because the native Wayland launch failed with a protocol error on the reference Bluefin host; the same installed app stayed running with this workaround. Reassess it when updating WebKit/runtime versions. This can affect rendering performance and does not establish compatibility with every GPU.

Desktop CI builds optimized Wasm and the Vue frontend once in the Linux project container, then downloads the identical frontend and generated source into all six native build jobs. The CI-only Tauri configuration disables the redundant frontend hook; local desktop builds retain the normal hook. This avoids the unavailable wasm-opt binary on Windows ARM. Native Rust tests run against release builds on their explicit target architecture.

Linux desktop jobs use `tools/dev/Desktop.Containerfile` (Node 22, Rust 1.90 and Debian Trixie desktop libraries); browser jobs use the existing Debian reference browser container. This keeps dependencies aligned with local validation and avoids failing Ubuntu runner package mirrors. Linux packaging uses a privileged disposable CI container solely to permit Flatpak’s nested mount/user namespaces; it receives no deployment credentials.

The desktop container uses Flatpak Builder 1.4 or newer with host AppStream composition, matching the GNOME 50 SDK. macOS builds sign the `.app` ad hoc through Tauri, then create and verify a read-only DMG directly with `hdiutil`; the image contains the app and Applications shortcut without Finder layout automation or mounted-image eject races. Window creation uses async commands to avoid the documented WebView2 synchronous-command deadlock. Native Quit and window close share the unsaved-change decision; the editor is inert until that bridge is registered.
