# Release notes

## 0.2.0 — preparation

This release prepares Leather Pattern Studio for public use with refreshed project and validation documentation, updated dependencies and CI tooling, and a documented release workflow.

The current editor supports precision drawing, stitch lines, measurements, text, embedded images, grouping, and linked print layouts with PDF/SVG/PNG export. These capabilities already exist on `main`; they are not all new in this release.

Projects use document format 18. Application version 0.2.0 does not change that format. Older supported projects migrate on opening; retain original backups because older application builds cannot read newer formats. Save projects before accepting an offline application update.

Desktop browser testing covers Chromium, Firefox, and WebKit on Linux. Physical printer scale, native OS dialogs, and real device compatibility require manual verification. Recovery storage is not a substitute for saved project files.

Before publishing: merge the separate manual update and validate the combined release candidate. Tags and GitHub Releases are created manually after release approval.
