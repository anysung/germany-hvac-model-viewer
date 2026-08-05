#!/usr/bin/env bash
# Auth-header fit across every edition and every phone width.
# The header carries brand, flag, market badge, social links and the language
# switch — five things in a 320px row — and AuthShell's overflow-hidden root
# means an overflow is invisible to document-level checks. No secrets needed.
set -uo pipefail

PORT="${PORT:-5203}"

failed=0
for cc in DE GB FR PL IT; do
  pkill -f "vite --port $PORT" 2>/dev/null
  sleep 1
  VITE_COUNTRY_CODE="$cc" npx vite --port "$PORT" >"/tmp/vite-hdr-$cc.log" 2>&1 &
  sleep 9
  COUNTRY="$cc" BASE_URL="http://localhost:$PORT" node tests/header-fit.e2e.mjs || failed=1
done
pkill -f "vite --port $PORT" 2>/dev/null

if [ "$failed" -eq 0 ]; then
  echo "header fit: all editions GREEN"
else
  echo "header fit: FAILURES"
fi
exit "$failed"
