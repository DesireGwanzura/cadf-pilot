> Current implementation: read [CURRENT-STATE.md](CURRENT-STATE.md) first. Older entries below are historical and may describe superseded controls or assignments.

# Live coordination handoff

Updated 2026-10-16 by Codex. Read this before joining.

## Current owner instruction — model coordination implementation

Owner asked Codex to implement explicit AG model routing and bounded collaboration, restore no-paid-credit configuration, and show the latest UI. Codex owns these changes to serve.py/orchestrator.py and the corresponding model controls/tests. Preserve AG's redesign. A further visual redesign is requested for the next step. Do not concurrently edit these paths.

## Previous handoff — UI ownership transferred to Antigravity

The owner requested Antigravity redesign the dull, word-heavy UI. Read **docs/UI-REDESIGN-HANDOFF.md** and implement it. Antigravity now owns web/, related UI assets/tests and docs/UI-REDESIGN-RESULTS.md. Codex yields those paths. This supersedes earlier read-only/UI ownership wording below. Preserve existing uncommitted work; no commits/pushes or public deployment without owner approval. Backend/shared state changes require coordination. Prior worker fixes remain separately scoped.

## Current assignment and ownership

The owner requested end-to-end CADF setup, a functional command centre, project submission/start/pause management, a real orchestrator, and a marketing workstream. Implementation is in progress on `cadf/command-centre`, based on `origin/main` at d4eccdf. No commits, pushes, merges or approvals have occurred in this setup task.

**Updated allocation after owner supplied Antigravity review:** Codex owns `web/`, `scripts/serve.py`, `scripts/discuss.py`, `tests/test_server.py`, `.agents/`, README and coordination documents. Antigravity may implement the bounded fixes below in `scripts/doctor.sh`, `scripts/orchestrator.py` and `tests/test_orchestrator.py`. Codex will not edit those three files during this handoff. These are coordination agreements, not filesystem locks. Do not launch another orchestrator against the same operational store.

### Antigravity fix handoff — 2026-10-16

Owner said they will tell Antigravity to proceed. Read the latest files before editing; earlier review predates some changes.

1. Add a read-only doctor check for `useG1Credits`. Codex rechecked the actual setting: it is already JSON `false`. Preserve the fail-closed dispatch guard. Do not rewrite credentials/settings or enable paid fallback.
2. Verify supported agy stdin/file prompt delivery using installed help/documentation. If supported, implement it and test multiline prompts. Current subprocess arguments are a list without a shell, so quotes are not a shell-injection defect. Avoid claiming support without a real check. Preserve plan mode, sandbox, timeout, cancellation and the new conversation-result recording.
3. Add regression tests in `tests/test_orchestrator.py` for any worker changes and report exact outcomes. Tests requiring loopback may need permission; a permission failure is not an application failure or proof of full coverage.
4. Return review findings and changed-file list through your response or the documented local handoff utility. Do not commit/push, change the branch, or edit Codex-owned files.

IDEA-004 (socket-free unit coverage) is deferred until the chat HTTP work settles; existing real HTTP integration tests remain required. IDEA-006 (isolated implementation worktrees) is a future code-writing capability, not needed for current planning workers. If additional files are needed, propose the scope first.

The Git repository is the outer cadf-pilot folder. The application is its inner cadf-pilot directory. Antigravity has opened the outer repository; its root AGENTS.md points here.

## What has happened

- Discovered existing GitHub repository DesireGwanzura/cadf-pilot. GitHub authentication verified; owner confirmed main was the intended branch.
- Found upload missing hidden canonical state and empty research directories. Reconstructed pending records, explicitly labeled; original history was not recovered.
- Verified Codex CLI signed in with ChatGPT and a real bounded response through account-based non-interactive execution.
- Installed official Gemini CLI 0.64.0. Owner completed Google sign-in, but provider rejected personal-account use of this client and directed migration to Antigravity. No paid API fallback.
- Found Antigravity app 2.23.1 and agy CLI already installed. Owner opened CADF project. A real agy response succeeded; CLI useG1Credits was set false to disable paid-credit fallback. No subscription purchased.
- Built real file-backed dashboard, then extended it with project lifecycle controls, job queue and campaign draft approvals. These latest additions are undergoing final browser tests and documentation updates.
- Earlier 11 and 19-test suites passed; current suite additionally tests orchestration and marketing approvals. See final validation handoff for the completed count, not an assumption.
- Temporary browser QA runs on port 8766 with disposable records. Real app uses 8765. Do not interpret QA projects as real user projects.

