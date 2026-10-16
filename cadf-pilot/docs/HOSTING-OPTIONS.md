# Hosting decision — private CADF pilot

Researched 16 October 2026. Status: owner selected AWS Free for the private pilot; signup and Free-plan verification are complete. No cloud resource, public endpoint or external project-data copy has been created.

## Owner requirements

- Private to the owner initially; use the existing Google identity where the identity provider supports it.
- Web and genuinely native macOS clients share projects, messages, approvals and artifacts.
- Approved GitHub releases update the deployed service and produce native app updates.
- No additional spending or paid model fallback. Owner handles sign-in, identity verification and service agreements.
- Android is a later client of the same API. Triggered mini-projects are explicitly deferred.

## Services compared

| Option | Verified free offer | Fit and limitations |
| --- | --- | --- |
| AWS Free plan | New customers receive $100 credits initially and can earn up to $100 more. Free plan runs until six months or credit exhaustion; account access then stops unless upgraded. | Recommended trial candidate. EC2 and storage are available, so a conventional backend can be piloted. Restricted service eligibility must be checked in the actual account. This is temporary hosting, not a permanent free production commitment. |
| Azure free account | $200 credit for 30 days, with specified monthly free services. Continuing after the trial or credit exhaustion requires moving to pay-as-you-go. Without that move, services are disabled. | Viable short experiment, but a shorter protected trial than AWS. Twelve-month service allowances do not mean all hosting is free for twelve months. |
| Cloudflare Workers Free | 100,000 requests/day, 10 ms CPU per invocation, with separate storage quotas. | Useful longer-term option for a small control API and static UI. Our Python HTTP server, file locks and subprocess-based CLI worker are not a drop-in deployment. Requires a storage/API redesign and a separate execution runner. |
| Supabase Free | Two free projects across owner/admin organizations; low-activity free projects may pause after seven days. | Candidate for shared database/authentication, not a host for our Mac CLI processes. Inactivity pause and backup limitations conflict with a promise of uninterrupted access. |

**Recommendation:** inspect an AWS Free-plan account first, without upgrading to Paid or enabling paid-only services. The owner reports no previous AWS or Azure accounts, but eligibility remains the provider's decision. Do not start a trial on both platforms unnecessarily.

AWS's advertised $200 is a maximum, not all automatic credit. Cost alerts alone are not a spending cap. Keep the account on its verified Free plan, avoid paid-only activation, and display its actual remaining credit and expiry once an authorized billing adapter exists. No such billing adapter exists today. Export data before expiry: AWS says account access is suspended at expiry, with retention for 90 days and recovery requiring an upgrade.

An initial compute sizing quote must include storage, backups, outbound transfer, public IPv4, TLS delivery and identity—not only the advertised VM price. Region, allowed instance types and identity/TLS service choices remain account-dependent. Do not provision a resource until its plan eligibility and estimate are visible.

## Account inspection outcome

The owner completed signup through Google. The billing screen confirmed the Free plan and no amount due. EC2 is available in the account’s initial region; an eligible small-instance configuration was inspected without launching it. Account identifiers, personal contact details and the exact billing observation are retained outside Git in the local handoff. No IAM credential, agent-toolkit access grant, cloud resource or data migration was created.

## Migration required before hosting

The current `serve.py` is explicitly a loopback-only, single-owner local server. Its Host/Origin checks and per-process write token are not internet user authentication. Do not expose it by changing the bind address or putting an unauthenticated tunnel in front of it.

1. Introduce authenticated, versioned API endpoints and owner-only authorization on reads, mutations, downloads and live updates. Disable public registration or enforce the verified owner identity. Keep tokens out of frontend source and Git.
2. Separate source deployment from persistent data. Migrate the private JSON store into a transactional canonical database. Back up and test restore before migration; do not sync two independently writable JSON files.
3. Separate dispatch from request handling. Give runners revocable, narrowly scoped registration, durable job leases, heartbeats and duplicate-result protection. A browser is never the scheduler.
4. Place the service behind HTTPS and a supported production server/proxy. Add rate limits, session revocation, request limits, logging without private prompt content and authenticated exports.
5. Validate the same project from two clients: messages, dates, revisions and approval invalidation must agree; simultaneous edits must produce a conflict or explicit merge, never silent overwrite.
6. Verify provider support and entitlement before moving CLI execution into the cloud. Current Codex and AG sign-ins reside on this Mac. A hosted dashboard alone does not make these agents available when the Mac is off. No silent migration to paid inference is allowed.

For the first authenticated pilot, one backend instance with a persistent transactional database is sufficient; horizontal scaling is not a prerequisite. SQLite on a persistent single-host volume or managed SQL are candidates, selected with the hosting architecture. Ephemeral function/container filesystems are not persistent storage. This document is not a claim that cloud migration is implemented.

## Account handoff

After provider selection, the owner opens the official signup page and completes authentication, verification and acceptance of agreements. Keep passwords, verification codes, card details and recovery codes out of chat. Once signed in, verify the Free plan, region/service availability, initial credit, expiry and allowed resource types. Prepare an owner-readable deployment estimate before resource creation. No paid conversion is authorized by this research.

## Primary sources

- [AWS Free Tier](https://aws.amazon.com/free/) and [Free Tier FAQs](https://aws.amazon.com/free/free-tier-faqs/): credit amounts, new-customer eligibility, expiry, account suspension and plan restrictions.
- [Azure account options and FAQ](https://azure.microsoft.com/en-us/pricing/purchase-options/azure-account): trial credit, spending protection and continuation rules.
- [Cloudflare Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/): request/CPU and storage allowances.
- [Supabase billing](https://supabase.com/docs/guides/platform/billing-on-supabase) and [Free project pausing](https://supabase.com/docs/guides/platform/free-project-pausing).

Offers were checked on the date above. Account-console terms and eligibility must be rechecked before provisioning.
