#!/usr/bin/env bash
# One-time setup: Python venv + package (with stems), frontend build. Safe to re-run.
set -euo pipefail
cd "$(dirname "$0")"

command -v python3 >/dev/null || { echo "python3 not found (need 3.11+)"; exit 1; }
python3 -c 'import sys; sys.exit(sys.version_info < (3, 11))' || { echo "Python 3.11+ required, found $(python3 --version)"; exit 1; }
command -v npm >/dev/null || { echo "npm not found - install Node.js (brew install node)"; exit 1; }
command -v ffmpeg >/dev/null || echo "Warning: ffmpeg not found - YouTube URLs won't work (brew install ffmpeg)"

[ -d .venv ] || python3 -m venv .venv
.venv/bin/pip install -q --upgrade pip
.venv/bin/pip install -q -e ".[stems]"

(cd frontend && npm install && npm run build)

echo "Setup complete. Run ./start.sh"
