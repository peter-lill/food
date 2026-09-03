"""Persistent, human-verifiable Firefox session for the Coles catalogue bridge."""

import json
import os
import signal
import subprocess
import threading
import time
import re
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from queue import Empty, Queue
from urllib.parse import parse_qs, urlparse

from playwright.sync_api import TimeoutError as PlaywrightTimeoutError
from playwright.sync_api import sync_playwright


DISPLAY = os.getenv("DISPLAY", ":99")
PROFILE_DIR = os.getenv("COLES_BROWSER_PROFILE", "/browser-profile")
START_URL = os.getenv("COLES_BROWSER_START_URL", "https://www.coles.com.au/")
NOVNC_PORT = int(os.getenv("COLES_BROWSER_NOVNC_PORT", "6080"))
VNC_PORT = int(os.getenv("COLES_BROWSER_VNC_PORT", "5900"))
FETCH_PORT = int(os.getenv("COLES_BROWSER_FETCH_PORT", "8788"))

stopping = False
requests: Queue[tuple[str, threading.Event, dict[str, object]]] = Queue()


def coles_verification_error(body: str) -> str | None:
    lower = " ".join(body.split()).lower()
    if "pardon our interruption" in lower and "made us think you were a bot" in lower:
        return "Coles requires browser verification"
    return None


def missing_catalogue_data_error(title: str, body: str) -> str:
    """Return a compact public-page diagnostic when Coles changes its markup."""
    compact_body = " ".join(body.split())[:600]
    compact_title = " ".join(title.split())[:120]
    return (
        "Coles browse page did not expose its catalogue data "
        f"(title={compact_title!r}, body={compact_body!r})"
    )


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


def valid_coles_browse_url(value: str) -> bool:
    parsed = urlparse(value)
    return (
        parsed.scheme == "https"
        and parsed.netloc == "www.coles.com.au"
        and parsed.path.startswith("/browse/")
    )


def valid_coles_product_url(value: str) -> bool:
    """Allow only a canonical, public Coles product page with a numeric ID."""
    parsed = urlparse(value)
    return (
        parsed.scheme == "https"
        and parsed.netloc == "www.coles.com.au"
        and bool(re.fullmatch(r"/product/[^/]+-\d{4,16}/?", parsed.path))
    )


class Handler(BaseHTTPRequestHandler):
    server_version = "FoodColesFirefox/1.0"

    def send_json(self, status: int, payload: dict[str, object]) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:  # noqa: N802
        parsed = urlparse(self.path)
        if parsed.path == "/health":
            self.send_json(200, {"status": "ok", "browser": "firefox"})
            return
        if parsed.path != "/fetch":
            self.send_json(404, {"status": "error", "error": "Not found"})
            return
        url = (parse_qs(parsed.query).get("url") or [""])[0]
        if not (valid_coles_browse_url(url) or valid_coles_product_url(url)):
            self.send_json(400, {"status": "error", "error": "Only public Coles browse or product URLs are allowed"})
            return
        completed = threading.Event()
        result: dict[str, object] = {}
        requests.put((url, completed, result))
        if not completed.wait(timeout=90):
            self.send_json(504, {"status": "error", "error": "Firefox browser session did not return in time"})
            return
        if result.get("error"):
            self.send_json(502, {"status": "error", "error": result["error"]})
            return
        self.send_json(200, {"status": "success", "nextData": result["nextData"]})

    def log_message(self, format: str, *args: object) -> None:
        print(f"coles-firefox {self.address_string()} {format % args}", flush=True)


def fetch_page(context: object, url: str) -> str:
    page = context.new_page()
    try:
        page.goto(url, wait_until="domcontentloaded", timeout=45_000)
        body = page.locator("body").inner_text(timeout=5_000)
        verification_error = coles_verification_error(body)
        if verification_error:
            raise RuntimeError(verification_error)
        try:
            next_data = page.locator("#__NEXT_DATA__").text_content(timeout=15_000)
        except PlaywrightTimeoutError as error:
            raise RuntimeError(missing_catalogue_data_error(page.title(), body)) from error
        if not next_data:
            raise RuntimeError(missing_catalogue_data_error(page.title(), body))
        return next_data
    finally:
        page.close()


def main() -> None:
    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)
    Path(PROFILE_DIR).mkdir(parents=True, exist_ok=True)

    processes: list[subprocess.Popen] = []
    server: ThreadingHTTPServer | None = None
    try:
        processes.append(start_process(["Xvfb", DISPLAY, "-screen", "0", "1365x768x24", "-ac"], "Xvfb"))
        wait_for_x_display()
        processes.append(start_process(["openbox"], "Openbox"))
        processes.append(start_process([
            "x11vnc", "-display", DISPLAY, "-forever", "-shared", "-nopw", "-rfbport", str(VNC_PORT),
        ], "x11vnc"))
        processes.append(start_process([
            "websockify", "--web=/usr/share/novnc/", f"0.0.0.0:{NOVNC_PORT}", f"127.0.0.1:{VNC_PORT}",
        ], "noVNC"))
        server = ThreadingHTTPServer(("0.0.0.0", FETCH_PORT), Handler)
        threading.Thread(target=server.serve_forever, daemon=True).start()

        with sync_playwright() as playwright:
            context = playwright.firefox.launch_persistent_context(PROFILE_DIR, headless=False, no_viewport=True)
            page = context.pages[0] if context.pages else context.new_page()
            try:
                page.goto(START_URL, wait_until="domcontentloaded", timeout=45_000)
            except PlaywrightTimeoutError:
                print("Initial Coles navigation timed out; the page remains open for verification", flush=True)
            print(f"Coles Firefox browser ready: noVNC={NOVNC_PORT}, fetch={FETCH_PORT}", flush=True)
            while not stopping:
                try:
                    url, completed, result = requests.get(timeout=1)
                except Empty:
                    continue
                try:
                    result["nextData"] = fetch_page(context, url)
                except Exception as error:  # noqa: BLE001
                    result["error"] = str(error)
                finally:
                    completed.set()
            context.close()
    finally:
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
