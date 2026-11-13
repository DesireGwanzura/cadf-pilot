#!/usr/bin/env bash
set -u
printf 'CADF local tooling check (no inference calls)\n'
for tool in git gh python3 copilot; do
  if command -v "$tool" >/dev/null 2>&1; then
    printf '%s: %s\n' "$tool" "$(command -v "$tool")"
  else
    printf '%s: unavailable in this shell\n' "$tool"
  fi
done
if command -v copilot >/dev/null 2>&1; then
  printf 'GitHub Copilot CLI (the only agent provider): %s\n' "$(copilot --version 2>/dev/null | head -1)"
  printf 'If agents report sign-in errors, run: copilot login\n'
else
  printf 'Install the GitHub Copilot CLI to let agents run: https://docs.github.com/copilot/how-tos/copilot-cli\n'
fi
printf 'Optional: set CADF_MAX_AI_CREDITS to cap the credits any single agent call may use.\n'
printf 'For GitHub connectivity run gh auth status. Keep all tokens out of project records.\n'
printf 'For structural validation run bash scripts/check.sh.\n'