## Current architecture

Python standard library server; HTML/CSS/JS frontend; no package dependencies for the app. Files in .agents are canonical. PROJECTS.json contains projects, job requests, campaign drafts and their audit events, written atomically under a cooperating-process lock. Revision checks reject stale updates. The owner-facing API is loopback-only, checks Host/Origin and a per-server token.

The orchestrator runs one explicitly approved job at a time. Workers currently produce bounded plans and draft artifacts, not autonomous code implementation. Codex uses read-only sandbox and forced ChatGPT login with API-key environment variables removed. Antigravity uses plan mode and sandbox, with paid-credit fallback disabled. Local output/logs live in ignored .cadf-runtime; do not commit them or credentials. Pause requests cancellation, not magical suspension of a remote model; a resumed project requests fresh approval. Failed/interrupted jobs never automatically retry.

Standalone ChatGPT/Gemini chats, Meta AI/Muse, social publishing and analytics are not connected. Metricool, Canva and Windsor.ai were discovered but are not installed/connected here. No campaign has been published. No employer project is authorized for public marketing.

## Conversation-first interface

The owner requested a shared chat interface as the primary view. Actual CLI worker outputs and owner messages appear by project, with recipients and blockers. Agents joining through other apps can contribute a task-specific handoff using scripts/discuss.py; see docs/CONVERSATIONS.md. Private operational conversation data is intentionally Git-ignored.

## How to contribute now

1. Read AGENTS.md, docs/PROJECT-BRIEF.md, docs/DECISIONS.md, this file and docs/INTEGRATIONS.md.
2. Review only common implementation files. Do not read independent peer research before both reports are frozen.
3. Run checks in the application directory: `bash scripts/check.sh`, `python3 -m unittest discover -s tests -v`.
4. Return findings with path, risk, reproduction and proposed correction. Do not claim tests you did not run or approvals you did not receive.
5. Share ideas in docs/IDEAS.md with author/date/status. While Codex owns this handoff, send ideas in your response for integration, or propose a patch in your separate branch.
6. Human acceptance and GitHub publication remain separate from passing tests.

## Project management addition

Owner requested a visual project workspace and finite delivery lifecycle. Codex added the primary Project management GUI with outcomes, milestone acceptance, progress, current work, next actions, project chat navigation, lifecycle controls, batched discussion routing, immutable logical record versions and closeout checks. See PROJECT-MANAGEMENT.md. Files: scripts/serve.py, web/, tests/test_management.py. Antigravity-owned worker files were not edited. Batch collection is manual; semantic extraction/scheduling and autonomous code implementation remain unconnected.

## Reference-led UI update
Owner supplied six visual references and requested a consistent app with a real chat layout. Codex added lavender/white design tokens, project conversation list, compact bubble chat, record-derived activity bars/completion ring and a delivery table. No sample chart metrics are fabricated. Grok is on standby for future projects, with optional manual handoff only. No Grok call or account login occurred.

Owner explicitly requested keeping the coordinator hardcoded while improving reliability. Codex implemented prelaunch cancellation, setup-failure recording, idempotent finalization and closed-project claim exclusion. Source now contains the real CADF workspace project and an attributed Codex handoff; no synthetic team replies or inference jobs were seeded.

Latest UI direction: owner selected a blend of the Task Z dashboard and dark-sidebar purple dashboard. Overview now uses four project metrics, actual seven-day event bars, team configuration/standby labels, completion ring and a project table. Chat now uses a people-first list, recent circular shortcuts and direct-recipient views; settings are collapsed. No invented metrics or live presence.

