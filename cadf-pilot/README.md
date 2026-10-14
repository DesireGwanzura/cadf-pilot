# CADF pilot

Local collaboration bootstrap. No cloud services, paid API dependencies or command center are required. External participants have not yet reviewed this baseline.

## Start here
Requirements: Git, Python 3, Bash.

```sh
bash scripts/check.sh
git status
```

State files intentionally use JSON syntax (valid YAML 1.2), validated with Python's standard library. Keep this syntax when editing.

## Who goes next
1. Gemini reviews the actual bootstrap using docs/GEMINI-REVIEW.md. The files already exist; do not bootstrap again.
2. The coordinator integrates corrections and records the human baseline decision. SETUP-001 becomes COMPLETED only after that review/integration.
3. ChatGPT and Gemini each receive the same brief/template and produce their own independent report. Start a READY task only after dependencies are complete; only the coordinator updates shared state. READY does not mean the task has started.
4. Freeze both reports, then begin reciprocal review. ChatGPT consolidates; Gemini reviews technical findings; the human approves the baseline.
5. Codex and Antigravity receive bounded engineering tasks on separate branches/worktrees. A command center follows a demonstrated handoff workflow.

Read AGENTS.md and docs/PROJECT-BRIEF.md before joining. Use docs/HANDOFF-TEMPLATE.md for evidence. Review tasks can be handed over as files if an external tool lacks repository access. No MCP/GitHub write capability is assumed.

## Connect GitHub when available
Create an empty private cadf-pilot repository in your own account, then run these commands with its actual URL:

```sh
git remote add origin YOUR_REPOSITORY_URL
git push -u origin main
```

Do not paste credentials into repository files. Git authentication is configured outside this project. The remote URL is the only missing input for publishing; local work and review can proceed now.
