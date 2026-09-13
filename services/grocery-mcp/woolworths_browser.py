"""Persistent, human-verifiable Woolworths browser for the catalogue bridge."""

import json
import os
import re
import signal
import subprocess
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from queue import Empty, Queue
from urllib.parse import parse_qs, urlparse

from browser_health import BrowserWatchdog, probe_connections


DISPLAY = os.getenv("DISPLAY", ":99")
PROFILE_DIR = os.getenv("WOOLWORTHS_BROWSER_PROFILE", "/browser-profile")
START_URL = os.getenv("WOOLWORTHS_BROWSER_START_URL", "https://www.woolworths.com.au/")
CDP_PORT = int(os.getenv("WOOLWORTHS_BROWSER_CDP_PORT", "9222"))
CDP_RELAY_PORT = int(os.getenv("WOOLWORTHS_BROWSER_CDP_RELAY_PORT", "9223"))
NOVNC_PORT = int(os.getenv("WOOLWORTHS_BROWSER_NOVNC_PORT", "6080"))
VNC_PORT = int(os.getenv("WOOLWORTHS_BROWSER_VNC_PORT", "5900"))
SCREEN = os.getenv("WOOLWORTHS_BROWSER_SCREEN", "1920x1080x24")
FETCH_PORT = int(os.getenv("WOOLWORTHS_BROWSER_FETCH_PORT", "8789"))
FETCH_BIND_ADDRESS = os.getenv("WOOLWORTHS_BROWSER_FETCH_BIND_ADDRESS", "0.0.0.0")
NOVNC_BIND_ADDRESS = os.getenv("WOOLWORTHS_BROWSER_NOVNC_BIND_ADDRESS", "0.0.0.0")
CDP_RELAY_BIND_ADDRESS = os.getenv("WOOLWORTHS_BROWSER_CDP_RELAY_BIND_ADDRESS", "0.0.0.0")
CATEGORY_API_PATH = "/apis/ui/browse/category"
CATEGORY_NAVIGATION_SECONDS = 45
CATEGORY_SCROLL_ROUNDS = 60
CATEGORY_SCROLL_WAIT_SECONDS = 0.75
# A single visible browse navigation may take the page-load budget, all lazy
# scroll rounds, and a bounded margin for the browser's category response.
CATEGORY_SESSION_SECONDS = (
    CATEGORY_NAVIGATION_SECONDS
    + int(CATEGORY_SCROLL_ROUNDS * CATEGORY_SCROLL_WAIT_SECONDS + 0.999)
    + 180
)

stopping = False
browser_ready = False
browser_failed = False
requests: Queue[tuple[str, threading.Event, dict[str, object]]] = Queue()



def valid_woolworths_browse_url(value: str) -> bool:
    parsed = urlparse(value)
    return (
        parsed.scheme == "https"
        and parsed.netloc == "www.woolworths.com.au"
        and parsed.path.startswith("/shop/browse/")
    )


class Handler(BaseHTTPRequestHandler):
    server_version = "FoodWoolworthsUC/1.0"

    def send_json(self, status: int, payload: dict[str, object]) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:  # noqa: N802
        global browser_ready, browser_failed

        parsed = urlparse(self.path)

        if parsed.path == "/health":
            if browser_ready and not browser_failed:
                self.send_json(
                    200,
                    {"status": "ok", "browser": "undetected-chromedriver"},
                )
            else:
                self.send_json(
                    503,
                    {"status": "error", "browser": "undetected-chromedriver"},
                )
            return

        if parsed.path != "/fetch":
            self.send_json(404, {"status": "error", "error": "Not found"})
            return

        url = (parse_qs(parsed.query).get("url") or [""])[0]
        if not valid_woolworths_browse_url(url):
            self.send_json(
                400,
                {
                    "status": "error",
                    "error": "Only public Woolworths browse URLs are allowed",
                },
            )
            return

        completed = threading.Event()
        result: dict[str, object] = {}
        requests.put((url, completed, result))

        if not completed.wait(timeout=CATEGORY_SESSION_SECONDS):
            self.send_json(
                504,
                {
                    "status": "error",
                    "error": "Woolworths browser request did not return in time",
                },
            )
            return

        if result.get("error"):
            self.send_json(
                502,
                {"status": "error", "error": str(result["error"])},
            )
            return

        self.send_json(
            200,
            {
                "status": "success",
                "categoryResponses": result.get("categoryResponses", []),
                "categoryRequests": result.get("categoryRequests", []),
                "subcategories": result.get("subcategories", []),
            },
        )

    def log_message(self, format: str, *args: object) -> None:
        print(
            f"woolworths-uc {self.address_string()} {format % args}",
            flush=True,
        )



