#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
podman build -t localhost/leather-dev -f tools/dev/Containerfile .
flags=(--rm -v "$PWD:/app:z" -v leather-pattern-designer-node-modules:/app/node_modules -v leather-cargo-registry:/usr/local/cargo/registry -v leather-browser-cache:/root/.cache/ms-playwright -w /app)
if [[ -t 0 && -t 1 ]]; then flags+=(-it); fi
case "${1:-}" in
  dev) shift; flags+=(-p 127.0.0.1:5174:5173); set -- sh -c 'npm ci && npm run wasm && npm run dev' ;;
  preview) shift; flags+=(-p 127.0.0.1:5174:5173); set -- npm run preview ;;
  check) shift; set -- sh -c 'npm ci && npm run test:rust && npm run build && npm test && npx playwright install chromium firefox webkit && npm run test:e2e' ;;
esac
if [[ $# -eq 0 ]]; then set -- bash; fi
exec podman run "${flags[@]}" localhost/leather-dev "$@"
