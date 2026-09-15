import unittest
from unittest.mock import Mock, patch

from browser_health import BrowserWatchdog, probe_connections, transient_navigation_error
from coles_browser import chromium_major_version, fatal_browser_error
from woolworths_browser import CategoryCapture


class BrowserHealthTests(unittest.TestCase):
    def setUp(self):
        self.now = 0
        self.failures = []
        self.process = Mock()
        self.process.poll.return_value = None
        self.probe = Mock()
        self.watchdog = BrowserWatchdog([self.process], self.probe, self.failures.append, lambda: self.now)

    @patch("browser_health.socket.create_connection")
    def test_probe_connections_labels_vnc_failure(self, create_connection):
        create_connection.side_effect = TimeoutError("timed out")
        with self.assertRaisesRegex(RuntimeError, "VNC probe failed: timed out"):
            probe_connections(5901, 6084, 9224)

    def test_failed_vnc_requires_three_failures_and_recovers_between_them(self):
        self.watchdog.beat()
        self.probe.side_effect = OSError('VNC connection refused')
        self.watchdog.check_once()
        self.watchdog.check_once()
        self.assertEqual(self.failures, [])
        self.probe.side_effect = None
        self.watchdog.check_once()
        self.probe.side_effect = OSError('VNC connection refused')
        for _ in range(3):
            self.watchdog.check_once()
        self.assertEqual(self.failures, ['VNC connection refused'])

    def test_cdp_probe_failure_waits_for_heartbeat_timeout(self):
        self.watchdog.beat()
        self.probe.side_effect = RuntimeError("Browser CDP probe failed: timed out")

        for _ in range(3):
            self.watchdog.check_once()

        self.assertEqual(self.failures, [])

        self.now = 91
        self.watchdog.check_once()
        self.assertEqual(
            self.failures,
            ["browser command heartbeat stalled for 90 seconds"],
        )

    def test_child_process_exits_even_successfully_trigger_recovery(self):
        self.watchdog.beat()
        self.process.poll.return_value = 0
        for _ in range(3):
            self.watchdog.check_once()
        self.assertIn('process exited', self.failures[0])

    def test_hung_browser_command_is_bounded(self):
        self.watchdog.beat()
        self.now = 91
        self.watchdog.check_once()
        self.assertIn('heartbeat stalled', self.failures[0])

    def test_startup_grace_is_bounded(self):
        self.now = 179
        self.watchdog.check_once()
        self.assertEqual(self.failures, [])
        self.now = 181
        self.watchdog.check_once()
        self.assertIn('startup exceeded', self.failures[0])

    def test_woolworths_navigation_does_not_trigger_restart(self):
        self.assertTrue(
            transient_navigation_error(
                RuntimeError(
                    "Page.evaluate: Execution context was destroyed, "
                    "most likely because of a navigation"
                )
            )
        )
        self.assertFalse(
            transient_navigation_error(RuntimeError("Page crashed"))
        )

    def test_renderer_crash_requires_restart_but_verification_does_not(self):
        self.assertTrue(fatal_browser_error(RuntimeError('tab crashed')))
        self.assertTrue(fatal_browser_error(RuntimeError('target crashed')))
        self.assertFalse(fatal_browser_error(RuntimeError('Coles requires browser verification')))

    def test_driver_major_tracks_installed_chromium_after_rebuild(self):
        with patch('coles_browser.subprocess.run', return_value=Mock(stdout='Chromium 152.0.7977.82')):
            self.assertEqual(chromium_major_version('/usr/bin/chromium'), 152)

    def test_woolworths_category_capture_returns_only_paired_request_metadata(self):
        capture = CategoryCapture()
        request_id = "category-1"
        capture.request_will_be_sent({"params": {
            "requestId": request_id,
            "request": {
                "url": "https://www.woolworths.com.au/apis/ui/browse/category",
                "method": "POST",
                "postData": '{"pageNumber":2,"pageSize":36,"categoryId":"fruit"}',
            },
        }})
        capture.response_received({"params": {
            "requestId": request_id,
            "response": {
                "url": "https://www.woolworths.com.au/apis/ui/browse/category",
                "status": 200,
            },
        }})
        capture.loading_finished({"params": {"requestId": request_id}})
        capture.response_received({"params": {
            "requestId": "unpaired-response",
            "response": {
                "url": "https://www.woolworths.com.au/apis/ui/browse/category",
                "status": 200,
            },
        }})
        capture.loading_finished({"params": {"requestId": "unpaired-response"}})

        self.assertEqual(capture.completed(), [(
            request_id,
            {
                "url": "https://www.woolworths.com.au/apis/ui/browse/category",
                "method": "POST",
                "payload": {"pageNumber": 2, "pageSize": 36, "categoryId": "fruit"},
            },
        )])


if __name__ == '__main__':
    unittest.main()
