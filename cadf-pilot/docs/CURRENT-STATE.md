# CADF — current implementation and remaining connections

Updated 16 October 2026 by Codex. This is the current handoff; historical setup notes may describe older UI and workflows.

## Owner experience

- Submit a project name and a brief. Deliverables, measurable acceptance criteria and assignments are proposed by the coordinators. Projects can concern development, marketing, opportunity research, job-search preparation, business operations or creative work.
- The ChatGPT-account planner runs through Codex; the Gemini planner runs through Antigravity. These are CLI routes, not synchronization with the standalone ChatGPT/Gemini chat websites.
- Planning may use existing account quota after submission. The execution team remains stopped until the owner reviews and approves the exact current plan. Changes to requirements/decisions invalidate earlier execution approval. Invalid, stale or blocked plans cannot start work.
- Current automated execution supports bounded text drafting and review. It does not autonomously implement code, search the live web, submit job applications, contact customers or publish campaigns. Plans must disclose unsupported capabilities as blockers.
- Team execution is sequential, at most six approved tasks per plan; dependencies carry actual returned artifacts. A reviewer cannot be the same agent/model as the draft it reviews. Artifacts require owner acceptance, then the owner can close the project.
- Pause stops further dispatch and requests termination of active work. Resume prepares a fresh plan. Quota failures block the affected assignment and its dependencies while unrelated, already-approved assignments continue. Authentication/safety failures stop workflow progression. Reassignment still requires a revised owner-approved plan; there are no automatic paid fallbacks or retries.

## Queue and readiness

The orchestrator now exposes **Queue** and **Readiness** tabs. The queue uses the same ordering as actual dispatch: project priority first, FIFO within a priority, with requests waiting at least ten minutes promoted ahead of newer work. It never interrupts an active request. Paused/closed projects and unapproved/stale assignments cannot dispatch. The worker rechecks scope, owner approval, a recomputed fingerprint of the approved plan content, selected agent/model and delivered dependencies immediately before launching an assigned task. Execution bookkeeping does not invalidate that fingerprint.

Readiness explains local-worker connectivity, project state, exact plan approval and the latest observed availability of required routes. It is advisory evidence, not a quota reservation or a claim that an untested future run will succeed. A failed model check never grants permission to reassign the approved plan.

## Chat and privacy

Each project has separate rooms for Codex, Antigravity default, every available AG model profile, Grok manual handoff, and the group. Message histories, unsent in-session drafts and reply targets stay in their room. The backend filters room history and versioned records before constructing each prompt. Quoting a message into a different room is rejected. The owner can view/download all project records locally.

Group sends explicitly queue seven bounded replies: Codex plus six AG model profiles. They use the shared group context; no private room history is broadcast. This consumes existing provider quota. Grok is excluded and stays manual/standby. No background model runs begin merely by opening an agent card.

Enter sends; Shift+Enter inserts a line. A Reply keeps its original message link; a reply to a blocker defaults to Decision. Decision, Requirement, Progress, Idea and Blocker types display their destination before sending and create versioned records. Ordinary conversation is not silently treated as an approved requirement. The application does not yet automatically classify every free-form chat sentence.

These are application-level room/context boundaries on a single-user local workspace, not encrypted multi-user access controls or separate operating-system sandboxes. Drafts survive room/project switching in the current page, not a browser reload. Imported Grok replies and downloadable Grok handoff history stay in the private Grok room. Private files are excluded from Git/source bundles.

## Available Antigravity model profiles

- Gemini Flash High — `gemini-3.8-flash-high`
- Gemini Flash Medium — `gemini-3.8-flash-medium`
- Gemini Flash Low — `gemini-3.8-flash-low`
- Claude Sonnet — `claude-sonnet-4-6`
- Claude Opus — `claude-opus-4-6-thinking`
- GPT-OSS — `gpt-oss-120b-medium`

