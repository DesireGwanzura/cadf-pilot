#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
gemini_bin="${CADF_GEMINI_BIN:-$HOME/Documents/Codex/tools/cadf/node_modules/.bin/gemini}"
if [[ ! -x "$gemini_bin" ]]; then
  echo 'Gemini CLI not found. Set CADF_GEMINI_BIN to your installed executable.' >&2
  exit 1
fi
node_bin="${CADF_NODE_BIN:-$(command -v node)}"
if [[ -x "$HOME/.nvm/versions/node/v24.15.0/bin/node" ]]; then
  node_bin="${CADF_NODE_BIN:-$HOME/.nvm/versions/node/v24.15.0/bin/node}"
fi
exec env -u GEMINI_API_KEY -u GOOGLE_API_KEY -u GOOGLE_APPLICATION_CREDENTIALS -u GOOGLE_CLOUD_PROJECT -u GOOGLE_CLOUD_LOCATION -u GOOGLE_GENAI_USE_VERTEXAI "$node_bin" "$gemini_bin" --approval-mode plan "$@"