class CategoryCapture:
    """Track Woolworths category API requests observed by the UC browser."""

    def __init__(self) -> None:
        self.lock = threading.Lock()
        self.requests: dict[str, dict[str, object]] = {}
        self.responses: dict[str, dict[str, object]] = {}
        self.finished: set[str] = set()

    def clear(self) -> None:
        with self.lock:
            self.requests.clear()
            self.responses.clear()
            self.finished.clear()

    def request_will_be_sent(self, message: dict[str, object]) -> None:
        params = message.get("params")
        if not isinstance(params, dict):
            return

        request_id = str(params.get("requestId") or "")
        request = params.get("request")
        if not request_id or not isinstance(request, dict):
            return

        url = str(request.get("url") or "")
        if CATEGORY_API_PATH not in url:
            return

        payload: dict[str, object] = {}
        raw_post_data = request.get("postData")
        if isinstance(raw_post_data, str) and raw_post_data:
            try:
                decoded = json.loads(raw_post_data)
                if isinstance(decoded, dict):
                    payload = decoded
            except json.JSONDecodeError:
                pass

        with self.lock:
            self.requests[request_id] = {
                "url": url,
                "method": str(request.get("method") or ""),
                "payload": payload,
            }

    def response_received(self, message: dict[str, object]) -> None:
        params = message.get("params")
        if not isinstance(params, dict):
            return

        request_id = str(params.get("requestId") or "")
        response = params.get("response")
        if not request_id or not isinstance(response, dict):
            return

        url = str(response.get("url") or "")
        if CATEGORY_API_PATH not in url:
            return

        try:
            status = int(response.get("status") or 0)
        except (TypeError, ValueError):
            status = 0

        if not 200 <= status < 300:
            return

        with self.lock:
            self.responses[request_id] = {
                "url": url,
                "status": status,
            }

    def loading_finished(self, message: dict[str, object]) -> None:
        params = message.get("params")
        if not isinstance(params, dict):
            return

        request_id = str(params.get("requestId") or "")
        if not request_id:
            return

        with self.lock:
            self.finished.add(request_id)

    def completed(self) -> list[tuple[str, dict[str, object]]]:
        with self.lock:
            return [
                (
                    request_id,
                    dict(self.requests.get(request_id, {})),
                )
                for request_id in self.finished
                # A response without its matching request metadata cannot be
                # safely used for pagination.  CDP reports request creation
                # before its response, so this also prevents a stale partial
                # capture from being returned as an unpaired response.
                if request_id in self.responses and request_id in self.requests
            ]


def woolworths_catalogue_request_payload(request: object) -> dict[str, object] | None:
    """Clone a captured category request while excluding Everyday Market."""
    if not isinstance(request, dict):
        return None

    payload = request.get("payload")
    if not isinstance(payload, dict):
        return None

    catalogue_payload = dict(payload)
    catalogue_payload["isHideEverydayMarketProducts"] = True
    return catalogue_payload


def fetch_woolworths_catalogue_response(
    driver: object,
    request: dict[str, object],
) -> dict[str, object]:
    """Replay a captured category request while excluding Everyday Market."""
    payload = woolworths_catalogue_request_payload(request)
    if payload is None:
        raise RuntimeError("Woolworths category request payload was not captured")

    result = driver.execute_async_script(
        r"""
        const done = arguments[arguments.length - 1];
        const payload = arguments[0];

        fetch('/apis/ui/browse/category', {
          method: 'POST',
          credentials: 'include',
          headers: {
            'accept': 'application/json, text/plain, */*',
            'content-type': 'application/json'
          },
          body: JSON.stringify(payload)
        })
          .then(async (response) => {
            const body = await response.json();
            done({
              ok: response.ok,
              status: response.status,
              body
            });
          })
          .catch((error) => {
            done({
              ok: false,
              status: 0,
              error: String(error)
            });
          });
        """,
        payload,
    )

    if not isinstance(result, dict):
        raise RuntimeError("Woolworths catalogue API returned an invalid result")

    if not result.get("ok"):
        status = result.get("status")
        error = result.get("error") or "request failed"
        raise RuntimeError(
            f"Woolworths catalogue API request failed ({status}): {error}"
        )

    body = result.get("body")
    if not isinstance(body, dict):
        raise RuntimeError("Woolworths catalogue API returned an invalid response")

    return body


