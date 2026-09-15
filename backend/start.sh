#!/bin/bash
cd "$(dirname "$0")"
export PYTHONPATH="$(cd .. && pwd)/src:$PYTHONPATH"
"$(cd .. && pwd)/.venv/bin/uvicorn" app.main:app --reload --host 0.0.0.0 --port 8000
