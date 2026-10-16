> Current implementation: read [CURRENT-STATE.md](CURRENT-STATE.md) first. Older entries below are historical and may describe superseded controls or assignments.

# Integration register

Observed 2026-10-16. Installation, authentication, inference, automation and approval are different states.

| Participant/service | Observed state | Joining route | Remaining limitation |
|---|---|---|---|
| Codex / ChatGPT account | CLI login and real bounded response verified | Approved CADF planning jobs or this Codex task | Uses account quota; no API billing; standalone ChatGPT chats are separate |
| Antigravity / Google Gemini route | App/project open; agy real response verified; paid-credit fallback disabled | Owner-approved planning, drafting and review | App and CLI settings differ; provider quota is not measured by CADF |
| Gemini CLI 0.64.0 | Installed; Owner confirmed Google browser authorization; CLI service access rejected by provider | Use verified Antigravity route | OAuth authorization does not establish working CLI service access |
| Standalone ChatGPT chat | No direct folder connector verified | Supply common brief and own research context; return a handoff file | Cannot assume local file visibility or auto synchronization |
| Standalone Gemini chat | No direct folder connector verified | Same explicit handoff workflow | Do not reuse the blocked CLI as a claimed integration |
| Meta AI / Muse | Not connected | Verify actual account and region availability | No current account entitlement or automated route verified |
| Facebook / Instagram | Accounts and business assets not identified | Owner sign-in and asset selection in Meta Business Suite | No linking, professional-account conversion or posting completed |
| Metricool | Plugin discovered, not connected | Owner installs/connects free eligible account | Free plan limits and connector entitlement must be checked |
| Canva | Plugin discovered, not connected | Owner installs/connects account | AI credits/paid-only features must not add charges |
| Windsor.ai | Plugin discovered, not connected | Owner installs/connects selected accounts | Verify free-plan source limits and exact write permissions |

## Handoff contract for chat-only participants

Give each participant AGENTS.md, PROJECT-BRIEF.md, the relevant task and its own allowed context. Ask for a dated artifact containing assumptions, evidence, changed/proposed files, test results actually observed, unresolved questions and requested status. The coordinator imports it and records provenance. Never paste credentials or private employer material into a public marketing context. For independent discovery, do not supply the other participant's report until both are frozen.

## Owner inputs still needed

- Actual Facebook Page/Instagram account links and which identity they represent.
- Whether personal branding or one product is the first campaign; final brand name, audience and approved public evidence.
- Authorization through the provider connection screens for the chosen marketing plugin(s), restricted to free entitlements.
- Review findings and acceptance before commit/push/publication.

Sources: https://learn.chatgpt.com/docs/non-interactive-mode ; https://antigravity.google/docs/cli/reference ; https://antigravity.google/docs/cli/credits/ . The observed Gemini CLI rejection overrides generic documentation suggesting its sign-in should work.


## Account consistency and connection completion

Owner requests the same Google account/email across services where supported. This is a preference, not verified account identity: no cross-service email match has been established. Use the owner-selected Google account for Google authorization; do not create duplicate accounts or change existing login identities silently. A Meta account may use the same email but still needs separate Meta sign-in, business-asset selection and permissions. Existing ChatGPT and GitHub logins remain in place pending any owner-requested account change.

Every integration must retain evidence of the last successful action and any blocker. Installation, owner-confirmed authorization and a successful worker reply are separate facts. Until provider connections are completed, marketing content stays local and no posting, messages, campaigns or advertising spend is enabled.

## Grok — future team participant
Owner has the basic free Grok plan and explicitly wants it on standby for future projects, not working now. CADF offers an optional downloaded brief and owner-pasted response workflow. No Grok API, credential, automatic invocation or paid route is configured. Imported replies are labelled owner-supplied, not independently authenticated. Official API billing is separate: https://docs.x.ai/developers/faq/accounts . No task was sent to Grok.

## Deferred social linking — owner instruction

The owner chose to link accounts later. Marketing → Connections exposes provider setup links and the remaining bridge work. On 16 October 2026, the installed plugin directory listed Metricool and Windsor.ai as available but uninstalled; earlier suggestions were not repeated. The official [Metricool MCP limits guide](https://help.metricool.com/mcp-limits-and-plan-requirements-h72jg) states that MCP supports Free accounts within their existing plan limits; ordinary API access requires a higher plan. This makes its authorized MCP route a candidate, not a CADF connection already implemented. Opening a provider or installing a chat plugin does not automatically wire this local app to it. No login, new permissions, publishing or spending occurred.
