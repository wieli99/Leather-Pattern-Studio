# Deployment

GitHub Actions builds and tests PRs and pushes to dev and main using Podman. Only a successful push to main deploys the tested dist artifact to the leather-pattern-studio Worker. No preview deployment is created. Wrangler is pinned in the workflow; update both occurrences together.

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
2. Implement the change, update the bundled manual for user-visible behavior changes, and run relevant tests using Podman.
3. Open a PR into `dev`. Merge after required checks pass; do not push directly to protected branches.
4. Review Dependabot PRs in the same way. They update `dev` and reach production in a subsequent release; prioritize releases for urgent security fixes.

CI checks PRs and pushes to both branches. It runs Rust tests, the TypeScript/production build, unit tests, and Playwright on Chromium, Firefox, and WebKit. Development changes do not deploy a preview site.

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
3. Review and commit both files as a separate version-bump commit. Merge the preparation PR into `dev` after checks pass.
4. Open a `dev` → `main` release PR with the target version, resulting behavior, breaking changes if any, and validation results.
5. Merge after checks pass. Every push to `main` runs checks again, then deploys the tested `dist/` artifact to the production Worker. A failed check prevents deployment.
6. Verify the production workflow and smoke-test the deployed app. Merge `main` back into `dev` through a PR to keep the branch histories synchronized; merge any emergency fixes back as well.

The build reads `package.json` to display the application version. Version selection and bumping are manual: CI does not enforce a new version, create tags, or publish GitHub Release entries. Never reuse an already published version for changed application contents. Production deployments are serialized and stale main commits are skipped.

## Repository security

Dependabot monitors dependencies and opens update PRs; review them before merging. In repository Settings → Advanced Security, enable Secret Protection and push protection, and configure CodeQL default setup for JavaScript/TypeScript and Rust. Review findings under Security → Code scanning. These are repository settings, separate from personal push protection, and are not enabled merely by adding the deployment workflow. Making CodeQL findings block merges requires separate merge-protection configuration.

### Dependency compatibility

Keep `@types/node` on Node 22 to match the build container and deployment tooling. TypeScript 7 is deferred because the current `vue-tsc` integration imports `typescript/lib/tsc`, which TypeScript 7 does not export. Dependabot ignores those upgrades until the toolchain is migrated; compatible updates remain enabled. Revisit these limits when updating the runtime or Vue type checker.

CI uploads and downloads the production artifact and compares its contents before merging dependency updates, exercising both artifact actions without deploying a PR.

## Domains and verification

Use the Worker's workers.dev URL while DNS activation is pending. Once wieli.at is active in Cloudflare, attach leather.wieli.at under Worker Settings / Domains & Routes / Add / Custom Domain. This requires no workflow change. Do not add a routes list to Wrangler unless you intend to manage domain bindings in source control.

After deployment verify editor startup and Wasm loading, the bundled manual, project save/open, offline use after cache installation, and the update prompt across two releases. Save projects before accepting an update. Browser storage is hostname-specific: export projects on the temporary address and open them on the final address. Browser CI results do not establish physical device compatibility.

## Rollback

Use the Worker's Deployments dashboard to roll back to a previous successful deployment. Then revert the faulty change through dev and main so the next automated deployment retains the correction. Verify offline/update behavior after rollback; installed clients may still have cached assets until they accept an update.
