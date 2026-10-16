> Current implementation: read [CURRENT-STATE.md](CURRENT-STATE.md) first. Older entries below are historical and may describe superseded controls or assignments.

# Local tools and zero-extra-budget policy

Git, Homebrew, Node 24, Python 3 and GitHub CLI were already available. GitHub access to DesireGwanzura/cadf-pilot was verified. Codex CLI reports logged in using ChatGPT. Antigravity 2.23.1 is installed; its account state is not verified.

Gemini CLI 0.64.0 installed at ~/Documents/Codex/tools/cadf/node_modules/.bin/gemini. Run `bash scripts/gemini.sh` from this directory and choose Sign in with Google using a personal account. Credentials belong in the provider browser flow, never in this repository. The launcher clears API-key/Vertex environment variables; check the login method in the CLI and do not approve paid fallback.

Use existing subscriptions/free quotas only. Stop when quota is exhausted. No paid API keys, hosting, scheduled cloud jobs or paid GitHub Actions are configured. This dashboard makes no inference calls. Google account eligibility must be confirmed during sign-in; subscription names alone do not establish CLI quotas.

Antigravity: open this application folder in the installed app and provide docs/REVIEW-APP.md as the review prompt. Installed does not mean authenticated or connected. ChatGPT browser conversations require manual file handoffs.

Sources checked 2026-10-16:
- https://geminicli.com/docs/get-started/authentication/
- https://github.com/google-gemini/gemini-cli
- https://learn.chatgpt.com/docs/auth
- https://antigravity.google/pricing

## Observed authentication outcome

On 2026-10-16 the owner completed Google browser sign-in. Gemini CLI 0.64.0 then returned: “This client is no longer supported for Gemini Code Assist for individuals. To continue using Gemini, please migrate to the Antigravity suite of products: https://antigravity.google”. Authentication is BLOCKED by the provider, not complete. Do not retry with paid API keys. Public setup documentation did not predict this account response; the observed response takes precedence.

Antigravity opened its existing workspace interface. CADF folder selection requires manual completion because macOS picker automation did not complete reliably. No inference request, entitlement verification or independent review has been performed.

The Gemini launcher selects the Mac's installed Node 24 when available, since the external login environment otherwise selected an older incompatible Node. CADF_NODE_BIN and CADF_GEMINI_BIN support portable overrides.
