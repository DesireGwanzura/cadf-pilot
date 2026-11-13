# CADF orchestrator

The coordinator is deterministic Python (`scripts/workflow.py`, `scripts/orchestrator.py`). Models propose content and plans; code validates and enforces the workflow.

`Brief → Copilot planner (claude-opus-5.5) → different-model plan review (gpt-6.1-sol) → owner approves exact plan (or auto-start) → assigned text tasks → independent model review ⇄ automatic revision (max 2 cycles) → autopilot acceptance or owner acceptance → closure`

A plan is bound to its project revision and content digest. No assigned task is queued until owner approval; blockers prevent approval. Changed decisions/requirements revoke approval and stop pending execution. Only supported draft/review tasks and allowlisted models are accepted. Dependencies pass actual outputs, and self-review of a draft by the same model is rejected.

One worker process owns a filesystem lock and runs one job at a time. Jobs have time/output bounds, actual process results, cancellation, stale-restart recovery and no automatic retries. Every job runs `copilot -p` (see `scripts/providers.py`): all tools excluded, shell/write/url denied, no custom instructions or built-in MCP servers, API-key variables removed, prompts capped at 200 KB, optional `CADF_MAX_AI_CREDITS`. Quotas are not estimated or invented.

Planning uses two different Copilot models. The planner assigns each task to a catalogued model (22: Claude, GPT, Gemini, Grok, Kimi, MAI) and a review must use a different model from its draft. Every catalogued model is also a direct chat profile (`cp-<model>`); a group send queues the six-model team panel, not all 22. Human projects never call a model; hybrid plans may contain `human` action tasks, which wait (`WAITING_HUMAN`) until the person's ticket is marked done and then release dependent agent work. Chat reply authorization is bounded to those replies and does not approve project execution.

Private room context and private version records are filtered before prompt construction. The planning coordinators receive the team room; assigned workers may receive their own room, never another worker's private room. Execution handoff artifacts are shared only through approved task dependencies.

Current worker capabilities are text planning, drafting and review. Live web research, filesystem implementation, outreach, publishing and deployment adapters are **not connected**. Unsupported requirements must produce a blocker. See `docs/CURRENT-STATE.md` for the complete capability register and remaining work.

Start: `python3 scripts/serve.py --port 8765 --orchestrate`. UI-only mode omits `--orchestrate`. Stop with Ctrl+C. After interruption, inspect the retained outcome and request fresh planning; nothing is automatically retried.


## Availability and quota isolation — 16 October 2026
`availability.py` derives observations from actual jobs. The explicit `check_agents` owner action requests one 45-second, context-free check per connected route; it deduplicates pending checks and does not start a project team. Check outcomes appear in Agents → Availability and the execution record, without filling the conversation with probe messages. Exact balances and reset times remain unknown.

The worker records dispatch timestamps and captures quota failures even when the CLI returns exit code zero. One failed check or group reply does not prevent the next model. In an approved plan, quota failures block only the task and its dependency chain; other approved independent tasks continue. The incomplete plan cannot be accepted. Scope/approval/authentication/safety failures still stop progression; there is no silent model replacement.

AG serializes `useG1Credits` with `omitempty`. A valid settings object missing that field is restored atomically to explicit false before launch, preserving preferences. Explicit true, invalid values, unreadable/missing files, symlinks or concurrent changes are rejected. No retry is triggered by restoring the setting. Provider quota is never bypassed.


## Queue scheduling and launch preflight
`scheduling.py` is the shared implementation for visible queue order and worker selection. High-priority projects run before normal/low within the eligible queue; FIFO requests aged at least 600 seconds move ahead of newer requests, preventing starvation. Active work is never preempted. Queued jobs must still satisfy project status and approval rules.

Immediately before process launch, assigned jobs must match current scope revision, an owner-approved running plan, a recomputed digest of the approved plan content (excluding execution bookkeeping), the task’s selected worker/model and job ID, and delivered dependencies. Mismatches are held or recorded as a preflight failure, never launched. Readiness is read-only and shows observed route blockers; it does not reserve quota or bypass plan approval.
