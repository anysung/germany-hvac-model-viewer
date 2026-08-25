#!/bin/bash
# Weekly marketing check (launchd: com.heatpumpdb.marketing.weekly) — Monday 09:00.
#
# WHAT IT DOES AND DOES NOT DO
# It reports. It does not write cards, does not publish, and does not touch the
# sites. Writing a card needs a judgement about whether a finding is publishable
# — the one thing a cron job must never improvise, because the whole channel
# rests on publishing only numbers we can prove.
#
# Two questions, once a week:
#   1. Is the fact sheet marketing quotes still current?
#   2. Which market editions are approaching or past the 14-day card floor?
#
# The answer lands in a log the owner reads with Claude Code, which is where the
# actual decision — is there anything worth publishing this week — belongs.
set -u
cd "$(dirname "$0")/../.." || exit 0

for candidate in /opt/homebrew/bin/node /usr/local/bin/node "$HOME"/.nvm/versions/node/*/bin/node; do
  [ -x "$candidate" ] && NODE="$candidate" && break
done
[ -z "${NODE:-}" ] && { echo "$(date '+%F %T')  no node found — skipped"; exit 0; }

echo "════════════════════════════════════════════════════════"
echo "$(date '+%F %T')  weekly marketing check"
echo "════════════════════════════════════════════════════════"

printf '\n[1/2] market-facts.md  '
"$NODE" scripts/marketing/update-market-facts.mjs

echo
echo "[2/2] Market & Trends cadence"
"$NODE" scripts/marketing/trends-card-due.mjs
DUE=$?

if [ "$DUE" -ne 0 ]; then
  echo "ACTION: at least one market is past the 14-day floor."
  echo "  Open the newest digest in 02_MARKET_INTELLIGENCE/MONITORING/ and ask"
  echo "  Claude Code for a card. If the week produced no publishable finding,"
  echo "  build the card from our own catalogue — those numbers are always"
  echo "  provable, which is how the floor is held without inventing anything."
fi
echo
