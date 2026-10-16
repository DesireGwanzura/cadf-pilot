# Antigravity: redesign the CADF interface

Status: READY FOR ANTIGRAVITY. Owner explicitly requested this handoff on 2026-10-16. Implement the redesign, not just a proposal. Codex is yielding UI ownership and will not edit web/ during this assignment.

## Owner feedback and objective

The current interface is dull, too wordy and feels like reading documents. Make it lively, graphical and enjoyable while keeping the underlying controls functional. The chat must feel like an actual chat app; project management must feel like a real project management product. Use graphs and tables where they clarify real information. This is a substantial visual and interaction redesign, not another layer of explanatory paragraphs.

## Design direction

- Make deliberate visual choices: confident typography, clear hierarchy, restrained bright accents, recognizable icons, generous spacing, compact cards and tasteful motion. Avoid an endless page of forms and text. Support reduced motion and keyboard navigation.
- Use focused application views with clear navigation. Keep audit details, provenance, integration caveats and lengthy explanations in drawers, tooltips or expandable panels. Surface short actionable warnings where needed.
- Chat: a room/project list, conversation header, distinct participant identities, compact message bubbles, timestamps, readable spacing, a composer anchored to the conversation pane, recipient controls, and a concise blocker/decision card. Make sending, queued responses, errors and retry actions obvious. Preserve drafts and scroll position on refresh; do not drag the reader to the bottom while reading history. No fabricated avatars implying real people, online presence, typing activity or agent messages.
- Project management: scannable project cards or portfolio table, a focused project workspace, actual progress visualization, milestone timeline or status board, deliverable cards with open/download actions, requirements version history, and visible current work/next action. Put editing forms in context rather than displaying everything at once. Include a clear route from a project to its conversation and back.
- Charts must use actual records: outcome acceptance, recorded task/job states, dated activity. Choose useful charts; do not invent completion percentages, burn-down data, revenue, performance or live analytics. Empty states should be attractive and honest.
- Preserve complete project lifecycle controls, approval/review actions, version comparison, evidence, export and closeout. Aim for understandable screens without reading instructions. Keep brief summaries faithful to their source; do not call truncated text an AI summary.
- Make it work on narrow screens as well as desktop, with accessible contrast, labels, focus states and appropriately sized controls.

## Scope and coordination

Repository: /Users/sire/Documents/Codex/2026-10-16/referenced-chatgpt-conversation-this-is-an/work/cadf-pilot
Application: its inner cadf-pilot directory.
Current branch: cadf/command-centre. Existing work is uncommitted; preserve it. Do not reset, stash or switch branches over other work, and do not assume a worktree from HEAD includes the uncommitted application. The owner authorizes this sequential UI handoff in the existing working tree. No concurrent Codex UI edits.

You own web/ and may add UI assets and focused UI tests. Record results in docs/UI-REDESIGN-RESULTS.md. The earlier bounded worker-fix assignment remains separate. Backend contracts and security protections should stay intact. If a backend adjustment is truly needed, explain its scope in the result and coordinate before editing scripts/serve.py or shared state. Do not commit/push or publish without owner approval. No paid tools, subscriptions, remote fonts or external analytics required. Prefer existing dependency-free HTML/CSS/JS, CSS graphics and local SVG assets.

## Current implementation and factual limits

Read AGENTS.md, docs/LIVE-HANDOFF.md, docs/CONVERSATIONS.md, docs/PROJECT-MANAGEMENT.md and docs/INTEGRATIONS.md. App files are web/index.html, web/style.css, web/app.js. Backend is scripts/serve.py with optional scripts/orchestrator.py. GET /api/snapshot provides state and write token. POST /api/projects requires token and expected_revision; preserve stale-write recovery and input drafts. Do not bypass Host/Origin checks or safe text rendering.

Operational records are private .agents/PROJECTS.json, ignored by Git. Preserve real data; use disposable fixtures for tests. Actual worker responses exist only after a job result. Current workers plan/draft; autonomous code changes, automatic semantic daily consolidation, Meta publishing and analytics are NOT connected. New approved requirements feed subsequent worker briefs. Keep integration limitations discoverable without turning the main UI into a manual.

The existing browser at http://127.0.0.1:8766 is a disposable QA COPY under work/browser-test-v2, not the source application. Editing the repository will not automatically update that copy. Do not mistake its sample records for user projects. Run your own coordinated preview from the correct source or a fresh disposable copy on an available port; never start two orchestrators against one operational store. The source launcher normally uses port 8765.

## Acceptance and verification

1. Deliver an implemented, cohesive visual redesign, not mockups alone.
2. Verify chat, project selection, deliverable acceptance, discussion collection, requirement versions, worker approval/cancellation and lifecycle controls still work. Test empty/loading/error/stale-write states and narrow layout.
3. Run bash scripts/check.sh, python3 -m unittest discover -s tests -v, and node --check web/app.js. Latest Codex baseline: 36 tests passed; do not claim your run passed without executing it. Socket-based tests may need local loopback permission.
4. Inspect actual rendered screens in a browser. Capture useful before/after screenshots, check for browser errors and text overflow. Do not use private messages or credentials in shared screenshots.
5. Report changed files, actual checks, screenshots and remaining limitations in docs/UI-REDESIGN-RESULTS.md. Return to the owner for visual review; do not self-approve.
