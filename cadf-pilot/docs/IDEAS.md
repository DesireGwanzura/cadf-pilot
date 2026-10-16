# Shared ideas and questions

This is a discussion space, not an execution queue. An idea is not approved work. Each participant adds an entry under their own name in a separate branch or sends it to the coordinator; avoid simultaneous edits. Accepted ideas become bounded tasks with an owner, a different reviewer, acceptance criteria and evidence.

## Entry template

- ID / date / author:
- Problem or opportunity:
- Proposal and alternatives:
- Evidence and assumptions:
- Cost and privacy implications:
- Feedback / disagreement:
- Status: PROPOSED / DISCUSSING / ACCEPTED / REJECTED / DEFERRED
- Related task / decision:

## IDEA-001 — Development-to-marketing handoff

Date: 2026-10-16. Origin: owner request; recorded by Codex.
Proposal: after human-approved release evidence, draft product explanations, demos and channel-specific posts, then require explicit owner approval before publishing. Use separate personal and product brands. Keep Document Service and eTalente outside public content without permission.
Status: DISCUSSING. Draft/approval records are being built. Automatic release detection, publishing and analytics are not connected.

## IDEA-002 — Broader project orchestration

Date: 2026-10-16. Origin: owner request; recorded by Codex.
Proposal: a single local control centre for software delivery and business growth. First verified worker capability is bounded planning/drafting through existing subscriptions. Future code-writing workers need isolated worktrees, exact change scopes, tested review gates and recovery.
Status: DISCUSSING. Do not treat the planning worker as a full autonomous software factory.

## IDEA-003 — Equal participation and independent discovery

Date: 2026-10-16. Origin: prior project protocol; recorded by Codex.
Proposal: preserve independent initial analysis, then consolidate and cross-review. Tools may share a model, but reviewer identity and independence must be accurate. A single model wearing two labels is not independent review.
Status: PROPOSED; baseline still awaits actual peer review and human acceptance.

## IDEA-004 — Socket-free unit coverage alongside HTTP integration tests

Date: 2026-10-16. Author: Antigravity; relayed by owner and recorded by Codex.
Proposal: separate transport-independent logic checks from tests requiring loopback permission. Retain real HTTP integration tests; mocked transport cannot certify those boundaries. Sandbox permission failures must be reported separately from product defects. Zero additional cost.
Status: DEFERRED until conversation HTTP changes settle. Related task: APP-001.

## IDEA-005 — Verify stdin/file delivery for Antigravity prompts

Date: 2026-10-16. Author: Antigravity; relayed by owner and recorded by Codex.
Proposal: use supported stdin/file prompt delivery to reduce argument length and process-list exposure. Current argument-list subprocess execution does not invoke a shell, so quote escaping is not currently a shell-execution vulnerability. Verify CLI support before implementation.
Status: ACCEPTED for bounded investigation/fix by Antigravity; see LIVE-HANDOFF.md. Zero additional cost.

## IDEA-006 — Isolated worktrees for future implementation workers

Date: 2026-10-16. Author: Antigravity; relayed by owner and recorded by Codex.
Proposal: provision an isolated worktree for each future code-writing job with scoped review and explicit retention/recovery. Never automatically delete unreviewed work on cancellation. Current workers produce plans/drafts only.
Status: DEFERRED until implementation-worker capability is designed and approved. Zero subscription cost; local storage required.

## IDEA-007 — Triggered mini-projects and connected-app analysis

Date: 2026-10-16. Origin: owner request; recorded by Codex.
Proposal: a bounded child project can read an explicitly connected application's authorized data, analyze changes and report to its parent project. A schedule, webhook or parent event may propose a run. Future controls must include approved scope, connector permissions, event deduplication, cooldowns, run/usage limits, provenance, cancellation and owner approval before external writes. Reuse approved orchestration rather than starting an unbounded agent loop.
Status: DEFERRED at the owner's explicit request. No trigger, schedule, connector or mini-project execution is being implemented or activated in the hosting phase.
