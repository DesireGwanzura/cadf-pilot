# CADF command centre

A local, chat-led workspace for projects, agent coordination, delivery tracking and marketing preparation. Built with Python's standard library and HTML/CSS/JavaScript. No new paid API or cloud service is required.

## Run

From this application directory:

```sh
python3 scripts/serve.py --port 8765 --orchestrate
```

Open http://127.0.0.1:8765. Omit `--orchestrate` for a UI-only session. Stop with Ctrl+C. The dashboard binds only to localhost. It creates the private project store from `.agents/PROJECTS.template.json` when absent.

## Use

1. Submit a project name and a brief. The Codex/ChatGPT-account and Gemini/AG planners propose outcomes and assignments using existing account quota.
2. Review the exact plan in Team chat → Plan review. No execution tasks start before your approval.
3. Converse privately with an agent or broadcast in the team room. Enter sends; Shift+Enter starts a new line. Each room keeps separate context and drafts.
4. Reply as Decision or Requirement change to record a versioned change. Changed scope requires a revised approved plan.
5. View Table/Kanban/Gantt, artifacts and documents under Project workspace. Adjust dates/priority. Download Word, formatted HTML or Markdown on demand.
6. Accept delivered artifacts and close finished projects.

The interface has light/dark/system themes, section tabs, search, sorting, filters, pagination and automatic snapshot refresh. Marketing displays actual local drafts and explicit connection gaps. Storage is a future feature.

## Important boundaries

The worker currently executes bounded text planning, drafting and review. It does not autonomously edit project code, search the live web, contact customers, apply for jobs, publish posts or deploy. Those adapters remain future work. Meta is not connected. Grok is manual/standby. AG model availability does not establish remaining quota. No automatic paid fallback is allowed.

Read **docs/CURRENT-STATE.md** first for the full current handoff, known limitations and test evidence. Historical documents describe earlier setup decisions.

## Verify

```sh
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s tests -v
node --check web/app.js
node --check web/supervision.js
node --check web/workspace.js
bash scripts/check.sh
```

Automated model tests use simulated processes, not live paid inference. Browser fixtures are kept outside the source application.

## Records and privacy

`.agents/PROJECTS.json` holds local projects, messages, versions, jobs and campaign drafts; `.agents/project-records/` mirrors versioned documents. `.cadf-runtime/` holds worker outputs. These private paths are ignored by Git and excluded from downloadable source bundles. This is a single-user local app, not an encrypted multi-user service.

The owner authorized publication of `cadf/command-centre` and a draft PR into `develop`. Independent review, integration and production approval remain pending.

## Hosting and native-client preparation

Read [hosting options](docs/HOSTING-OPTIONS.md) and [release/data synchronization architecture](docs/RELEASE-AND-SYNC.md). Remote `develop` and `testing` branches now exist at the original main baseline; the application is proposed separately through `cadf/command-centre`. CI checks are included, but no hosted deployment, native Mac client or automatic updater is claimed. Mini-project triggers are deferred.
