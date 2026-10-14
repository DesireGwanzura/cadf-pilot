# CADF pilot brief

## Objective
Establish a small Git-based collaboration workflow using tools the owner already has, with zero additional API expenditure. Existing subscriptions are not free; availability, limits and access must be verified rather than assumed.

## First pilot
ChatGPT and Gemini independently analyze: "How can we coordinate project state, Git commits and file changes across ChatGPT, Gemini, Codex and Antigravity using existing subscriptions and local tooling without additional API costs?"

Use the same question and report template. Evaluate branches/worktrees, manual handoffs, local scripts, optional MCP connections, Git hooks, state conflicts, permissions, failure recovery and testable acceptance criteria. Cite primary sources with access dates for tool-capability claims. Distinguish observed behavior, proposals and unknowns. Do not assume a chat product can access localhost or write GitHub; verify the specific client.

## Scope and acceptance
1. Bootstrap files validate from a fresh clone using Git, Python 3 and Bash only.
2. Both independent reports are submitted before reciprocal review begins.
3. Consolidation records disagreements and produces a human-approved baseline.
4. Engineering tasks have one owner, another reviewer, bounded paths and executable checks.
5. One small implementation task demonstrates branch isolation, review, integration and recovery.
6. A read-only command center may follow the validated workflow; dispatch automation is deferred.

GAIA ONE is a separate prospective downstream project. Its incomplete implementation and interrupted audit must be explicitly inventoried before onboarding. This pilot does not certify GAIA ONE.
