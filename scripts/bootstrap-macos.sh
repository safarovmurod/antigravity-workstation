#!/usr/bin/env bash
set -euo pipefail

if [[ "$(uname -s)" != Darwin ]]; then
  echo 'This command is for macOS. Use the Windows PowerShell command in README on Windows.' >&2
  exit 1
fi
for command in git node npm; do
  if ! command -v "$command" >/dev/null 2>&1; then
    echo "Missing prerequisite: $command" >&2
    exit 1
  fi
done
if ! node -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 24 ? 0 : 1)'; then
  echo 'Node.js 24 or newer is required.' >&2
  exit 1
fi

snapshot="$(mktemp -d "${TMPDIR:-/tmp}/antigravity-workstation.XXXXXXXX")"
trap 'rm -rf -- "$snapshot"' EXIT
git clone --depth 1 --branch main https://github.com/safarovmurod/antigravity-workstation.git "$snapshot/source"
node "$snapshot/source/macos/setup.mjs" install
