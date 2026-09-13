#!/usr/bin/env bash
set -euo pipefail

# The host service deliberately uses the same undetected-Chrome sidecar as
# Compose. Keeping one owner for visible navigation means the bridge's
# /fetch calls, CDP search/detail work and the noVNC screen always describe
# the same browser session.
export DISPLAY="${WOOLWORTHS_HOST_DISPLAY:-:100}"
export WOOLWORTHS_BROWSER_SCREEN="${WOOLWORTHS_HOST_SCREEN:-1920x1080x24}"
export WOOLWORTHS_BROWSER_CDP_PORT="${WOOLWORTHS_HOST_CDP_PORT:-9224}"
export WOOLWORTHS_BROWSER_VNC_PORT="${WOOLWORTHS_HOST_VNC_PORT:-5901}"
export WOOLWORTHS_BROWSER_NOVNC_PORT="${WOOLWORTHS_HOST_NOVNC_PORT:-6084}"
# Docker's legacy sidecar retains 8789.  Keep the host UC service separate so
# it can be rolled out without disturbing that container.
export WOOLWORTHS_BROWSER_FETCH_PORT="${WOOLWORTHS_HOST_FETCH_PORT:-8791}"
export WOOLWORTHS_BROWSER_PROFILE="${WOOLWORTHS_HOST_PROFILE:-${HOME}/snap/chromium/common/food-woolworths-profile}"
export WOOLWORTHS_BROWSER_FETCH_BIND_ADDRESS="127.0.0.1"
export WOOLWORTHS_BROWSER_NOVNC_BIND_ADDRESS="127.0.0.1"
export WOOLWORTHS_BROWSER_CDP_RELAY_BIND_ADDRESS="127.0.0.1"

exec python3 "$(dirname "$0")/../services/grocery-mcp/woolworths_browser.py"
