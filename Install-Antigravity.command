#!/bin/bash
set -euo pipefail
launcher_directory="$(cd -- "$(dirname -- "$0")" && pwd)"
exec /bin/bash "$launcher_directory/scripts/bootstrap-macos.sh"
