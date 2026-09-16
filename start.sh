#!/usr/bin/env bash
# Start the Loop Finder UI at http://127.0.0.1:8000, running setup first if needed.
set -euo pipefail
cd "$(dirname "$0")"

if [ ! -x .venv/bin/loop-finder-ui ] || [ ! -f frontend/build/index.html ]; then
  ./setup.sh
elif [ -n "$(find frontend/src frontend/public -newer frontend/build/index.html -print -quit)" ]; then
  echo "Frontend changed since last build, rebuilding..."
  (cd frontend && npm run build)
fi

exec .venv/bin/loop-finder-ui
