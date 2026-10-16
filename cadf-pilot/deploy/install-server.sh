#!/bin/bash
# Amazon Linux 2023, run once as root. No model credentials live on this host.
set -euo pipefail
umask 077
[[ $EUID == 0 ]] || { echo 'Run as root'; exit 1; }
origin="${1:?Pass the exact HTTPS origin}"
[[ "$origin" =~ ^https://[a-zA-Z0-9.-]+$ ]] || exit 1
repo_root="$(cd "$(dirname "$0")/../.." && pwd)"
dnf install -y python3 git rsync tar gzip
id cadf >/dev/null 2>&1 || useradd --system --create-home --home-dir /var/lib/cadf --shell /sbin/nologin cadf
install -d -m 700 -o cadf -g cadf /var/lib/cadf/workspace /var/lib/cadf/backups /var/lib/cadf/caddy
rsync -a --exclude '.git' --exclude 'PROJECTS.json' --exclude '.cadf-runtime' --exclude 'project-records' --exclude '__pycache__' "$repo_root/cadf-pilot/" /var/lib/cadf/workspace/
chown -R cadf:cadf /var/lib/cadf
if [[ ! -f /var/lib/cadf/access-key ]]; then
    python3 - <<'PY'
from pathlib import Path
import secrets
p=Path('/var/lib/cadf/access-key');p.write_text(secrets.token_urlsafe(48)+'\n');p.chmod(0o600)
PY
    chown cadf:cadf /var/lib/cadf/access-key
fi
curl --fail --location --proto '=https' --tlsv1.2 'https://github.com/caddyserver/caddy/releases/download/v2.11.7/caddy_2.11.7_linux_amd64.tar.gz' -o /tmp/cadf-caddy.tar.gz
printf '%s  %s\n' '727b91701a392de6ebc5027509f548bf39979e5216340d0faed8fa5e69c84f8b' /tmp/cadf-caddy.tar.gz | sha256sum -c -
tar -xzf /tmp/cadf-caddy.tar.gz -C /usr/local/bin caddy
chmod 755 /usr/local/bin/caddy
install -d -m 755 /etc/cadf
printf '%s\n' "$origin" > /etc/cadf/origin
cat > /etc/cadf/Caddyfile <<EOF
${origin#https://} {
    encode gzip
    request_body {
        max_size 150KB
    }
    header {
        Strict-Transport-Security "max-age=31536000"
        -Server
    }
    reverse_proxy 127.0.0.1:8767
}
EOF
cat > /etc/systemd/system/cadf-backend.service <<'EOF'
[Unit]
Description=CADF workspace API
After=network.target
[Service]
User=cadf
Group=cadf
WorkingDirectory=/var/lib/cadf/workspace
ExecStart=/usr/bin/python3 /var/lib/cadf/workspace/scripts/serve.py --port 8765
Restart=on-failure
UMask=0077
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ReadWritePaths=/var/lib/cadf
ProtectHome=true
[Install]
WantedBy=multi-user.target
EOF
cat > /etc/systemd/system/cadf-gateway.service <<EOF
[Unit]
Description=CADF owner authentication
After=cadf-backend.service
[Service]
User=cadf
Group=cadf
ExecStart=/usr/bin/python3 /var/lib/cadf/workspace/scripts/hosted.py --origin $origin --key-file /var/lib/cadf/access-key
Restart=on-failure
UMask=0077
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
[Install]
WantedBy=multi-user.target
EOF
cat > /etc/systemd/system/cadf-https.service <<'EOF'
[Unit]
Description=CADF HTTPS
After=network-online.target cadf-gateway.service
Wants=network-online.target
[Service]
User=cadf
Group=cadf
ExecStart=/usr/local/bin/caddy run --config /etc/cadf/Caddyfile --adapter caddyfile
Restart=on-failure
Environment=XDG_DATA_HOME=/var/lib/cadf/caddy
Environment=XDG_CONFIG_HOME=/var/lib/cadf/caddy
AmbientCapabilities=CAP_NET_BIND_SERVICE
CapabilityBoundingSet=CAP_NET_BIND_SERVICE
NoNewPrivileges=true
ProtectSystem=strict
ReadWritePaths=/var/lib/cadf/caddy
ProtectHome=true
[Install]
WantedBy=multi-user.target
EOF
chmod 644 /etc/systemd/system/cadf-*.service /etc/cadf/Caddyfile /etc/cadf/origin
install -m 755 "$repo_root/cadf-pilot/deploy/update-server.sh" /usr/local/sbin/cadf-update
cat > /etc/systemd/system/cadf-update.service <<'EOF'
[Unit]
Description=Update CADF from production main after local checks
[Service]
Type=oneshot
ExecStart=/usr/local/sbin/cadf-update
TimeoutStartSec=180
EOF
cat > /etc/systemd/system/cadf-update.timer <<'EOF'
[Unit]
Description=Check CADF production source every five minutes
[Timer]
OnBootSec=5min
OnUnitActiveSec=5min
[Install]
WantedBy=timers.target
EOF
git -C "$repo_root" rev-parse HEAD > /var/lib/cadf/deployed-commit
systemctl daemon-reload
systemctl enable --now cadf-backend cadf-gateway cadf-https cadf-update.timer
