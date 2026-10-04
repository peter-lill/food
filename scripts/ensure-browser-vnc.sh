#!/usr/bin/env bash
set -euo pipefail

# Browser endpoints remain loopback-only. The socket proxies are the sole
# LAN-facing noVNC endpoints, and this watchdog keeps both layers available.
check_http() {
  curl -fsS --max-time 5 "$1" >/dev/null
}

repo_dir="$(cd "$(dirname "$0")/.." && pwd)"

# Host-browser mode deliberately gives the bridge host networking: the visible
# Woolworths browser and its category-fetch API are loopback-only. A plain
# Compose restart silently puts the bridge back on the crash-prone container
# sidecar, even while noVNC still looks healthy. Repair that configuration
# before the daily importer can consume catalogue checkpoints.
bridge_uses_host_browser() {
  docker inspect --format '{{.HostConfig.NetworkMode}}' food-grocery-mcp 2>/dev/null | grep -qx host \
    && docker inspect --format '{{range .Config.Env}}{{println .}}{{end}}' food-grocery-mcp 2>/dev/null \
      | grep -qx 'WOOLWORTHS_CDP_URL=http://127.0.0.1:9224' \
    && docker inspect --format '{{range .Config.Env}}{{println .}}{{end}}' food-grocery-mcp 2>/dev/null \
      | grep -qx 'WOOLWORTHS_BROWSER_FETCH_URL=http://127.0.0.1:8791/fetch'
}

if ! bridge_uses_host_browser; then
  docker compose \
    -f "$repo_dir/docker-compose.yml" \
    -f "$repo_dir/docker-compose.host-browser.yml" \
    --profile prices \
    up -d --force-recreate food-grocery-mcp >/dev/null
fi

if ! check_http http://127.0.0.1:8790/health; then
  docker restart food-grocery-mcp >/dev/null
fi

if ! docker inspect --format '{{.State.Running}}' food-coles-browser 2>/dev/null | grep -qx true \
  || ! check_http http://127.0.0.1:6082/vnc.html; then
  docker restart food-coles-browser >/dev/null
fi

if ! systemctl is-active --quiet food-woolworths-browser.service \
  || ! check_http http://127.0.0.1:6084/vnc.html; then
  systemctl restart food-woolworths-browser.service
fi

for socket in food-coles-novnc.socket food-woolworths-novnc.socket; do
  if ! systemctl is-active --quiet "$socket"; then
    systemctl reset-failed "$socket"
    systemctl restart "$socket"
  fi
done

# Socket activation starts the corresponding TCP proxy when these probes run.
check_http http://127.0.0.1:6086/vnc.html
check_http http://127.0.0.1:6085/vnc.html
