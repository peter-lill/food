"""Persistent, human-verifiable Woolworths browser for the catalogue bridge."""

import os
import signal
import subprocess
import time
from pathlib import Path

from playwright.sync_api import TimeoutError as PlaywrightTimeoutError
from playwright.sync_api import sync_playwright


DISPLAY = os.getenv("DISPLAY", ":99")
PROFILE_DIR = os.getenv("WOOLWORTHS_BROWSER_PROFILE", "/browser-profile")
START_URL = os.getenv("WOOLWORTHS_BROWSER_START_URL", "https://www.woolworths.com.au/")
CDP_PORT = int(os.getenv("WOOLWORTHS_BROWSER_CDP_PORT", "9222"))
NOVNC_PORT = int(os.getenv("WOOLWORTHS_BROWSER_NOVNC_PORT", "6080"))
VNC_PORT = int(os.getenv("WOOLWORTHS_BROWSER_VNC_PORT", "5900"))

stopping = False


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


def main() -> None:
    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)
    Path(PROFILE_DIR).mkdir(parents=True, exist_ok=True)

    processes: list[subprocess.Popen] = []
    try:
        processes.append(start_process(
            ["Xvfb", DISPLAY, "-screen", "0", "1365x768x24", "-ac"],
            "Xvfb",
        ))
        wait_for_x_display()
        processes.append(start_process(["openbox"], "Openbox"))
        processes.append(start_process([
            "x11vnc", "-display", DISPLAY, "-forever", "-shared", "-nopw",
            "-rfbport", str(VNC_PORT),
        ], "x11vnc"))
        processes.append(start_process([
            "websockify", "--web=/usr/share/novnc/", f"0.0.0.0:{NOVNC_PORT}",
            f"127.0.0.1:{VNC_PORT}",
        ], "noVNC"))

        with sync_playwright() as playwright:
            context = playwright.chromium.launch_persistent_context(
                PROFILE_DIR,
                headless=False,
                no_viewport=True,
                args=[
                    "--disable-dev-shm-usage",
                    "--no-first-run",
                    "--no-sandbox",
                    "--remote-debugging-address=0.0.0.0",
                    f"--remote-debugging-port={CDP_PORT}",
                    "--start-maximized",
                ],
            )
            page = context.pages[0] if context.pages else context.new_page()
            try:
                page.goto(START_URL, wait_until="domcontentloaded", timeout=45_000)
            except PlaywrightTimeoutError:
                print(
                    "Initial Woolworths navigation timed out; the page remains open for verification",
                    flush=True,
                )

            print(
                f"Woolworths browser ready: noVNC={NOVNC_PORT}, CDP={CDP_PORT}",
                flush=True,
            )
            while not stopping:
                if context.pages:
                    context.pages[0].wait_for_timeout(1_000)
                else:
                    time.sleep(1)
            context.close()
    finally:
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
