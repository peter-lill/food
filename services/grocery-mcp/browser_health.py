"""Bounded local browser/display supervision; never navigates retailer pages."""
import argparse
import json
import os
import socket
import threading
import time
from urllib.request import urlopen



def transient_navigation_error(error):
    """Return True for the normal Playwright race caused by page navigation."""
    return "execution context was destroyed" in str(error).casefold()


def probe_connections(vnc_port, novnc_port, cdp_port=None):
    try:
        with socket.create_connection(('127.0.0.1', vnc_port), timeout=3) as stream:
            stream.settimeout(3)
            if not stream.recv(12).startswith(b'RFB '):
                raise RuntimeError('did not return an RFB greeting')
    except Exception as error:
        raise RuntimeError(f'VNC probe failed: {error}') from error

    try:
        with urlopen(f'http://127.0.0.1:{novnc_port}/vnc.html', timeout=3) as response:
            if response.status != 200:
                raise RuntimeError(f'HTTP {response.status}')
    except Exception as error:
        raise RuntimeError(f'noVNC probe failed: {error}') from error

    if cdp_port:
        try:
            with urlopen(f'http://127.0.0.1:{cdp_port}/json/version', timeout=3) as response:
                if not json.load(response).get('webSocketDebuggerUrl'):
                    raise RuntimeError('missing webSocketDebuggerUrl')
        except Exception as error:
            raise RuntimeError(f'Browser CDP probe failed: {error}') from error


class BrowserWatchdog:
    def __init__(self, processes, probe, fail=None, clock=time.monotonic):
        self.processes = processes
        self.probe = probe
        self.fail = fail or self.exit_for_restart
        self.clock = clock
        self.started_at = clock()
        self.last_heartbeat = None
        self.failures = 0
        self.stopped = threading.Event()

    @staticmethod
    def exit_for_restart(reason):
        print(f'Browser watchdog: {reason}; exiting for supervisor restart', flush=True)
        # A wedged browser can also hang quit(). The supervisor owns cleanup.
        os._exit(1)

    def beat(self):
        self.last_heartbeat = self.clock()

    def check_once(self):
        if self.last_heartbeat is None:
            if self.clock() - self.started_at > 180:
                self.fail('browser startup exceeded 180 seconds')
            return
        if self.clock() - self.last_heartbeat > 90:
            self.fail('browser command heartbeat stalled for 90 seconds')
            return
        try:
            if any(process.poll() is not None for process in self.processes):
                raise RuntimeError('a browser/display/VNC process exited')
            self.probe()
            self.failures = 0
        except Exception as error:
            if str(error).startswith('Browser CDP probe failed:'):
                self.failures = 0
                return
            self.failures += 1
            if self.failures >= 3:
                self.fail(str(error))

    def start(self):
        def watch():
            while not self.stopped.wait(10):
                self.check_once()
        threading.Thread(target=watch, daemon=True).start()

    def stop(self):
        self.stopped.set()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--vnc-port', type=int, required=True)
    parser.add_argument('--novnc-port', type=int, required=True)
    parser.add_argument('--cdp-port', type=int, required=True)
    args = parser.parse_args()
    watchdog = BrowserWatchdog([], lambda: probe_connections(args.vnc_port, args.novnc_port, args.cdp_port))
    while True:
        watchdog.beat()
        watchdog.check_once()
        time.sleep(10)


if __name__ == '__main__':
    main()