## Current revision — chat-led supervision and glass UI, 16 October 2026

Read CURRENT-STATE.md, ORCHESTRATOR.md and CONVERSATIONS.md before continuing. They supersede older manual-assignment and monolithic-page instructions above.

The owner requested a name/brief-only project form, agent-generated outcomes, exact plan approval before team execution, isolated agent chats/drafts, group broadcasts, quoted decisions with versioned records, section tabs, Gantt, on-demand formatted downloads, search/sort/filter/pagination, one top header, automatic refresh, light/dark glass styling, proper agent cards and an activity list. The six AG model profiles are on standby with distinct rooms. Grok stays manual. Meta remains disconnected.

Implementation paths: scripts/workflow.py and exports.py; serve.py/orchestrator.py; web/supervision.js, workspace.js, glass.css and the existing app.js/index.html/style.css. Current source of truth is the local private project store. No live model acceptance or peer approval is claimed. Use the source test suite; do not copy synthetic browser fixtures into the real project store.

Latest validation: 65 automated checks passed after adding private Grok import, legacy-control approval-boundary and date-edit regressions. No fresh inference was used. The source server uses port 8765; the existing project was migrated to supervised planning without launching any worker request. Private history was preserved.

Latest owner refinement: removed the chat sidebar and duplicate title/shortcut row, added the circular contact chooser with blurred backdrop, moved all section view tabs into the top header, and made chat occupy the whole available canvas. Both themes and draft isolation through this chooser were browser-checked. Meta linking is explicitly deferred by the owner; Marketing → Connections provides a later setup path, with no connected-status claim.


## Final refinement — 16 October 2026, 09:50 SAST
Latest owner direction overrides the earlier persistent-header-brand variant: CADF/logo stay in the side menu with its three-line toggle; only the toggle remains when collapsed. Chat now has a slim composer, external bubble actions and info receipts, no recipient dropdown, and a disabled attachment button because storage is deferred. Private/shared storage requirements are recorded for later. Mobile/tablet drawers, internal table/Gantt scrolling and both themes were browser-checked; duplicate PM project heading is removed.

74 tests pass. New tests verify restoring AG’s omitted false budget setting without enabling credits, independent model checks, zero-exit quota errors, and independent approved tasks continuing after a quota failure. Eight requested live checks: Codex responded; AG default and all six AG profiles reported quota limits. No additional subscriptions, paid fallback, automatic retries, commits or pushes. Source worker remains loopback-only on 8765. Update CURRENT-STATE.md when provider availability or capabilities change.

Final owner clarification: replace the smiley with an idea icon; preserve readable text formatting. Implemented a DOM-only formatter for headings, bold, lists, code and safe web links. Browser fixture verified that script/image markup and javascript links remain inert. Latest sidebar direction remains CADF/logo inside the menu; only the three-line toggle remains outside when collapsed.

Latest orchestrator additions: priority/FIFO queue with ten-minute aging; a Readiness tab for project/approval/worker/provider checks; assigned-task preflight rechecks scope, approved content digest, worker/model and dependencies. 78 automated tests passed after these changes. The owner subsequently started another availability batch from the dashboard; it completed at 10:06–10:08 SAST with Codex responding and all seven AG routes quota-limited. The final worker restart was verified IDLE with no pending jobs at 10:09 SAST.

Hosting preparation: read HOSTING-OPTIONS.md and RELEASE-AND-SYNC.md. Created `develop` and `testing` on GitHub from d4eccdf, leaving main and all local app changes intact. The GitHub CLI sign-in works; ordinary git lacks a configured credential helper, so branch push used a one-command gh credential helper without changing global settings. New CI YAML parsed successfully and structure/diff checks passed. No cloud provisioning or native build. Owner wants private access first; mini-project automation deferred.

AWS follow-up: owner completed Google-based signup; Free plan verified in billing. EC2 launch form inspected and canceled without provisioning. Account/credit details kept only in the local output handoff, not committed source. Owner approval requested for source commit/push and a draft PR into develop; no deployment approval is implied by that request.