def configure_uc_version_parser(patcher_module: object, parser_type: object) -> None:
    patcher_module.LooseVersion = parser_type


def chromium_major_version(executable: str) -> int:
    result = subprocess.run(
        [executable, "--version"],
        capture_output=True,
        text=True,
        check=True,
        timeout=10,
    )
    match = re.search(r"\b(\d+)\.", result.stdout)
    if not match:
        raise RuntimeError("Unable to determine installed Chromium version")
    return int(match.group(1))


def clear_stale_chromium_profile_locks() -> None:
    profile = Path(PROFILE_DIR)
    for name in ("SingletonLock", "SingletonSocket", "SingletonCookie"):
        path = profile / name
        try:
            if path.exists() or path.is_symlink():
                target = os.readlink(path) if path.is_symlink() else "regular-file"
                print(
                    f"Removing stale Chromium profile entry: {path} -> {target}",
                    flush=True,
                )
                path.unlink()
        except FileNotFoundError:
            pass


def stop(_signum: int, _frame: object) -> None:
    global stopping
    stopping = True


def start_process(command: list[str], name: str) -> subprocess.Popen:
    print(f"Starting {name}", flush=True)
    return subprocess.Popen(command, env={**os.environ, "DISPLAY": DISPLAY})


def wait_for_x_display(timeout_seconds: int = 10) -> None:
    display_number = DISPLAY.removeprefix(":").split(".", 1)[0]
    socket_path = Path(f"/tmp/.X11-unix/X{display_number}")
    deadline = time.monotonic() + timeout_seconds
    while time.monotonic() < deadline:
        if socket_path.exists():
            return
        time.sleep(0.1)
    raise RuntimeError(f"X display {DISPLAY} did not become ready")



def fetch_category(driver: object, capture: CategoryCapture, url: str) -> dict[str, object]:
    """Navigate the visible UC browser and return category API data plus descendants."""
    category_path = urlparse(url).path.rstrip("/")
    capture.clear()

    driver.get(url)
    # UC can navigate its controlled target in a background Chromium tab while
    # leaving the initial blank tab focused.  Make the collection target the
    # foreground tab so the visible noVNC session faithfully shows navigation.
    driver.execute_cdp_cmd("Page.bringToFront", {})

    deadline = time.monotonic() + CATEGORY_NAVIGATION_SECONDS
    stable_rounds = 0
    previous_height = 0
    descendants: list[str] = []

    while time.monotonic() < deadline:
        title = str(driver.title or "").casefold()
        body = str(
            driver.execute_script(
                "return document.body ? document.body.innerText : ''"
            )
            or ""
        ).casefold()

        verification_markers = (
            "access denied",
            "captcha",
            "verify you are human",
            "verify you're human",
            "are you a human",
        )
        if any(marker in title or marker in body for marker in verification_markers):
            raise RuntimeError("Woolworths requires browser verification")

        descendants = driver.execute_script(
            r"""
            const base = arguments[0].replace(/\/+$/, '');
            return [...new Set([...document.querySelectorAll('a[href]')]
              .map((anchor) => {
                try {
                  const candidate = new URL(anchor.href, window.location.origin);
                  return candidate.origin === window.location.origin
                    ? candidate.pathname.replace(/\/+$/, '')
                    : null;
                } catch (_) {
                  return null;
                }
              })
              .filter((path) => path && path.startsWith(`${base}/`)))];
            """,
            category_path,
        ) or []

        current_height = int(
            driver.execute_script("return document.body.scrollHeight") or 0
        )
        before = len(capture.completed())

        driver.execute_script("window.scrollTo(0, document.body.scrollHeight)")
        time.sleep(CATEGORY_SCROLL_WAIT_SECONDS)

        after = len(capture.completed())
        new_height = int(
            driver.execute_script("return document.body.scrollHeight") or 0
        )

        changed = after > before or new_height > current_height or current_height > previous_height
        stable_rounds = 0 if changed else stable_rounds + 1
        previous_height = new_height

        if stable_rounds >= 4 and (after or descendants):
            break

    responses: list[dict[str, object]] = []
    category_requests: list[dict[str, object]] = []
    seen_request_ids: set[str] = set()

    for request_id, request in capture.completed():
        if request_id in seen_request_ids:
            continue
        seen_request_ids.add(request_id)

        catalogue_response = fetch_woolworths_catalogue_response(
            driver,
            request,
        )
        responses.append(catalogue_response)
        category_requests.append(request)

    unique_descendants = sorted(
        {
            str(item).split("?", 1)[0].split("#", 1)[0].rstrip("/")
            for item in descendants
            if item
        }
    )

    if not responses and not unique_descendants:
        raise RuntimeError("category API response was not observed")

    return {
        "categoryResponses": responses,
        "categoryRequests": category_requests,
        "subcategories": unique_descendants,
    }


