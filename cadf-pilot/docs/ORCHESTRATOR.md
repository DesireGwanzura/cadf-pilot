# CADF orchestrator

The coordinator is deterministic Python (`scripts/workflow.py`, `scripts/orchestrator.py`). Models propose content and plans; code validates and enforces the workflow.

`Brief → Codex planning → Gemini planning review → owner reviews exact plan → assigned text tasks → artifact review → owner acceptance → closure`

A plan is bound to its project revision and content digest. No assigned task is queued until owner approval; blockers prevent approval. Changed decisions/requirements revoke approval and stop pending execution. Only supported draft/review tasks and allowlisted models are accepted. Dependencies pass actual outputs, and self-review of a draft by the same model is rejected.

One worker process owns a filesystem lock and runs one job at a time. Jobs have time/output bounds, actual process results, cancellation, stale-restart recovery and no automatic retries. Codex must use an authenticated ChatGPT account with API credentials removed. AG must explicitly disable paid-credit fallback; missing settings fail closed. Quotas are not estimated or invented.

Planning uses Codex and Gemini Flash Low via AG. The owner chooses neither task assignments nor required deliverables manually. Coordinators decide one-agent versus multiple-agent tasks. Every supported AG model is also available as a direct chat profile. Sending to the group explicitly queues Codex plus all six profiles; Grok remains manual. Chat reply authorization is bounded to those replies and does not approve project execution.

Private room context and private version records are filtered before prompt construction. The planning coordinators receive the team room; assigned workers may receive their own room, never another worker's private room. Execution handoff artifacts are shared only through approved task dependencies.

Current worker capabilities are text planning, drafting and review. Live web research, filesystem implementation, outreach, publishing and deployment adapters are **not connected**. Unsupported requirements must produce a blocker. See `docs/CURRENT-STATE.md` for the complete capability register and remaining work.

Start: `python3 scripts/serve.py --port 8765 --orchestrate`. UI-only mode omits `--orchestrate`. Stop with Ctrl+C. After interruption, inspect the retained outcome and request fresh planning; nothing is automatically retried.


## Availability and quota isolation — 16 October 2026
`availability.py` derives observations from actual jobs. The explicit `check_agents` owner action requests one 45-second, context-free check per connected route; it excludes Grok, deduplicates pending checks and does not start a project team. Check outcomes appear in Agents → Availability and the execution record, without filling the conversation with probe messages. Exact balances and reset times remain unknown.

The worker records dispatch timestamps and captures quota failures even when the CLI returns exit code zero. One failed check or group reply does not prevent the next model. In an approved plan, quota failures block only the task and its dependency chain; other approved independent tasks continue. The incomplete plan cannot be accepted. Scope/approval/authentication/safety failures still stop progression; there is no silent model replacement.

AG serializes `useG1Credits` with `omitempty`. A valid settings object missing that field is restored atomically to explicit false before launch, preserving preferences. Explicit true, invalid values, unreadable/missing files, symlinks or concurrent changes are rejected. No retry is triggered by restoring the setting. Provider quota is never bypassed.


## Queue scheduling and launch preflight
`scheduling.py` is the shared implementation for visible queue order and worker selection. High-priority projects run before normal/low within the eligible queue; FIFO requests aged at least 600 seconds move ahead of newer requests, preventing starvation. Active work is never preempted. Queued jobs must still satisfy project status and approval rules.

Immediately before process launch, assigned jobs must match current scope revision, an owner-approved running plan, a recomputed digest of the approved plan content (excluding execution bookkeeping), the task’s selected worker/model and job ID, and delivered dependencies. Mismatches are held or recorded as a preflight failure, never launched. Readiness is read-only and shows observed route blockers; it does not reserve quota or bypass plan approval.
