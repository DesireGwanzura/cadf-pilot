# Conversations and project records

The owner works mainly in chat. New projects require a name and a brief; the coordinators generate proposed deliverables, assignments and acceptance criteria. Team execution waits for owner approval of the exact plan.

Choose a contact for a private room, or Everyone for the shared group. Each project/room keeps separate message history, unsent page-session drafts and reply selection. The server rejects cross-room reply targets and excludes other rooms from model prompts. Group sends broadcast to Codex and six AG model profiles, using existing account quota. Grok is a manual handoff only.

Enter sends and Shift+Enter adds a line. Use Reply to quote a message. Replies to blockers default to Decision; the composer displays where the message will be recorded. Decision, Requirement change, Progress update, Idea and Blocker create attributed, versioned records. A scope change invalidates prior team approval. Ordinary chat is not silently promoted to an approved decision.

Private decisions remain private in model context; they are not included in the coordinators' group planning prompt. If a private decision changes shared project scope, the owner must deliberately share the necessary scope in the group before requesting a revised team plan.

Project workspace → Documents exposes versions and on-demand Word/HTML/Markdown downloads. Deliverables contains actual returned artifacts, with their source and acceptance state. JSON is canonical; `.agents/project-records/` contains derived Markdown mirrors. These files and private transcripts are ignored by Git.

The owner can inspect outstanding issues in Needs you, reply to the original message, review plans in Plan review, accept delivered work and close a project. An individual agent's issue stays in its room; a team-scoped issue is recorded in the group. No fabricated agent response or approval is inserted.

See `docs/CURRENT-STATE.md` for current limitations and integration status.

## Latest navigation

Click the current room’s circular avatar to choose a direct agent room or the group from a searchable circle grid. The background blurs while choosing. The chat sidebar and recent-contact strip were removed. Messages, Plan review, Needs you and Manual handoffs are now in the application header. Main navigation retains its own hamburger.


## Latest chat refinement — 16 October 2026
The composer now uses an idea-icon record-type chooser, one expanding text field, disabled attachment placeholder and circular send control. Recipient controls are hidden because the contact circles select the room. Message actions and timestamp sit outside the bubble. Info shows eligible room recipients and recorded dispatch/response evidence; providers do not supply read receipts. Unsent drafts and reply/type choices remain per room. Enter sends; Shift+Enter inserts a newline. Grok exports include only the Grok room history, never another private room. Storage is deferred.
