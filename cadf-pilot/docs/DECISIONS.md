# Decision log

## D001 — Root instructions
Status: bootstrap choice, awaiting Gemini review.
Use root AGENTS.md and explicit onboarding instructions. Tool discovery differs; no universal automatic loading is assumed.

## D002 — Local first, command center deferred
Status: bootstrap choice, awaiting human baseline approval.
Use files and Git first. No remote repository has been created or configured. Do not claim external participants have joined.

## D003 — Single coordinator for shared state
Status: bootstrap choice, awaiting Gemini review.
Keep one writer for canonical task/state files during the pilot. This avoids pretending that unimplemented task locks provide concurrency control.

## D004 — Dependency-free state parsing
Status: bootstrap implementation choice, awaiting review.
State files use JSON syntax, a YAML 1.2 subset, so Python's standard library can validate them. Preserve that syntax until a reviewed YAML parser is introduced.

## D005 — Owner-requested command centre
Status: owner requested implementation in current task; implementation pending review.
The repository now exists at DesireGwanzura/cadf-pilot. Main is the owner-confirmed baseline. Implement a local read-only dashboard now; this supersedes D002 deferral and its outdated remote claim. No research review, baseline acceptance or external participant activity is implied.

## D006 — Reconstruct missing upload contents
Status: implementation choice awaiting review.
Original Git upload omitted .agents and empty research folders. Restore records from the written protocol, explicitly marking unknown history. Preserve JSON syntax in YAML files and single-coordinator writes.
