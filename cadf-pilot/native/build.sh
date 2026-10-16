#!/bin/bash
set -euo pipefail
app_root="$(cd "$(dirname "$0")/.." && pwd)"
output="${1:-/tmp/CADF.app}"
mkdir -p "$output/Contents/MacOS" "$output/Contents/Resources"
swiftc -module-cache-path /tmp/cadf-swift-cache -parse-as-library -O -target arm64-apple-macosx14.0 "$app_root/native/CADF/CADFApp.swift" -o "$output/Contents/MacOS/CADF"
python3 - "$output" "$app_root" <<'PY'
import plistlib,sys
from pathlib import Path
info={'CFBundleIdentifier':'com.cadf.workspace','CFBundleName':'CADF','CFBundleDisplayName':'CADF','CFBundleExecutable':'CADF','CFBundlePackageType':'APPL','CFBundleShortVersionString':'0.3.0','CFBundleVersion':'3','LSMinimumSystemVersion':'14.0','NSHighResolutionCapable':True,'CADFWorkspacePath':sys.argv[2]}
(Path(sys.argv[1])/'Contents/Info.plist').write_bytes(plistlib.dumps(info))
PY
codesign --force --sign - "$output"
printf 'Built %s\n' "$output"
