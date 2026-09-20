#!/usr/bin/env bash
set -euo pipefail

# Browser endpoints remain loopback-only. The socket proxies are the sole
# LAN-facing noVNC endpoints, and this watchdog keeps both layers available.
check_http() {
  curl -fsS --max-time 5 "$1" >/dev/null
}

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
