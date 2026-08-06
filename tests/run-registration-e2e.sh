#!/usr/bin/env bash
# Registration-OPEN e2e across every country edition (registration reopened 2026-08-06).
# Starts a dev server per edition, runs the Playwright checks, tears it down.
#
# Needs two secrets, NOT in the repo — point HPDB_TEST_SECRETS at the directory
# holding e2e-pw.txt (the e2e-verify@heatpumpdb.de password) and
# appcheck-debug-token.txt (a registered App Check debug token).
set -uo pipefail

PORT="${PORT:-5199}"
: "${HPDB_TEST_SECRETS:?set HPDB_TEST_SECRETS to the directory holding e2e-pw.txt and appcheck-debug-token.txt}"

failed=0
for cc in DE GB FR PL IT; do
  pkill -f "vite --port $PORT" 2>/dev/null
  sleep 1
  if [ "$cc" = "DE" ]; then
    npx vite --port "$PORT" >"/tmp/vite-reg-$cc.log" 2>&1 &
  else
    VITE_COUNTRY_CODE="$cc" npx vite --port "$PORT" >"/tmp/vite-reg-$cc.log" 2>&1 &
  fi
  sleep 9
  node tests/registration-open.e2e.mjs "$cc" "$PORT" || failed=1
done
pkill -f "vite --port $PORT" 2>/dev/null

if [ "$failed" -eq 0 ]; then
  echo "registration open: all editions GREEN"
else
  echo "registration open: FAILURES — see above" >&2
fi
exit "$failed"
