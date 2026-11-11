#!/bin/bash
# Helyi szerver a web/ mappához. A port fix: 8766. Minden hálózati címen elérhető, így az iPad is eléri.
PORT=8766
DIR="$(cd "$(dirname "$0")/.." && pwd)/web"
echo "Gépen:  http://localhost:$PORT/#DEMO"
for ip in $(hostname -I 2>/dev/null); do
  case "$ip" in
    *:*) ;;
    *) echo "iPaden: http://$ip:$PORT/#DEMO" ;;
  esac
done
exec python3 -m http.server "$PORT" --bind 0.0.0.0 --directory "$DIR"
