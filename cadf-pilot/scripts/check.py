#!/usr/bin/env python3
"""Dependency-free structural validation; does not certify human approvals."""
import json
from pathlib import Path

root = Path(__file__).resolve().parents[1]
required = ["AGENTS.md", "README.md", "docs/PROJECT-BRIEF.md", "docs/DECISIONS.md", "docs/REPORT-TEMPLATE.md", "docs/HANDOFF-TEMPLATE.md", "docs/GEMINI-REVIEW.md"]
for name in required:
    assert (root / name).is_file() and (root / name).stat().st_size, f"Missing/empty {name}"
for name in ["independent/chatgpt", "independent/gemini", "consolidated"]:
    assert (root / "docs/research" / name).is_dir(), f"Missing research directory {name}"
state = json.loads((root / ".agents/PROJECT_STATE.yaml").read_text())
assert state["project"]["phase"] in {"BOOTSTRAP_REVIEW", "INDEPENDENT_DISCOVERY", "CONSOLIDATION", "IMPLEMENTATION"}
tasks = json.loads((root / ".agents/TASKS.yaml").read_text())["tasks"]
by_id = {t["id"]: t for t in tasks}
assert len(by_id) == len(tasks), "Duplicate task IDs"
allowed = {"READY", "IN_PROGRESS", "READY_FOR_REVIEW", "IN_REVIEW", "CHANGES_REQUESTED", "APPROVED", "COMPLETED", "BLOCKED"}
for task in tasks:
    assert task["owner"] != task["reviewer"], f"Self review: {task['id']}"
    assert task["status"] in allowed, "Invalid status"
    assert task["acceptance_criteria"] and task["deliverables"], "Missing task definition"
    for dep in task["dependencies"]:
        assert dep in by_id and dep != task["id"], "Invalid dependency"
        if task["status"] not in {"READY", "BLOCKED"}:
            assert by_id[dep]["status"] == "COMPLETED", "Started before dependencies complete"
    for name in task["deliverables"]:
        path = Path(name)
        assert not path.is_absolute() and ".." not in path.parts, "Unsafe deliverable path"
        if task["status"] in {"READY_FOR_REVIEW", "IN_REVIEW", "APPROVED", "COMPLETED"}:
            assert (root / path).is_file(), f"Missing submitted deliverable {name}"
    if task["status"] in {"APPROVED", "COMPLETED"}:
        assert task["evidence"], "Approval requires evidence references"
def visit(key, stack):
    assert key not in stack, "Dependency cycle"
    for dep in by_id[key]["dependencies"]:
        visit(dep, stack + [key])
for key in by_id:
    visit(key, [])
print(f"PASS: required files, state syntax and {len(tasks)} task definitions. No review or independence certification implied.")
