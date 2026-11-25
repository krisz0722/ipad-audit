#!/bin/bash
DIR="$(cd "$(dirname "$0")/.." && pwd)"
export PYTHONPATH="$DIR/tool"
exec "$DIR/.venv/bin/python" -m ipad_audit.battery_test "$@"
