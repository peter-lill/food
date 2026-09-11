import unittest
from unittest.mock import Mock, patch

from browser_health import BrowserWatchdog
from coles_browser import chromium_major_version, fatal_browser_error


class BrowserHealthTests(unittest.TestCase):
    def setUp(self):
        self.now = 0
        self.failures = []
        self.process = Mock()
        self.process.poll.return_value = None
        self.probe = Mock()
        self.watchdog = BrowserWatchdog([self.process], self.probe, self.failures.append, lambda: self.now)

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

    def test_renderer_crash_requires_restart_but_verification_does_not(self):
        self.assertTrue(fatal_browser_error(RuntimeError('tab crashed')))
        self.assertTrue(fatal_browser_error(RuntimeError('target crashed')))
        self.assertFalse(fatal_browser_error(RuntimeError('Coles requires browser verification')))

    def test_driver_major_tracks_installed_chromium_after_rebuild(self):
        with patch('coles_browser.subprocess.run', return_value=Mock(stdout='Chromium 152.0.7977.82')):
            self.assertEqual(chromium_major_version('/usr/bin/chromium'), 152)


if __name__ == '__main__':
    unittest.main()
