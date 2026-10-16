# Private workspace on a public HTTPS address

The website can be reached from a phone anywhere. Owner authentication protects every project, conversation, export and application asset. The initial pilot uses a randomly generated workspace access key, secure HttpOnly session cookie and login throttling. This is not Google OAuth; a Google OAuth application registration is a separate integration. Keys are kept outside the repository. Rotate the key and restart the gateway to revoke all existing sessions.

## Deployment

`deploy/install-server.sh https://your-hostname` installs services on Amazon Linux 2023, using the verified official Caddy 2.11.7 binary. Keep the backend and authentication gateway bound to loopback. Only Caddy serves the internet. Allow HTTP/HTTPS publicly; restrict SSH administration to the owner's current IP. Use encrypted EBS, required IMDSv2 and the AWS Free plan. Do not enable a paid plan, load balancer, managed database or paid model billing.

The source clone lives at `/opt/cadf-source`. The writable canonical workspace lives at `/var/lib/cadf/workspace`. Its atomic, locked JSON store remains the pilot persistence layer; it is not a distributed SQL database. Both clients use the same revision-checked API. Private files survive source updates and are excluded from Git. Encrypted disk protects at-rest data; access control protects transport and application access. Backups on the same disk cover application rollback, not total disk/account loss. Export and preserve an owner-held backup before Free-plan expiry.

Services: `cadf-backend`, `cadf-gateway`, `cadf-https`. `cadf-update.timer` checks `main` every five minutes. An update runs Python tests from staged source, retains a private backup, replaces public application files, restarts the service and verifies the backend. A failed health check restores the previous source. Schema migrations that are not backward-compatible are not supported by this updater; add an explicit migration/recovery procedure before introducing them.

## Mac runner

`python3 scripts/remote_runner.py --origin https://your-hostname --key-file /private/path/access-key --workspace /private/path/runner`

Use owner-only key-file permissions. A single runner uses the owner's existing CLI logins, model allowlists and no-paid-fallback checks. Jobs require the same approval/preflight as local mode. Results are returned to the shared server. Leases expire after 90 seconds without renewal; interrupted jobs are not automatically retried. Result delivery retries never repeat the provider call. The cloud host remains available while the Mac sleeps, but local model execution does not. A dedicated background service is required for unattended Mac runner startup; do not claim this until installed and verified.

## Native Mac client

Build with `bash native/build.sh /path/to/CADF.app` on an Apple Silicon Mac with Swift tooling. The application is ad-hoc signed for the owner's Mac. It uses native SwiftUI controls, macOS Keychain for hosted credentials, shared API polling, separate room drafts and the existing owner workflow. Local mode starts the existing repository server if needed, using the path embedded at build time. Hosted mode connects to the configured HTTPS address.

Full native parity, Android packaging and cryptographically verified automatic Mac binary releases remain separate work. Web backend/data updates are already shared by clients using the same server; that does not itself update a native executable.
