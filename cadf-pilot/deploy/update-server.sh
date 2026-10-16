#!/bin/bash
set -euo pipefail
umask 077
exec 9>/var/lock/cadf-update.lock
flock -n 9 || exit 0
source_repo=/opt/cadf-source
git -C "$source_repo" fetch origin main
revision=$(git -C "$source_repo" rev-parse origin/main)
[[ "$revision" != "$(cat /var/lib/cadf/deployed-commit)" ]] || exit 0
stage=$(mktemp -d /tmp/cadf-release.XXXXXX)
trap 'rm -rf "$stage"' EXIT
git -C "$source_repo" archive "$revision" | tar -x -C "$stage"
chmod -R a+rX "$stage"
(cd "$stage/cadf-pilot" && runuser -u cadf -- env PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s tests)
previous=$(cat /var/lib/cadf/deployed-commit)
tar -czf "/var/lib/cadf/backups/pre-${revision}.tar.gz" -C /var/lib/cadf/workspace .agents
systemctl stop cadf-gateway cadf-backend
rsync -a --exclude 'PROJECTS.json' --exclude '.cadf-runtime' --exclude 'project-records' --exclude '__pycache__' "$stage/cadf-pilot/" /var/lib/cadf/workspace/
chown -R cadf:cadf /var/lib/cadf/workspace
systemctl start cadf-backend cadf-gateway
healthy=false
for attempt in {1..10}; do
    if curl -fsS http://127.0.0.1:8765/api/snapshot -o /dev/null; then healthy=true; break; fi
    sleep 1
done
if [[ "$healthy" == true ]]; then
    printf '%s\n' "$revision" > /var/lib/cadf/deployed-commit
else
    systemctl stop cadf-gateway cadf-backend
    git -C "$source_repo" archive "$previous" | tar -x -C "$stage"
    rsync -a --exclude 'PROJECTS.json' --exclude '.cadf-runtime' --exclude 'project-records' "$stage/cadf-pilot/" /var/lib/cadf/workspace/
    chown -R cadf:cadf /var/lib/cadf/workspace
    systemctl start cadf-backend cadf-gateway
    exit 1
fi
# Keep the newest ten private rollback snapshots.
python3 - <<'PY'
from pathlib import Path
backups=sorted(Path('/var/lib/cadf/backups').glob('pre-*.tar.gz'),key=lambda p:p.stat().st_mtime,reverse=True)
for path in backups[10:]:path.unlink()
PY