def main() -> None:
    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)
    Path(PROFILE_DIR).mkdir(parents=True, exist_ok=True)

    processes: list[subprocess.Popen] = []
    server: ThreadingHTTPServer | None = None
    watchdog = None
    try:
        processes.append(start_process(
            ["Xvfb", DISPLAY, "-screen", "0", SCREEN, "-ac"],
            "Xvfb",
        ))
        wait_for_x_display()
        processes.append(start_process(["openbox"], "Openbox"))
        processes.append(start_process([
            "x11vnc", "-display", DISPLAY, "-forever", "-shared",
            "-nopw", "-rfbport", str(VNC_PORT),
        ], "x11vnc"))
        processes.append(start_process([
            "websockify", "--web=/usr/share/novnc/", f"{NOVNC_BIND_ADDRESS}:{NOVNC_PORT}",
            f"127.0.0.1:{VNC_PORT}",
        ], "noVNC"))
        processes.append(start_process([
            "socat",
            f"TCP-LISTEN:{CDP_RELAY_PORT},fork,reuseaddr,bind={CDP_RELAY_BIND_ADDRESS}",
            f"TCP:127.0.0.1:{CDP_PORT}",
        ], "private CDP relay"))
        server = ThreadingHTTPServer((FETCH_BIND_ADDRESS, FETCH_PORT), Handler)
        threading.Thread(target=server.serve_forever, daemon=True).start()
        watchdog = BrowserWatchdog(
            processes,
            lambda: probe_connections(VNC_PORT, NOVNC_PORT, CDP_PORT),
        )
        watchdog.start()

        import undetected_chromedriver as uc
        import undetected_chromedriver.patcher as uc_patcher
        from looseversion import LooseVersion

        configure_uc_version_parser(uc_patcher, LooseVersion)

        options = uc.ChromeOptions()
        options.add_argument("--window-size=1920,1080")
        options.add_argument("--start-maximized")

        clear_stale_chromium_profile_locks()
        executable = uc.find_chrome_executable()

        driver = uc.Chrome(
            options=options,
            user_data_dir=PROFILE_DIR,
            headless=False,
            browser_executable_path=executable,
            version_main=chromium_major_version(executable),
            port=CDP_PORT,
            enable_cdp_events=True,
        )
        driver.set_page_load_timeout(45)

        capture = CategoryCapture()
        driver.execute_cdp_cmd("Network.enable", {})
        driver.add_cdp_listener(
            "Network.requestWillBeSent",
            capture.request_will_be_sent,
        )
        driver.add_cdp_listener(
            "Network.responseReceived",
            capture.response_received,
        )
        driver.add_cdp_listener(
            "Network.loadingFinished",
            capture.loading_finished,
        )

        try:
            try:
                driver.get(START_URL)
            except Exception:
                print(
                    "Initial Woolworths navigation timed out; "
                    "the page remains open for verification",
                    flush=True,
                )

            global browser_ready, browser_failed
            browser_ready = True
            browser_failed = False
            watchdog.beat()

            print(
                f"Woolworths undetected Chrome ready: noVNC={NOVNC_PORT}, "
                f"fetch={FETCH_PORT}, CDP relay={CDP_RELAY_PORT}",
                flush=True,
            )

            while not stopping:
                try:
                    url, completed, result = requests.get(timeout=1)
                except Empty:
                    try:
                        driver.execute_script("return 1")
                        watchdog.beat()
                    except Exception as error:
                        browser_failed = True
                        browser_ready = False
                        watchdog.exit_for_restart(str(error))
                    continue

                try:
                    fetched = fetch_category(driver, capture, url)
                    result.update(fetched)
                except Exception as error:  # noqa: BLE001
                    result["error"] = str(error)
                finally:
                    completed.set()
                    watchdog.beat()
        finally:
            driver.quit()
    finally:
        browser_ready = False
        if watchdog:
            watchdog.stop()
        if server:
            server.shutdown()
            server.server_close()
        for process in reversed(processes):
            if process.poll() is None:
                process.terminate()
        for process in reversed(processes):
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                process.kill()


if __name__ == "__main__":
    main()
