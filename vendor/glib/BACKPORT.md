# glib security backport

Source: crates.io glib 0.18.5, copied without changing its version or API. Original license files are retained. The original crates.io archive SHA-256 is `233daaf6e83ae6a12a52055f568f9d7cf4671dabb78ff9560ab6da230ce00ee5`; upstream source revision is `42b9caf98e03ded086362d9653ca58fe94dc8658`.

Advisory: RUSTSEC-2024-0429 / GHSA-wrw7-89jp-8q8g.
Upstream fix: https://github.com/gtk-rs/gtk-rs-core/pull/1343

The only Rust source change makes the output pointer in VariantStrIter::impl_get mutable and passes &mut p to g_variant_get_child. This removes the undefined behavior in the upstream advisory. Version-only scanners can still flag 0.18.5; do not ignore unrelated advisories.

Cargo's application-level patch routes the GTK 0.18 dependency graph through this copy. Remove it once the complete Tauri Linux dependency chain supports a fixed upstream release (glib >=0.20). Keep optimized iterator regression tests when removing it.
