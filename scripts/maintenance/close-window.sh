#!/bin/bash
# The 03:00 Europe/Berlin guard.
#
# If the run finished, this does nothing. If it stopped for a person and no
# instruction arrived, this lifts the notice and the service resumes on the
# version that was already live — an unattended window must never be able to
# leave the sites dark indefinitely.
set -uo pipefail

export PATH="/Users/christophersung/.nvm/versions/node/v20.19.6/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
REPO="/Users/christophersung/heatpumpdb-app"
# Keys are loaded by the Node script itself (see run-window.sh).

cd "$REPO" || exit 1
exec node scripts/monthly-maintenance.mjs --close --if-window
