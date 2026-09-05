#!/usr/bin/env bash
set -Eeuo pipefail

# Revisit the verified Woolworths browse catalogue, then publish any current
# price/special changes before asking the worker to refresh stale retailer data.
# The browser collector is deliberately serial and rate-limited; do not run a
# second instance while this script is active.

food_root="${FOOD_ROOT:-/home/peter/Development/food}"
bridge_url="${FOOD_GROCERY_MCP_URL:-http://127.0.0.1:8790}"
poll_seconds="${FOOD_SPECIALS_POLL_SECONDS:-30}"
max_wait_minutes="${FOOD_SPECIALS_MAX_WAIT_MINUTES:-480}"
stale_days="${FOOD_SPECIALS_STALE_DAYS:-1}"

if ! [[ "$poll_seconds" =~ ^[1-9][0-9]*$ && "$max_wait_minutes" =~ ^[1-9][0-9]*$ && "$stale_days" =~ ^[1-9][0-9]*$ ]]; then
  echo "FOOD_SPECIALS_POLL_SECONDS, FOOD_SPECIALS_MAX_WAIT_MINUTES and FOOD_SPECIALS_STALE_DAYS must be positive whole numbers." >&2
  exit 2
fi

cd "$food_root"

echo "Starting Wednesday Woolworths specials sweep at $(date --iso-8601=seconds)."
curl --fail --silent --show-error \
  "$bridge_url/woolworths/catalogue/collection/start?revisitAllCompleted=1&retryFailed=1" >/dev/null

deadline=$((SECONDS + max_wait_minutes * 60))
while true; do
  read -r pending running failed < <(
    curl --fail --silent --show-error "$bridge_url/woolworths/catalogue/collection/status" \
      | python3 -c 'import json, sys; c = json.load(sys.stdin)["collection"]; print(c["pending"], c["running"], c["failed"])'
  )

  echo "Woolworths catalogue status: pending=$pending running=$running failed=$failed"
  if [[ "$failed" != "0" ]]; then
    echo "Woolworths catalogue sweep stopped because one or more categories failed; no import was applied." >&2
    exit 1
  fi
  if [[ "$pending" == "0" && "$running" == "0" ]]; then
    break
  fi
  if (( SECONDS >= deadline )); then
    echo "Woolworths catalogue sweep exceeded ${max_wait_minutes} minutes; no import was applied." >&2
    exit 1
  fi
  sleep "$poll_seconds"
done

npm --workspace apps/web run products:woolworths-import -- --all --page-size=1000 --apply
npm --workspace apps/web run products:retailer-prices -- --apply --stale-days="$stale_days"

echo "Wednesday specials sweep completed at $(date --iso-8601=seconds)."
