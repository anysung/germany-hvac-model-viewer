#!/bin/bash
# Monthly maintenance window — launchd entry point.
#
# launchd starts with almost no environment: no nvm, no gcloud, no firebase, and
# no secrets. Everything the run needs is assembled here so the plist stays
# free of both PATHs and keys.
#
# The window is defined in Europe/Berlin; launchd only understands this Mac's
# local time. So the plist fires on several candidate hours and
# `--if-window` decides which firing is the real one — that is what keeps the
# schedule correct across European summer time.
set -uo pipefail

export PATH="/Users/christophersung/.nvm/versions/node/v20.19.6/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
REPO="/Users/christophersung/heatpumpdb-app"

# Secrets live outside the repo, readable only by the owner (chmod 600).
# Missing file is not fatal: news becomes a non-fatal skip, the catalogue ships.
[ -f "$HOME/.heatpumpdb/env" ] && . "$HOME/.heatpumpdb/env"

cd "$REPO" || exit 1
exec node scripts/monthly-maintenance.mjs --run --if-window
