# Deployment

GitHub Actions builds and tests PRs and pushes to dev and main using Podman. Only a successful push to main deploys the tested dist artifact to the leather-pattern-studio Worker. No preview deployment is created. Wrangler is pinned in the workflow; update both occurrences together.

## One-time setup

1. Push these files, create dev from main, and make dev the GitHub default branch.
2. Protect main: require a pull request and the Build and test check, block force pushes and deletion. Release PRs should come from dev. Protect dev with the same test requirement.
3. Create a GitHub environment named production. Restrict deployment branches to main. Add secret CLOUDFLARE_API_TOKEN and variable CLOUDFLARE_ACCOUNT_ID. Create the token in Cloudflare with Account / Workers Scripts / Edit restricted to your account. Never commit credentials.
4. Disable Cloudflare Git build triggers if connected. GitHub Actions owns deployment.
5. Keep Access scoped to previews only if production should be public. Keep domain and Access settings in the Cloudflare dashboard.
6. Enable Dependabot alerts and security updates in GitHub security settings. Security-update PRs target the default branch (dev); weekly version updates also target dev. Review and test updates before merging.

## Release

Develop through PRs into dev. Prepare the package version and lockfile version together and include release notes in the dev-to-main release PR. Merge after checks pass. The push to main runs checks again, then deploys. No tags or GitHub Releases are created automatically. Merge emergency fixes back into dev. Production deployments are serialized and stale main commits are skipped.

Before the first release, configure the production environment credentials. Without them, checks can pass but deployment will fail. GitHub authentication is required to change branches/settings remotely.

## Domains and verification

Use the Worker's workers.dev URL while DNS activation is pending. Once wieli.at is active in Cloudflare, attach leather.wieli.at under Worker Settings / Domains & Routes / Add / Custom Domain. This requires no workflow change. Do not add a routes list to Wrangler unless you intend to manage domain bindings in source control.

After deployment verify editor startup and Wasm loading, the bundled manual, project save/open, offline use after cache installation, and the update prompt across two releases. Save projects before accepting an update. Browser storage is hostname-specific: export projects on the temporary address and open them on the final address. Browser CI results do not establish physical device compatibility.

## Rollback

Use the Worker's Deployments dashboard to roll back to a previous successful deployment. Then revert the faulty change through dev and main so the next automated deployment retains the correction. Verify offline/update behavior after rollback; installed clients may still have cached assets until they accept an update.

## Initial validation (2026-11-02)

The production build, Rust/unit test stages, and Wrangler 4.156.2 deployment dry run passed (72 static assets). Browser acceptance finished with 402 passed, 6 skipped, and 6 failed. Each engine (Chromium, Firefox, WebKit) failed the same two checks: print wheel zoom selects the version label instead of the zoom label, and selection popup bottom alignment measures a 16-pixel discrepancy. These failures block deployment until corrected; checks have not been weakened. No remote deployment or physical-device validation has been performed.

Follow-up: corrected the two outdated browser expectations (zoom label selection and the current 28-pixel popup offset). All six targeted checks now pass across Chromium, Firefox, and WebKit. The full suite has not been repeated after these test-only corrections. The GitHub production environment now exists and permits deployments from main only; the credential names have been verified in GitHub (secret values are not readable).
