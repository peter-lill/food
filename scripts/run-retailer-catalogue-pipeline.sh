#!/usr/bin/env bash
set -Eeuo pipefail

# Run one browser-backed retailer collection and publish its verified cache to
# Food. Separate instances may collect concurrently. Imports are deliberately
# serialised because cross-retailer identity matching must observe the previous
# import before it creates another canonical product.

retailer="${1:-}"
case "$retailer" in
  coles|woolworths) ;;
  *) echo "Usage: $0 coles|woolworths" >&2; exit 2 ;;
esac

food_root="${FOOD_ROOT:-/home/peter/Development/food}"
bridge_url="${FOOD_GROCERY_MCP_URL:-http://127.0.0.1:8790}"
poll_seconds="${FOOD_CATALOGUE_POLL_SECONDS:-30}"
max_wait_minutes="${FOOD_CATALOGUE_MAX_WAIT_MINUTES:-10080}"
state_dir="${FOOD_CATALOGUE_PIPELINE_STATE_DIR:-/var/lib/food-retailer-catalogue}"
initial_marker="$state_dir/$retailer-initial-import-complete"
import_lock="$state_dir/import.lock"

if ! [[ "$poll_seconds" =~ ^[1-9][0-9]*$ && "$max_wait_minutes" =~ ^[1-9][0-9]*$ ]]; then
  echo "FOOD_CATALOGUE_POLL_SECONDS and FOOD_CATALOGUE_MAX_WAIT_MINUTES must be positive whole numbers." >&2
  exit 2
fi

mkdir -p "$state_dir"
cd "$food_root"

request() {
  curl --fail --silent --show-error "$bridge_url$1"
}

import_catalogue() {
  local phase="$1"
  echo "Waiting for the shared catalogue import lock for the $retailer $phase pass."
  (
    flock -x 9
    echo "Starting the $retailer $phase controlled import at $(date --iso-8601=seconds)."
    npm --workspace apps/web run "products:$retailer-import" -- --all --page-size=500 --apply
    echo "Completed the $retailer $phase controlled import at $(date --iso-8601=seconds)."
  ) 9>"$import_lock"
}

collection_status() {
  request "/$retailer/catalogue/collection/status"
}

status_fields() {
  python3 -c '
import json, sys
c = json.load(sys.stdin)["collection"]
d = c.get("discovery", {}) if isinstance(c.get("discovery", {}), dict) else {}
print(
    int(c.get("pending", 0)), int(c.get("running", 0)),
    int(c.get("completed", 0)), int(c.get("total", 0)), int(c.get("failed", 0)),
    int(d.get("pending", 0)), int(d.get("failed", 0)), int(c.get("products", c.get("products_cached", 0))),
)
'
}

first_population=0
start_query="?retryFailed=1"
read -r initial_pending current_running initial_completed initial_total initial_failed initial_discovery_pending initial_discovery_failed initial_products < <(
  collection_status | status_fields
)
if [[ ! -e "$initial_marker" ]]; then
  first_population=1
elif [[ "$initial_total" -gt 0 && "$initial_pending" == "0" && "$current_running" == "0" && "$initial_completed" == "$initial_total" && "$initial_failed" == "0" && "$initial_discovery_pending" == "0" && "$initial_discovery_failed" == "0" ]]; then
  # An initial import marker does not mean collection finished. Restart an
  # interrupted collection from checkpoints; revisit only a completed sweep.
  start_query="?revisitAllCompleted=1&retryFailed=1"
fi

if [[ "$current_running" == "0" ]]; then
  echo "Starting or resuming the $retailer catalogue collection."
  request "/$retailer/catalogue/collection/start$start_query" >/dev/null
else
  echo "The $retailer collector is already running; attaching the import pipeline to it."
fi

deadline=$((SECONDS + max_wait_minutes * 60))
while true; do
  read -r pending running completed total failed discovery_pending discovery_failed products < <(
    collection_status | status_fields
  )
  echo "$retailer catalogue: completed=$completed/$total pending=$pending running=$running failed=$failed discovery_pending=$discovery_pending discovery_failed=$discovery_failed cached_products=$products"

  # A rebuilt installation has no cache yet. Wait for its first products
  # instead of failing the initial import before discovery can finish.
  if [[ "$first_population" == "1" && "$products" -gt 0 ]]; then
    import_catalogue "initial-population"
    touch "$initial_marker"
    first_population=0
  fi

  if [[ "$total" -gt 0 && "$pending" == "0" && "$running" == "0" && "$failed" == "0" && "$completed" == "$total" && "$discovery_pending" == "0" && "$discovery_failed" == "0" ]]; then
    import_catalogue "final-reconciliation"
    echo "$retailer catalogue pipeline completed at $(date --iso-8601=seconds)."
    exit 0
  fi
  if [[ "$running" == "0" && ( "$failed" != "0" || "$discovery_failed" != "0" ) ]]; then
    echo "$retailer collection stopped at a saved failure; resolve any visible browser verification and restart this service to resume." >&2
    exit 1
  fi
  if (( SECONDS >= deadline )); then
    echo "$retailer catalogue pipeline exceeded ${max_wait_minutes} minutes; checkpoints were preserved and the final import was not run." >&2
    exit 1
  fi
  sleep "$poll_seconds"
done
