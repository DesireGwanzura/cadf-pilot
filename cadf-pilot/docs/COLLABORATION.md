# Collaboration and recovery

1. Coordinator assigns one owner and a different reviewer in .agents/TASKS.yaml. READY tasks cannot start until their dependencies are COMPLETED.
2. Owner reads only common context and their own report during independent discovery. Separate contexts/checkouts are required for stronger isolation. Both reports must freeze before cross-review.
3. Owner works in a separate branch/worktree; submits the handoff template with changed paths and test evidence.
4. Coordinator records READY_FOR_REVIEW. Reviewer submits a dated finding document referencing the exact diff/commit. Coordinator records IN_REVIEW then APPROVED or CHANGES_REQUESTED only from actual reviewer evidence.
5. Human accepts and integrates, then marks COMPLETED. Append an ACTIVITY.jsonl entry for every canonical update. Run checks before committing.

Files are the source of truth; the dashboard reads them each refresh. It cannot enforce authorship or independence. No messages are dispatched automatically. Unsubmitted independent reports are deliberately excluded from the dashboard.

On a conflict, stop shared edits, preserve both branches, compare changes and let the coordinator resolve. On malformed data, the dashboard rejects the refresh and labels prior data stale. Fix the file or restore its last reviewed version using Git; never silently reset a colleague's work.
