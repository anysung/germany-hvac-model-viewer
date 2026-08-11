#!/usr/bin/env bash
# Global-nav fit across every edition. No secrets needed (preview mode).
set -uo pipefail
PORT="${PORT:-5204}"
failed=0
for cc in DE GB FR PL IT; do
  pkill -f "vite --port $PORT" 2>/dev/null
  sleep 1
  VITE_COUNTRY_CODE="$cc" npx vite --port "$PORT" >"/tmp/vite-nav-$cc.log" 2>&1 &
  sleep 9
  COUNTRY="$cc" BASE_URL="http://localhost:$PORT" node tests/nav-fit.e2e.mjs || failed=1
done
pkill -f "vite --port $PORT" 2>/dev/null
if [ "$failed" -eq 0 ]; then echo; echo "nav fit: all editions GREEN"; else echo; echo "nav fit: FAILURES above"; fi
exit "$failed"
