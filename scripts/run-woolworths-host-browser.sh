#!/usr/bin/env bash
set -euo pipefail

display="${WOOLWORTHS_HOST_DISPLAY:-:100}"
screen="${WOOLWORTHS_HOST_SCREEN:-1365x768x24}"
cdp_port="${WOOLWORTHS_HOST_CDP_PORT:-9224}"
vnc_port="${WOOLWORTHS_HOST_VNC_PORT:-5901}"
novnc_port="${WOOLWORTHS_HOST_NOVNC_PORT:-6084}"
profile="${WOOLWORTHS_HOST_PROFILE:-${HOME}/snap/chromium/common/food-woolworths-profile}"

for command_name in Xvfb openbox chromium-browser x11vnc websockify; do
  command -v "${command_name}" >/dev/null || {
    echo "Required command not found: ${command_name}" >&2
    exit 1
  }
done

mkdir -p "${profile}"

pids=()
cleanup() {
  for pid in "${pids[@]}"; do
    kill "${pid}" 2>/dev/null || true
  done
  wait 2>/dev/null || true
}
trap cleanup EXIT INT TERM

Xvfb "${display}" -screen 0 "${screen}" -ac &
pids+=("$!")
sleep 2

DISPLAY="${display}" openbox &
pids+=("$!")

DISPLAY="${display}" chromium-browser \
  --disable-gpu \
  --no-proxy-server \
  --no-first-run \
  --no-default-browser-check \
  --start-maximized \
  --user-data-dir="${profile}" \
  --remote-debugging-address=127.0.0.1 \
  --remote-debugging-port="${cdp_port}" \
  https://www.woolworths.com.au/ &
browser_pid="$!"
pids+=("${browser_pid}")

x11vnc \
  -display "${display}" \
  -rfbport "${vnc_port}" \
  -localhost \
  -forever \
  -shared \
  -nopw &
pids+=("$!")

websockify \
  --web=/usr/share/novnc/ \
  "127.0.0.1:${novnc_port}" \
  "127.0.0.1:${vnc_port}" &
pids+=("$!")

for _ in $(seq 1 30); do
  if python3 -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:${cdp_port}/json/version', timeout=2)" 2>/dev/null; then
    echo "Woolworths host browser ready: CDP 127.0.0.1:${cdp_port}, noVNC 127.0.0.1:${novnc_port}"
    wait "${browser_pid}"
    exit $?
  fi
  sleep 1
done

echo "Chromium CDP did not become ready on 127.0.0.1:${cdp_port}" >&2
exit 1
