#!/bin/bash
# Daily market-facts.md refresh (launchd: com.heatpumpdb.marketfacts).
#
# launchd starts jobs with a minimal PATH that has no node, so the interpreter
# is located here rather than assumed. Nothing about this job is urgent enough
# to be worth a failed run over an environment detail.
set -u
cd "$(dirname "$0")/../.." || exit 0

for candidate in \
  /opt/homebrew/bin/node \
  /usr/local/bin/node \
  "$HOME"/.nvm/versions/node/*/bin/node
do
  [ -x "$candidate" ] && NODE="$candidate" && break
done
[ -z "${NODE:-}" ] && { echo "$(date '+%F %T')  no node found — skipped"; exit 0; }

printf '%s  ' "$(date '+%F %T')"
"$NODE" scripts/marketing/update-market-facts.mjs