These IDs were exposed by the installed Antigravity CLI. They are separate model contacts, not six independently authenticated services. Availability and current quota are distinct. Each dispatch checks that paid-credit fallback is explicitly disabled. The installed AG binary marks this setting `omitempty`, so it can remove a false value when saving preferences. CADF now restores an omitted value to explicit false before dispatch, preserves other preferences, and rejects enabled, invalid, missing or symlinked settings. This matches the documented default in [Google’s CLI reference](https://www.antigravity.google/docs/cli/reference/) and [credit settings](https://www.antigravity.google/docs/cli/credits/), checked 16 October 2026.

At the owner’s request, eight bounded live availability checks ran on 16 October 2026, 09:43–09:45 SAST. Codex returned successfully. Antigravity default, Gemini Flash High/Medium/Low, Claude Sonnet, Claude Opus and GPT-OSS all reported provider quota limits. No provider credit balance or reset time was supplied. A further owner-started batch finished at 10:06–10:08 SAST with the same results: Codex responded and all seven AG routes were quota-limited. These are observations at those times, not permanent availability guarantees. Existing failed chat requests were not retried.

Agents → Availability shows each route’s latest result, check time, worker connectivity and optional individual/all-agent checks. Checks consume existing allowance and are never scheduled automatically. A quota failure does not prevent another route’s check or group reply. Grok remains manual and is excluded. The contact chooser and participant cards show the same observed status.

## Interface and documents

The active section's title, selector and worker status occupy the top bar. There is no manual refresh button. Snapshots refresh every 12 seconds while visible, on window focus and after mutations; unchanged content is not redrawn. The timestamp remains visible. Light, dark and system themes use one design system with reduced-motion support.

The CADF logo/name and three-line toggle live together in the side menu. Only the toggle remains when the menu is hidden. On phones/tablets the menu is a dismissible drawer. Chat has no sidebar: click the current conversation’s circle to open a searchable grid of agent/group circles over a blurred background. Escape, close or clicking outside dismisses it. Choosing a contact preserves isolated room drafts. Chat fills the available window with no nested card frame. The compact composer uses an idea-icon message-type menu, expanding textarea and circular send button. Reply, Decision, Requirement and message-info controls sit below each bubble. Message content renders headings, bold text, lists, code blocks and safe web links; pasted HTML remains inert text. Recipient selection is solely through the contacts chooser. Message info shows who can receive that room’s message and recorded dispatch/response states; it does not claim human-style read receipts. Attachment upload is disabled because storage was deferred by the owner. Section tabs sit in the application header, replacing duplicate headings. Project management offers Table, Kanban, Gantt, Deliverables, Documents and Dates & priority. Search/sort/pagination operate on project lists, outcomes, tasks, agents, activity, execution records and documents. Status/channel/category filters appear where relevant. The redundant project-name row in the project body was removed. Dense tables/Gantt charts scroll within their own panels on small screens. Charts are derived from actual records; no synthetic audience, revenue or completion metrics are displayed.

Word (`.docx`), formatted HTML and Markdown downloads are generated on demand from stored information, with project identity, a banner, headings, provenance and status. Downloading invokes no model. The HTML version can be printed to PDF. A native one-click PDF generator is not implemented. Record JSON remains canonical; Markdown mirrors live in `.agents/project-records/`.

## What still needs integration

1. **Meta/Facebook/Instagram:** no connected assets, access authorization, publishing adapter or analytics connector. The owner deferred linking until later. Marketing → Connections includes a setup path to Meta Business Suite, Metricool and its official eligibility guide. The Page/Instagram account and connector authorization are still required, as is an implemented CADF connector bridge. Opening Business Suite is not a connection. Same Google/email identity does not establish Meta permissions.
2. **Live job/customer research and outreach:** no browsing, job-board, CRM or messaging adapters in the background worker. It can draft plans and collateral from supplied context. Actual external messages/applications require an integrated, explicitly approved action.
3. **Autonomous development/release:** the worker is bounded planning/drafting/review only. It needs isolated working-copy execution, change review, meaningful tests and approved deployment/push adapters before it can build/release autonomously.
4. **Grok:** free website/app manual handoff only, on standby. No free API entitlement has been established.
5. **Gemini CLI:** OAuth was authorized, but observed provider rejection still prevents verified standalone CLI service access. The planning route uses AG instead. Observed per-model quota failures are now surfaced in Availability, but credit counts/reset times are not exposed. All tested AG routes were quota-limited in the latest check.
6. **Cloud storage:** a clearly labelled future section; no uploads, cloud drive, backups, indexing or attachments integration. The greyed attachment button explicitly reflects this. Future storage must separate each private room from a deliberately shared team area.
7. **Natural-language triage:** explicit record types are implemented; general chat is not automatically classified into all project documents. No recurring daily summarizer has been scheduled.
8. **Hosting/reliability:** the local app runs while its process and Mac are running. No always-on hosting or startup service has been installed. Responsive layouts were tested in browser viewports; this is not physical-device verification. The loopback URL is accessible on this Mac only. Reaching it from a real phone/tablet needs a separately approved secure access/hosting setup; no network exposure was added.
9. **Git review:** the owner authorized source publication on `cadf/command-centre` and a draft PR into `develop`. No review acceptance, merge or production release is claimed.

## Verification

**78 automated tests passed**, plus the repository structure checker and all three JavaScript syntax checks. Automated tests use temporary stores and simulated CLI responses, checking exact-plan approval, stale/tampered plan rejection, scope invalidation, dependency handoffs, failures, private context isolation, per-model routing, group broadcast, date validation, document export, HTTP origin/path restrictions and zero-paid-fallback guards. Browser checks use an isolated fixture with no agent worker, covering navigation, view switching, filtering, pagination, direct/group messages, room drafts, keyboard sends, document links and both themes. Fixture data is not added to the owner's workspace. Phone (390×844), tablet portrait (768×1024), and tablet landscape (1024×768) layouts were inspected. The slim composer, private draft switching, Enter/Shift+Enter, decision replies, circular contacts and final navigation toggle were rechecked after their refinements. Temporary viewport overrides were removed.

## Hosting and native-client preparation — 16 October 2026

The owner selected a private single-user hosted workspace as the next target and reported no prior AWS/Azure account. AWS Free was selected; the owner completed signup and the Free plan was verified. EC2 availability was inspected without launching resources. Remote/local `develop` and `testing` now exist at the original public `main` baseline; application code is proposed separately through `cadf/command-centre`. CI and a PR template are included; check GitHub for actual run results. See `docs/HOSTING-OPTIONS.md` and `docs/RELEASE-AND-SYNC.md` for the researched service comparison, shared API/data architecture, native SwiftUI/AppKit client direction and approved release pipeline. The owner created the AWS Free account. No compute resource, public endpoint, native app or updater was created. Mini-project triggers are explicitly deferred in IDEA-007.
