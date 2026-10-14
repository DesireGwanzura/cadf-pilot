# CADF operating protocol

Read this file, docs/PROJECT-BRIEF.md and .agents/PROJECT_STATE.yaml before work.
Rules are versioned and reviewable, not immutable. Human instructions take precedence.

## Collaboration
- Team A: ChatGPT and Gemini research, requirements and architecture.
- Team B: Codex and Antigravity implementation and verification. These are assignments, not restrictions on tool capability; Codex bootstrapped this repository at the owner's request.
- Each task has one accountable owner and a different reviewer. Do not impersonate another participant or claim they have joined or reviewed work.
- During independent discovery, read only the common brief and your own research folder. Do not read, summarize or cite peer reports. Freeze both submissions before reciprocal review. This is a behavioral rule, not filesystem isolation; use separate supplied contexts/checkouts for stronger isolation.
- No agent approves its own work. Authors submit READY_FOR_REVIEW with evidence; the named reviewer records APPROVED or CHANGES_REQUESTED. The human coordinator marks COMPLETED after review and integration.
- Workflow: READY -> IN_PROGRESS -> READY_FOR_REVIEW -> IN_REVIEW -> APPROVED -> COMPLETED. CHANGES_REQUESTED returns to IN_PROGRESS; BLOCKED records a reason.
- Only the human coordinator or an explicitly delegated coordinator edits canonical task/state files. Authors submit status changes in their handoff; do not concurrently edit shared state. No automatic lock service exists yet.
- Use separate branches/worktrees for implementation. Declare changed paths; do not overwrite another participant's work. Git branches are not access-control boundaries.
- Reviews cite commits/diffs, commands, outcomes and limitations. Never invent approvals or execution evidence.
- Escalate unresolved disagreements after two review cycles, new spending, publishing/access changes, or material scope decisions. Routine reversible work within the assigned task can proceed.
- Do not commit credentials, tokens, private transcripts or personal data. No paid API dependency, automatic external messages, or new service subscriptions without explicit authorization.
- Run bash scripts/check.sh before handoff. The checker validates structure and task consistency, not actual independence, review authenticity or security.
