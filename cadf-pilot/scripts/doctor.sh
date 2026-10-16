#!/usr/bin/env bash
set -u
printf 'CADF local tooling check (no installation or inference calls)\n'
for tool in git gh node npm python3 codex; do
  if command -v "$tool" >/dev/null 2>&1; then
    printf '%s: %s\n' "$tool" "$(command -v "$tool")"
  else
    printf '%s: unavailable in this shell\n' "$tool"
  fi
done
if [[ -x "$HOME/Documents/Codex/tools/cadf/node_modules/.bin/gemini" ]]; then
  printf 'Gemini CLI: installed in Documents/Codex/tools/cadf; personal-account access was rejected by provider on 2026-10-16\n'
fi
if [[ -d /Applications/Antigravity.app ]]; then
  printf 'Antigravity: installed; installation does not prove account entitlement\n'
fi
if command -v agy >/dev/null 2>&1; then
  printf 'agy: %s\n' "$(command -v agy)"
elif [[ -x "$HOME/.local/bin/agy" ]]; then
  printf 'agy: %s\n' "$HOME/.local/bin/agy"
else
  printf 'agy: unavailable in this shell\n'
fi
if [[ -f "$HOME/.gemini/antigravity-cli/settings.json" ]]; then
  g1_status="$(python3 -c "import json, sys; p=sys.argv[1]; print('disabled (safe)' if json.load(open(p)).get('useG1Credits') is False else 'NOT disabled (paid fallback risk)')" "$HOME/.gemini/antigravity-cli/settings.json" 2>/dev/null || echo "read error")"
  printf 'Antigravity useG1Credits: %s\n' "$g1_status"
fi
printf 'For GitHub connectivity run gh auth status. Keep all tokens out of project records.\n'
printf 'For structural validation run bash scripts/check.sh.\n'
