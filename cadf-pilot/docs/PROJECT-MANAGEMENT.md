> Current implementation: read [CURRENT-STATE.md](CURRENT-STATE.md) first. Older entries below are historical and may describe superseded controls or assignments.

# Project management and discussion review

The owner requested finite projects with accessible deliverables, versioned requirements and a clear finish. Project management is a primary dashboard section beside the shared conversation.

## Delivery and acceptance

Add deliverables and milestones with explicit completion criteria. Accept each with an artifact reference and evidence. HTTPS/HTTP references can be opened from the card; local paths are displayed without granting the browser arbitrary filesystem access. CADF records the owner's acceptance; it does not claim to independently inspect or verify that artifact. Worker outputs remain available under execution details.

## Batch discussion review

Use Collect new discussion once a day or whenever ready. This is an on-demand local operation, not a scheduled background job. Every uncollected message is retained in a review batch with source IDs. Explicit prefixes Requirement:, Requirements:, Decision:, Update: and Idea: suggest the relevant document category. Unlabelled discussion is shown for human interpretation. No model is called for this extraction and no text is silently approved.

Prepare a proposed revision, edit the full document, then approve and save a new version. Each version has a category, sequential number, timestamp, owner acceptance and source batch/message IDs. Older content is immutable through the API and can be compared in the UI. Mark the batch reviewed after accepting or declining its proposals. Repeated collection with no new messages is rejected.

Versions and management records live atomically in the private `.agents/PROJECTS.json` alongside discussion. They are logical versioned documents, not separate Markdown files or automatic edits to shared repository requirements. Download project records exports management history and project audit events as JSON. This operational file is Git-ignored: back it up privately; source ZIPs are not operational backups. A future scheduled/semantic consolidation integration remains unconnected.

## Closeout

Accept every deliverable/milestone with evidence; collect and review all remaining discussion; then record the delivered outcome, limitations and separately scoped follow-ups in the closeout. A managed project cannot complete without this record. New notes or management changes invalidate prior closeout. Completion rechecks outstanding discussion and cancels pending jobs; active workers must stop first. Completed/archived projects reject new conversations and management changes. New scope belongs in a new project. Legacy projects without management records retain their original completion workflow.

This feature does not add autonomous implementation, automatic artifact validation, external document synchronization, or recurring model runs.

Approved requirements/decisions and planned outcomes are included in future worker briefs. Approving a version cancels pending jobs built from older records; a running response must finish/stop first. Existing job outputs retain their original brief and are not retroactively certified against new requirements. Lifecycle controls are available directly on the project dashboard.

## Table-first delivery board
The owner requested the supplied Monday-style table. Outcomes are grouped by due month (including overdue), next month, later and unscheduled. Owner, work status, due date and priority are editable inline with stale-write protection. Working on it/Stuck describe reported work state; Done still requires owner acceptance with evidence through Review. Dates are never invented. Accepted outcomes are immutable through scheduling controls. Project controls and detailed records remain in collapsed sections.

## Focused views
Project management uses top tabs for Table, Kanban, Gantt, Add outcome, Discussion, Requirements, Closeout and Summary. Gantt uses actual start/due dates and rejects reversed intervals. Undated outcomes are explicitly unscheduled. Kanban moves update reported work state; acceptance remains an evidence-gated action. Other app sections use their own focused tabs so forms, execution output and audit records no longer share one long page.
