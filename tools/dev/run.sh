#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
dev_image=localhost/leather-dev
dev_containerfile=tools/dev/Containerfile
dev_node_modules=leather-pattern-designer-node-modules
if [[ "${1:-}" == manual-check ]]; then
  dev_node_modules=leather-pattern-designer-manual-node-modules
  dev_image=localhost/leather-browser
  dev_containerfile=tools/dev/Browser.Containerfile
fi
podman build -t "$dev_image" -f "$dev_containerfile" .
flags=(--rm -e VITE_CACHE_DIR=/tmp/leather-vite -v "$PWD:/app:z" -v "$dev_node_modules:/app/node_modules" -v leather-cargo-registry:/usr/local/cargo/registry -v leather-browser-cache:/root/.cache/ms-playwright -w /app)
if [[ -t 0 && -t 1 ]]; then flags+=(-it); fi
case "${1:-}" in
  dev) shift; flags+=(-p 127.0.0.1:5174:5173); set -- sh -c 'npm ci && npm run wasm && npm run dev' ;;
  preview) shift; flags+=(-p 127.0.0.1:5174:5173); set -- npm run preview ;;
  fast) shift; set -- sh -c 'npm ci && npm run check:fast' ;;
  manual-check) shift; set -- sh -c 'npm ci && npx playwright install chromium && npm run manual:screenshots:check' ;;
  check) shift; set -- sh -c 'npm ci && npm run test:rust && npm run build && npm test && npx playwright install chromium firefox webkit && npm run test:e2e' ;;
esac
if [[ $# -eq 0 ]]; then set -- bash; fi
exec podman run "${flags[@]}" "$dev_image" "$@"
