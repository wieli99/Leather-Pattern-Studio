#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
task_dmg_target=${1:?Pass the Rust macOS target}
case "$task_dmg_target" in
  x86_64-apple-darwin) task_dmg_arch=x64 ;;
  aarch64-apple-darwin) task_dmg_arch=aarch64 ;;
  *) echo "Unsupported macOS target: $task_dmg_target" >&2; exit 1 ;;
esac
task_dmg_product=$(node -p 'require("./src-tauri/tauri.conf.json").productName')
task_dmg_version=$(node -p 'require("./package.json").version')
task_dmg_bundle="$PWD/src-tauri/target/$task_dmg_target/release/bundle"
task_dmg_app="$task_dmg_bundle/macos/$task_dmg_product.app"
test -d "$task_dmg_app"
task_dmg_stage=$(mktemp -d)
trap 'rm -rf "$task_dmg_stage"' EXIT
ditto "$task_dmg_app" "$task_dmg_stage/$task_dmg_product.app"
ln -s /Applications "$task_dmg_stage/Applications"
codesign --verify --deep --strict "$task_dmg_stage/$task_dmg_product.app"
mkdir -p "$task_dmg_bundle/dmg"
task_dmg_output="$task_dmg_bundle/dmg/${task_dmg_product}_${task_dmg_version}_${task_dmg_arch}.dmg"
hdiutil create -volname "$task_dmg_product" -srcfolder "$task_dmg_stage" -fs HFS+ -format UDZO -ov "$task_dmg_output"
hdiutil verify "$task_dmg_output"
