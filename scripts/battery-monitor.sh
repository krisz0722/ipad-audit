#!/bin/bash
DIR="$(cd "$(dirname "$0")/.." && pwd)"
export PYTHONPATH="$DIR/tool:$DIR"
exec "$DIR/.venv/bin/python" "$DIR/scripts/battery-monitor.py" "$@"
