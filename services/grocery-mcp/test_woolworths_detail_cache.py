import importlib.util
import json
import os
import sys
import tempfile
import types
import unittest
from io import BytesIO
from pathlib import Path
from unittest.mock import MagicMock, patch
from urllib.error import HTTPError
from http.client import RemoteDisconnected


class WoolworthsDetailCacheTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        os.environ["WOOLWORTHS_CATALOGUE_DB"] = str(Path(self.temporary.name) / "catalogue.sqlite3")
        os.environ["COLES_CATALOGUE_DB"] = str(Path(self.temporary.name) / "coles-catalogue.sqlite3")
        os.environ["ALDI_CATALOGUE_DB"] = str(Path(self.temporary.name) / "aldi-catalogue.sqlite3")
        supermarkets = types.ModuleType("src.supermarkets")
        supermarkets.COLES_DEFAULT_STORE_ID = "520"
        supermarkets.coles_search_products = lambda **_: {"status": "success", "results": []}
        sys.modules["src"] = types.ModuleType("src")
        sys.modules["src.supermarkets"] = supermarkets
        playwright = types.ModuleType("playwright.sync_api")
        playwright.sync_playwright = lambda: None
        playwright.TimeoutError = TimeoutError
        sys.modules["playwright"] = types.ModuleType("playwright")
        sys.modules["playwright.sync_api"] = playwright
        path = Path(__file__).with_name("bridge.py")
        spec = importlib.util.spec_from_file_location("food_grocery_bridge_test", path)
        assert spec and spec.loader
        self.bridge = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(self.bridge)
        self.coles_catalogue = sys.modules["coles_catalogue"]
        self.coles_db_patch = patch.object(self.coles_catalogue, "COLES_CATALOGUE_DB", os.environ["COLES_CATALOGUE_DB"])
        self.coles_db_patch.start()
        self.addCleanup(self.coles_db_patch.stop)
        browser_path = Path(__file__).with_name("coles_browser.py")
        browser_spec = importlib.util.spec_from_file_location("food_coles_uc_browser_test", browser_path)
        assert browser_spec and browser_spec.loader
        self.coles_browser = importlib.util.module_from_spec(browser_spec)
        browser_spec.loader.exec_module(self.coles_browser)
        self.aldi_catalogue = sys.modules["aldi_catalogue"]

    def tearDown(self) -> None:
        self.temporary.cleanup()

    def test_grocery_image_includes_coles_taxonomy_dependency(self) -> None:
        dockerfile = Path(__file__).with_name("Dockerfile").read_text()
        self.assertIn(
            "COPY services/grocery-mcp/retailer_taxonomy.py /opt/grocery-mcp/retailer_taxonomy.py",
            dockerfile,
        )

    def test_coles_collection_resume_accepts_leaf_paths_only(self) -> None:
        self.assertTrue(self.bridge.valid_coles_collection_resume(
            "/browse/pantry/cooking-ingredients/oils",
        ))
        self.assertFalse(self.bridge.valid_coles_collection_resume("/browse/pantry?start=48"))
        self.assertFalse(self.bridge.valid_coles_collection_resume("/product/not-a-category"))

    def test_navigation_only_category_can_seed_descendants_without_product_api(self) -> None:
        root = "/shop/browse/health-beauty"
        children = [
            "/shop/browse/health-beauty/health",
            "/shop/browse/health-beauty/beauty",
        ]

        payload = self.bridge.completed_woolworths_browse_payload([], children)

        self.assertEqual(payload, {
            "categoryResponses": [],
            "subcategories": children,
        })

    def test_coles_ssr_page_is_cached_with_the_visible_catalogue_total(self) -> None:
        raw = json.dumps({"props": {"pageProps": {"searchResults": {
            "noOfResults": 492,
            "pageSize": 48,
            "start": 0,
            "results": [{
                "id": 8112449,
                "name": "Australian No Added Hormones Beef Mince Lean",
                "brand": "Coles",
                "size": "500g",
                "availability": True,
                "pricing": {"now": 8.50, "was": 10.00, "promotion": "Special"},
                "imageUris": ["https://example.test/mince.jpg"],
                "onlineHeirs": [{"name": "Meat & Seafood"}],
            }],
        }}}})
        result = self.bridge.parse_coles_browse_document(raw)
        self.assertEqual(result["noOfResults"], 492)
        self.assertEqual(self.bridge.ColesBrowserSession().browse(
            "/browse/meat-seafood", lambda _url: raw
        ), 1)
        products = self.bridge.coles_cached_products(10, 0)
        self.assertEqual(products[0]["external_id"], "8112449")
        self.assertEqual(products[0]["price"], 8.5)
        self.assertTrue(products[0]["is_special"])
        self.assertEqual(products[0]["category_paths"], [
            "/browse/meat-seafood", "Meat & Seafood",
        ])

    def test_coles_search_preserves_the_nested_listing_image(self) -> None:
        payload = {
            "response_data": {
                "results": [{
                    "id": 5428639,
                    "name": "Simply Spread",
                    "size": "1kg",
                    "pricing": {"now": 4.50},
                    "imageUris": {
                        "thumbnail": "https://example.test/spread-small.jpg",
                        "large": "https://example.test/simply-spread-large.jpg",
                    },
                }],
            },
        }

        products = self.bridge.coles_products(payload)

        self.assertEqual(products[0]["productId"], "5428639")
        self.assertEqual(products[0]["imageUrl"], "https://example.test/simply-spread-large.jpg")

    def test_coles_browser_verification_page_is_reported_before_catalogue_parsing(self) -> None:
        body = """
            Pardon Our Interruption
            As you were browsing something about your browser made us think you were a bot.
            Please stand by.
        """

        self.assertEqual(
            self.coles_catalogue.coles_browser_verification_error(body),
            "Coles requires browser verification",
        )
        self.assertIsNone(self.coles_catalogue.coles_browser_verification_error("Browse Meat & Seafood"))

    def test_coles_category_api_uses_the_configured_gateway_key_and_store(self) -> None:
        response = MagicMock()
        response.read.return_value = b'{"categories":[{"id":"meat"}]}'
        response.__enter__.return_value = response
        with patch.object(self.coles_catalogue, "COLES_API_KEY", "test-key"), patch.object(
            self.coles_catalogue, "COLES_STORE_ID", "0584"
        ), patch.object(self.coles_catalogue, "urlopen", return_value=response) as open_request:
            payload = self.coles_catalogue.coles_category_api()

        self.assertEqual(payload, {"categories": [{"id": "meat"}]})
        request = open_request.call_args.args[0]
        self.assertEqual(request.full_url, "https://apigw.coles.com.au/digital/colesappbff/v2/products/category?storeId=0584")
        self.assertEqual(request.get_header("Ocp-apim-subscription-key"), "test-key")

    def test_coles_category_api_requires_the_existing_api_configuration(self) -> None:
        with patch.object(self.coles_catalogue, "COLES_API_KEY", ""):
            with self.assertRaisesRegex(RuntimeError, "COLES_API_KEY"):
                self.coles_catalogue.coles_category_api()

    def test_coles_legacy_category_api_uses_the_configured_key_in_its_legacy_format(self) -> None:
        response = MagicMock()
        response.read.return_value = b'{"categories":[{"id":"3498509"}]}'
        response.__enter__.return_value = response
        with patch.object(self.coles_catalogue, "COLES_API_KEY", "test-key"), patch.object(
            self.coles_catalogue, "COLES_STORE_ID", "0584"
        ), patch.object(self.coles_catalogue, "urlopen", return_value=response) as open_request:
            payload = self.coles_catalogue.coles_legacy_category_api("3498509")

        self.assertEqual(payload, {"categories": [{"id": "3498509"}]})
        request = open_request.call_args.args[0]
        self.assertEqual(
            request.full_url,
            "https://www.coles.com.au/api/bff/products/categories?storeId=0584&subscription-key=test-key&id=3498509",
        )
        self.assertIsNone(request.get_header("Ocp-apim-subscription-key"))

    def test_coles_legacy_category_diagnostic_reports_html_without_exposing_it(self) -> None:
        response = MagicMock()
        response.status = 403
        response.headers.get_content_type.return_value = "text/html"
        response.read.return_value = b"<html><title>Access Denied</title></html>"
        response.__enter__.return_value = response
        with patch.object(self.coles_catalogue, "COLES_API_KEY", "test-key"), patch.object(
            self.coles_catalogue, "COLES_STORE_ID", "0584"
        ), patch.object(self.coles_catalogue, "urlopen", return_value=response):
            diagnostic = self.coles_catalogue.coles_legacy_category_api_diagnostic("3498509")

        self.assertEqual(diagnostic, {
            "upstreamStatus": 403,
            "contentType": "text/html",
            "responseBytes": 41,
            "classification": "access-denied",
            "pageSignals": ["access-denied"],
        })

    def test_coles_response_diagnostic_reports_valid_json(self) -> None:
        self.assertEqual(
            self.coles_catalogue.coles_response_diagnostic(200, "application/json", b'{"categories":[]}'),
            {
                "upstreamStatus": 200,
                "contentType": "application/json",
                "responseBytes": 17,
                "classification": "json",
                "pageSignals": [],
            },
        )

    def test_coles_html_diagnostic_only_returns_allowlisted_markers(self) -> None:
        self.assertEqual(
            self.coles_catalogue.coles_html_diagnostic_signals(
                "text/html", b"<html>Powered by Incapsula: Imperva Access Denied https://example.test/private</html>"
            ),
            ["access-denied", "imperva", "incapsula"],
        )

    def test_uc_bridge_only_accepts_safe_coles_catalogue_pages(self) -> None:
        self.assertTrue(self.coles_browser.valid_coles_browse_url(
            "https://www.coles.com.au/browse/meat-seafood?sortBy=recommendedDescending"
        ))
        self.assertTrue(self.coles_browser.valid_coles_product_url(
            "https://www.coles.com.au/product/coles-simply-table-spread-1kg-5428639"
        ))
        self.assertFalse(self.coles_browser.valid_coles_product_url("https://www.coles.com.au/product/example"))
        self.assertFalse(self.coles_browser.valid_coles_product_url("https://example.test/product/coles-simply-table-spread-1kg-5428639"))
        self.assertFalse(self.coles_browser.valid_coles_browse_url("https://example.test/browse/meat-seafood"))
        self.assertEqual(
            self.coles_browser.coles_verification_error(
                "Pardon Our Interruption. Your browser made us think you were a bot."
            ),
            "Coles requires browser verification",
        )

    def test_uc_browser_reports_a_compact_page_diagnostic_when_markup_changes(self) -> None:
        message = self.coles_browser.missing_catalogue_data_error(
            "Coles | Meat & Seafood",
            "Meat & Seafood  " + "Fresh products " * 100,
        )
        self.assertIn("title='Coles | Meat & Seafood'", message)
        self.assertIn("body='Meat & Seafood Fresh products", message)
        self.assertLess(len(message), 850)

    def test_uc_uses_python312_compatible_loose_version_parser(self) -> None:
        patcher = types.SimpleNamespace(LooseVersion=object)

        self.coles_browser.configure_uc_version_parser(patcher, "compatible-parser")

        self.assertEqual(patcher.LooseVersion, "compatible-parser")

    def test_uc_browser_fetches_next_data_in_a_disposable_tab(self) -> None:
        class SwitchTo:
            def __init__(self, driver: object) -> None:
                self.driver = driver

            def new_window(self, _kind: str) -> None:
                self.driver.current_window_handle = "fetch-tab"

            def window(self, handle: str) -> None:
                self.driver.current_window_handle = handle

        class Driver:
            def __init__(self) -> None:
                self.current_window_handle = "verified-session"
                self.switch_to = SwitchTo(self)
                self.title = "Coles | Pantry"
                self.closed = False
                self.url = ""

            def get(self, url: str) -> None:
                self.url = url

            def execute_script(self, script: str) -> str:
                if "__NEXT_DATA__" in script:
                    return '{"props":{"pageProps":{}}}'
                if "querySelectorAll" in script:
                    return []
                return "Pantry products"

            def close(self) -> None:
                self.closed = True

        driver = Driver()
        url = "https://www.coles.com.au/browse/pantry"

        self.assertEqual(
            self.coles_browser.fetch_page(driver, url),
            ('{"props":{"pageProps":{}}}', []),
        )
        self.assertEqual(driver.url, url)
        self.assertTrue(driver.closed)
        self.assertEqual(driver.current_window_handle, "verified-session")

    def test_uc_browser_retries_a_blank_disposable_tab_before_failing_discovery(self) -> None:
        class SwitchTo:
            def __init__(self, driver: object) -> None:
                self.driver = driver

            def new_window(self, _kind: str) -> None:
                self.driver.current_window_handle = "fetch-tab"

            def window(self, handle: str) -> None:
                self.driver.current_window_handle = handle

        class Driver:
            def __init__(self) -> None:
                self.current_window_handle = "verified-session"
                self.switch_to = SwitchTo(self)
                self.navigations = []
                self.closed = False

            @property
            def title(self) -> str:
                return "" if len(self.navigations) == 1 else "Coles | Pantry"

            def get(self, url: str) -> None:
                self.navigations.append(url)

            def execute_script(self, script: str) -> str | None:
                if "__NEXT_DATA__" in script:
                    return None if len(self.navigations) == 1 else '{"props":{"pageProps":{}}}'
                if "querySelectorAll" in script:
                    return []
                return "" if len(self.navigations) == 1 else "Pantry products"

            def close(self) -> None:
                self.closed = True

        driver = Driver()
        url = "https://www.coles.com.au/browse/pantry"

        self.assertEqual(
            self.coles_browser.fetch_page(driver, url, page_wait_seconds=0),
            ('{"props":{"pageProps":{}}}', []),
        )
        self.assertEqual(driver.navigations, [url, url])
        self.assertTrue(driver.closed)
        self.assertEqual(driver.current_window_handle, "verified-session")

    def test_uc_browser_restarts_a_session_that_stays_blank_after_navigation_retry(self) -> None:
        class SwitchTo:
            def __init__(self, driver: object) -> None:
                self.driver = driver

            def new_window(self, _kind: str) -> None:
                self.driver.current_window_handle = "fetch-tab"

            def window(self, handle: str) -> None:
                self.driver.current_window_handle = handle

        class Driver:
            def __init__(self) -> None:
                self.current_window_handle = "verified-session"
                self.switch_to = SwitchTo(self)
                self.title = ""
                self.navigations = []
                self.closed = False

            def get(self, url: str) -> None:
                self.navigations.append(url)

            def execute_script(self, script: str) -> str | None:
                if "querySelectorAll" in script:
                    return []
                return None if "__NEXT_DATA__" in script else ""

            def close(self) -> None:
                self.closed = True

        driver = Driver()
        url = "https://www.coles.com.au/browse/pantry"

        with self.assertRaisesRegex(
            self.coles_browser.BlankColesPageError,
            "blank page after retrying navigation",
        ) as raised:
            self.coles_browser.fetch_page(driver, url, page_wait_seconds=0)

        self.assertTrue(self.coles_browser.fatal_browser_error(raised.exception))
        self.assertEqual(driver.navigations, [url, url])
        self.assertTrue(driver.closed)
        self.assertEqual(driver.current_window_handle, "verified-session")

    def test_coles_product_document_requires_the_exact_retailer_id(self) -> None:
        raw = json.dumps({"props": {"pageProps": {
            "navigation": {"id": "not-a-product"},
            "product": {
                "id": "5428639",
                "name": "Coles Simply Table Spread",
                "brand": "Coles Simply",
                "size": "1 kg",
                "pricing": {"now": 3.5},
                "imageUris": {"large": "https://images.example/coles-simply.jpg"},
            },
        }}})
        product = self.coles_catalogue.parse_coles_product_document(raw, "5428639")
        self.assertEqual(product["name"], "Coles Simply Table Spread")
        with self.assertRaisesRegex(RuntimeError, "requested product"):
            self.coles_catalogue.parse_coles_product_document(raw, "9999999")

    def test_uc_catalogue_engine_reads_exact_product_page(self) -> None:
        raw = json.dumps({"props": {"pageProps": {"product": {
            "id": "5428639", "name": "Coles Simply Table Spread", "pricing": {"now": 3.5},
        }}}})
        product = self.coles_catalogue.ColesBrowserSession(
            browser_engine="undetected-chromedriver", browser_fetch_url="http://uc.test/fetch"
        ).product(
            "https://www.coles.com.au/product/coles-simply-table-spread-1kg-5428639",
            "5428639",
            fetch_page=lambda url: raw,
        )
        self.assertEqual(product["id"], "5428639")

    def test_uc_catalogue_engine_requires_a_configured_browser_session(self) -> None:
        with self.assertRaisesRegex(RuntimeError, "COLES_BROWSER_FETCH_URL"):
            self.coles_catalogue.ColesBrowserSession(
                browser_engine="undetected-chromedriver", browser_fetch_url=""
            ).browse("/browse/meat-seafood")

    def test_uc_catalogue_engine_returns_proxy_error_detail(self) -> None:
        proxy_error = HTTPError(
            "http://uc.test/fetch", 502, "Bad Gateway", {},
            BytesIO(b'{"status":"error","error":"Coles requires browser verification"}'),
        )
        with patch.object(self.coles_catalogue, "urlopen", side_effect=proxy_error):
            with self.assertRaisesRegex(RuntimeError, "Coles requires browser verification"):
                self.coles_catalogue.ColesBrowserSession(
                    browser_engine="undetected-chromedriver", browser_fetch_url="http://uc.test/fetch"
                ).browse("/browse/meat-seafood")

    def test_uc_catalogue_engine_normalises_restart_disconnect_for_retry(self) -> None:
        with patch.object(self.coles_catalogue, "urlopen", side_effect=RemoteDisconnected()):
            with self.assertRaisesRegex(RuntimeError, "browser session is unavailable"):
                self.coles_catalogue.ColesBrowserSession(
                    browser_fetch_url="http://uc.test/fetch",
                ).browser_payload("https://www.coles.com.au/browse/drinks/iced-tea")

    def test_uc_browser_clears_stale_x_display_entries(self) -> None:
        root = Path(self.temporary.name)
        socket_dir = root / ".X11-unix"
        socket_dir.mkdir()
        lock = root / ".X99-lock"
        socket = socket_dir / "X99"
        lock.write_text("123")
        socket.write_text("stale")

        self.coles_browser.clear_stale_x_display_entries(":99", str(root))

        self.assertFalse(lock.exists())
        self.assertFalse(socket.exists())

    def test_coles_category_resume_starts_at_the_first_uncached_page(self) -> None:
        category = "/browse/deli"

        def payload(start: int, product_id: int) -> str:
            return json.dumps({"props": {"pageProps": {"searchResults": {
                "noOfResults": 96,
                "pageSize": 48,
                "start": start,
                "results": [{
                    "id": product_id,
                    "name": f"Deli product {product_id}",
                    "availability": True,
                    "pricing": {"now": 4.5},
                }],
            }}}})

        first_urls = []

        def interrupted(url: str) -> str:
            first_urls.append(url)
            if "start=48" in url:
                raise RuntimeError("Coles requires browser verification")
            return payload(0, 1001)

        with self.assertRaisesRegex(RuntimeError, "browser verification"):
            self.coles_catalogue.ColesBrowserSession().browse(category, interrupted)

        with self.coles_catalogue.cache_session() as connection:
            checkpoint = connection.execute(
                "SELECT state, next_offset, next_page FROM coles_category_collection WHERE category_path=?",
                (category,),
            ).fetchone()
        self.assertEqual(dict(checkpoint), {"state": "failed", "next_offset": 48, "next_page": 2})

        resumed_urls = []

        def resumed(url: str) -> str:
            resumed_urls.append(url)
            return payload(48, 1002)

        self.assertEqual(
            self.coles_catalogue.ColesBrowserSession().browse(category, resumed, resume=True),
            2,
        )
        self.assertEqual(len(resumed_urls), 1)
        self.assertIn("start=48", resumed_urls[0])
        self.assertIn("page=2", resumed_urls[0])
        with self.coles_catalogue.cache_session() as connection:
            checkpoint = connection.execute(
                "SELECT state, next_offset, next_page FROM coles_category_collection WHERE category_path=?",
                (category,),
            ).fetchone()
        self.assertEqual(dict(checkpoint), {"state": "completed", "next_offset": 96, "next_page": 3})
        with self.coles_catalogue.cache_session() as connection:
            connection.execute("DELETE FROM coles_products WHERE external_id IN ('1001', '1002')")
            connection.execute("DELETE FROM coles_category_collection WHERE category_path=?", (category,))

    def test_coles_refresh_recursively_discovers_and_collects_only_leaves(self) -> None:
        root = "/browse/pantry"
        branch = f"{root}/cooking"
        leaves = [f"{branch}/oil", f"{branch}/salt"]

        class Session:
            def __init__(self) -> None:
                self.browsed = []

            def children(self, category: str) -> list[str]:
                return {root: [branch], branch: leaves}.get(category, [])

            def browse(self, category: str, resume: bool = False) -> int:
                self.browsed.append((category, resume))
                return 0

        session = Session()
        stale = "/browse/obsolete/leaf"
        with self.coles_catalogue.cache_session() as connection:
            connection.execute(
                "INSERT INTO coles_category_collection (category_path, state, is_leaf) VALUES (?, 'completed', 1)",
                (stale,),
            )
        with patch.object(self.coles_catalogue, "COLES_ROOT_CATEGORIES", (root,)):
            self.coles_catalogue.refresh_all(session=session)

        self.assertEqual(session.browsed, [(leaves[0], False), (leaves[1], False)])
        with self.coles_catalogue.cache_session() as connection:
            rows = connection.execute(
                "SELECT category_path, is_leaf FROM coles_category_collection WHERE is_leaf IS NOT NULL ORDER BY category_path"
            ).fetchall()
            stale_leaf = connection.execute(
                "SELECT is_leaf FROM coles_category_collection WHERE category_path=?", (stale,)
            ).fetchone()
        self.assertEqual(
            [(row["category_path"], row["is_leaf"]) for row in rows],
            [(root, 0), (branch, 0), (leaves[0], 1), (leaves[1], 1)],
        )
        self.assertIsNone(stale_leaf["is_leaf"])
        self.assertEqual(self.coles_catalogue.status()["total"], 2)

    def test_coles_discovery_survives_failure_and_publishes_leaf_jobs(self) -> None:
        root = "/browse/pantry"
        oil, salt = root + "/oil", root + "/salt"
        session = unittest.mock.Mock()
        session.children.side_effect = lambda category: [oil, salt] if category == root else ([] if category == oil else (_ for _ in ()).throw(RuntimeError("offline")))
        with patch.object(self.coles_catalogue, "COLES_ROOT_CATEGORIES", (root,)), patch.object(self.coles_catalogue.time, "sleep"):
            with self.assertRaisesRegex(RuntimeError, "offline"):
                self.coles_catalogue.refresh_all(session=session)
            summary = self.coles_catalogue.status()
            self.assertEqual(summary["total"], 1)
            self.assertEqual(summary["discovery"], {"total": 3, "completed": 2, "pending": 1, "failed": 1})
            session.browse.assert_called_once_with(oil, resume=False)
            recovered = unittest.mock.Mock()
            recovered.children.return_value = []
            self.coles_catalogue.refresh_all(session=recovered)
            recovered.children.assert_called_once_with(salt)
            self.assertEqual(recovered.browse.call_count, 2)
            with self.coles_catalogue.cache_session() as connection:
                connection.execute("UPDATE coles_category_collection SET state='completed' WHERE category_path=?", (oil,))
                connection.execute("UPDATE coles_category_collection SET state='failed', next_offset=48, next_page=2 WHERE category_path=?", (salt,))
            resumed = unittest.mock.Mock()
            self.coles_catalogue.refresh_all(session=resumed)
            resumed.children.assert_not_called()
            resumed.browse.assert_called_once_with(salt, resume=True)

    def test_coles_collects_leaf_before_next_discovery_and_resumes_failed_page(self) -> None:
        root = "/browse/pantry"
        oil, salt = root + "/oil", root + "/salt"
        events = []
        session = unittest.mock.Mock()

        def children(category):
            events.append(("discover", category))
            return [oil, salt] if category == root else []

        def interrupted(category, resume=False):
            events.append(("collect", category))
            with self.coles_catalogue.cache_session() as connection:
                connection.execute("UPDATE coles_category_collection SET state='failed', next_offset=48, next_page=2 WHERE category_path=?", (category,))
            raise RuntimeError("page interrupted")

        session.children.side_effect = children
        session.browse.side_effect = interrupted
        with patch.object(self.coles_catalogue, "COLES_ROOT_CATEGORIES", (root,)):
            with self.assertRaisesRegex(RuntimeError, "page interrupted"):
                self.coles_catalogue.refresh_all(session=session)
            self.assertEqual(events, [("discover", root), ("discover", oil), ("collect", oil)])
            self.assertEqual(self.coles_catalogue.status()["discovery"]["pending"], 1)
            events.clear()

            def collected(category, resume=False):
                events.append(("collect", category))
                if category == oil:
                    self.assertTrue(resume)
                    with self.coles_catalogue.cache_session() as connection:
                        row = connection.execute("SELECT next_offset, next_page FROM coles_category_collection WHERE category_path=?", (oil,)).fetchone()
                    self.assertEqual(tuple(row), (48, 2))
                with self.coles_catalogue.cache_session() as connection:
                    connection.execute("UPDATE coles_category_collection SET state='completed' WHERE category_path=?", (category,))

            session.browse.side_effect = collected
            self.coles_catalogue.refresh_all(session=session)
            self.assertEqual(events, [("collect", oil), ("discover", salt), ("collect", salt)])
            events.clear()
            self.coles_catalogue.refresh_all(session=session)
            self.assertEqual(events, [])

    def test_coles_refresh_resumes_at_discovered_leaf_checkpoint(self) -> None:
        root = "/browse/pantry"
        leaves = [f"{root}/oil", f"{root}/salt", f"{root}/spices"]

        class Session:
            def __init__(self) -> None:
                self.browsed = []

            def children(self, category: str) -> list[str]:
                return leaves if category == root else []

            def browse(self, category: str, resume: bool = False) -> int:
                self.browsed.append((category, resume))
                return 0

        session = Session()
        with patch.object(self.coles_catalogue, "COLES_ROOT_CATEGORIES", (root,)):
            self.coles_catalogue.refresh_all(resume_category=leaves[1], session=session)
        self.assertEqual(session.browsed, [(leaves[1], True), (leaves[2], False)])

    def test_coles_discovery_retries_the_failed_node_after_browser_restart(self) -> None:
        category = "/browse/drinks/iced-tea"

        class Session:
            def __init__(self) -> None:
                self.calls = 0

            def children(self, requested: str) -> list[str]:
                self.calls += 1
                self.assert_category = requested
                if self.calls == 1:
                    raise RuntimeError("Undetected Chrome session did not return in time")
                return [f"{requested}/black-tea"]

        session = Session()
        with patch.object(self.coles_catalogue.time, "sleep") as sleep:
            children = self.coles_catalogue.discover_children(session, category)
        self.assertEqual(children, [f"{category}/black-tea"])
        self.assertEqual(session.assert_category, category)
        self.assertEqual(session.calls, 2)
        sleep.assert_called_once_with(5)

    def test_coles_cache_merges_paths_when_product_appears_in_multiple_leaves(self) -> None:
        product = {
            "id": 1234,
            "name": "Shared product",
            "availability": True,
            "pricing": {"now": 5.0},
        }
        first = "/browse/pantry/cooking/oil"
        second = "/browse/pantry/health-food/oil"
        self.coles_catalogue.cache_page(first, {"results": [product]})
        self.coles_catalogue.cache_page(second, {"results": [product]})

        cached = self.coles_catalogue.cached_products(10, 0)[0]
        self.assertEqual(cached["category_path"], first)
        self.assertEqual(cached["category_paths"], [first, second])

    def test_public_aldi_listing_keeps_product_identity_price_and_catalogue_path(self) -> None:
        listing = '''
          <div id="product-tile-000000000000173130"><div class="product-tile">
          <a href="/product/haribo-mega-roulette-45g-000000000000173130" class="product-tile__link">
          <img class="base-image" src="https://images.example/roulette.jpg">
          <div class="product-tile__brandname"><p>HARIBO</p></div>
          <div class="product-tile__name"><p>Mega Roulette 45g</p></div>
          <div class="product-tile__unit-of-measurement"><p>45 g</p></div>
          <div class="product-tile__comparison-price"><p>($2.20 per 100 g)</p></div>
          <div data-test="product-tile__price"><span>$0.99</span></div></a></div></div>
          <a href="/products?page=2">2</a><a href="/products?page=5">5</a>
        '''
        products, pages = self.aldi_catalogue.parse_aldi_listing(listing, "/products/pantry/confectionery/k/1111111181")

        self.assertEqual(pages, 5)
        self.assertEqual(products, [{
            "external_id": "173130", "name": "Mega Roulette 45g", "brand": "HARIBO",
            "pack_size": "45 g", "unit_price": "($2.20 per 100 g)", "price": 0.99,
            "image_url": "https://images.example/roulette.jpg",
            "product_url": "https://www.aldi.com.au/product/haribo-mega-roulette-45g-000000000000173130",
            "category_path": "/products/pantry/confectionery/k/1111111181",
        }])

    def test_empty_category_without_api_or_descendants_still_fails(self) -> None:
        with self.assertRaisesRegex(RuntimeError, "category API response was not observed"):
            self.bridge.completed_woolworths_browse_payload([], [])

    def test_stable_navigation_only_category_finishes_before_session_timeout(self) -> None:
        children = ["/shop/browse/health-beauty/health"]

        self.assertFalse(self.bridge.woolworths_browse_page_is_ready([], children, 3))
        self.assertTrue(self.bridge.woolworths_browse_page_is_ready([], children, 4))
        self.assertFalse(self.bridge.woolworths_browse_page_is_ready([], [], 4))
        maximum_work_seconds = (
            self.bridge.WOOLWORTHS_CATEGORY_NAVIGATION_SECONDS
            + self.bridge.WOOLWORTHS_CATEGORY_SCROLL_ROUNDS
            * self.bridge.WOOLWORTHS_CATEGORY_SCROLL_WAIT_MS
            / 1000
        )
        self.assertGreater(
            self.bridge.WOOLWORTHS_CATEGORY_SESSION_SECONDS,
            maximum_work_seconds,
        )

    def test_obsolete_health_beauty_root_is_migrated_to_live_beauty_route(self) -> None:
        legacy = "/shop/browse/health-beauty"
        current = "/shop/browse/beauty"
        with self.bridge.catalogue_session() as connection:
            connection.execute(
                """INSERT INTO woolworths_category_collection
                   (category_path, state, attempts, last_error)
                   VALUES (?, 'failed', 5, 'browser category session did not return in time')""",
                (legacy,),
            )

        self.bridge.seed_woolworths_category_collection()

        states = {
            item["category_path"]: item["state"]
            for item in self.bridge.woolworths_collection_status()["categories"]
        }
        self.assertNotIn(legacy, states)
        self.assertEqual(states[current], "pending")

    def test_rich_detail_fields_are_cached_without_erasing_catalogue_identity(self) -> None:
        self.bridge.cache_woolworths_category("/shop/browse/dairy-eggs-fridge/milk", {
            "Products": [{
                "Stockcode": 123456,
                "Barcode": "9300000000001",
                "DisplayName": "Example Full Cream Milk 2L",
                "Price": 3.50,
                "PackageSize": "2L",
            }],
        })
        enriched, failed = self.bridge.cache_woolworths_details([{
            "stockcode": "123456",
            "payload": {
                "Product": {
                    "Brand": "Example Dairy",
                    "Description": "<b>Fresh Australian milk.</b>",
                    "RichDescription": "Long <br> product description",
                    "AdditionalAttributes": {
                        "ingredients": "Australian cow's milk.",
                        "allergencontains": "Milk",
                        "allergenmaybepresent": "Soy",
                        "wool_dietaryclaim": "Vegetarian",
                        "countryoforigin": "Made in Australia",
                        "storageinstructions": "Keep refrigerated below 5C.",
                        "usageinstructions": "Shake well before serving.",
                    },
                },
                "Nutrition": [{"Name": "Protein", "Values": {"Quantity Per 100g / 100mL": "3.4 g"}}],
                "DetailsImagePaths": ["https://cdn.example/123456.jpg", "https://cdn.example/123456_2.jpg"],
            },
        }])

        self.assertEqual((enriched, failed), (1, 0))
        product = self.bridge.woolworths_cached_detail("123456")
        self.assertEqual(product["name"], "Example Full Cream Milk 2L")
        self.assertEqual(product["barcode"], "9300000000001")
        self.assertEqual(product["brand"], "Example Dairy")
        self.assertEqual(product["description"], "Fresh Australian milk.")
        self.assertEqual(product["ingredients"], "Australian cow's milk.")
        self.assertEqual(product["allergens"], {"contains": "Milk", "mayContain": "Soy"})
        self.assertEqual(product["dietary_claims"], ["Vegetarian"])
        self.assertEqual(product["country_of_origin"], "Made in Australia")
        self.assertEqual(product["storage_instructions"], "Keep refrigerated below 5C.")
        self.assertEqual(product["preparation_instructions"], "Shake well before serving.")
        self.assertEqual(len(product["additional_images"]), 2)
        self.assertEqual(product["nutrition"][0]["Name"], "Protein")
        self.assertIsNotNone(product["detail_refreshed_at"])
        self.assertIsNone(product["detail_error"])
        listed = self.bridge.woolworths_cached_products(10, 0)
        self.assertEqual(len(listed), 1)
        self.assertEqual(listed[0]["stockcode"], "123456")
        self.assertEqual(listed[0]["ingredients"], "Australian cow's milk.")
        self.assertEqual(listed[0]["allergens"], {"contains": "Milk", "mayContain": "Soy"})

    def test_collection_plan_is_seeded_and_reports_restart_safe_progress(self) -> None:
        self.bridge.seed_woolworths_category_collection()
        before = self.bridge.woolworths_collection_status()
        self.assertEqual(before["total"], len(self.bridge.WOOLWORTHS_COLLECTION_CATEGORIES))
        self.assertEqual(before["pending"], before["total"])

        category = self.bridge.WOOLWORTHS_COLLECTION_CATEGORIES[0]
        with self.bridge.catalogue_session() as connection:
            connection.execute("""
                UPDATE woolworths_category_collection
                SET state = 'running', attempts = 1, products_cached = 42
                WHERE category_path = ?
            """, (category,))

        # Recovery during a bridge restart releases unfinished work without
        # resetting successfully completed categories or their counters.
        self.bridge.recover_woolworths_category_collection()
        after = self.bridge.woolworths_collection_status()
        category_status = next(item for item in after["categories"] if item["category_path"] == category)
        self.assertEqual(category_status["state"], "pending")
        self.assertEqual(category_status["attempts"], 1)
        self.assertEqual(category_status["products_cached"], 42)

    def test_status_read_does_not_release_an_active_category(self) -> None:
        category = self.bridge.WOOLWORTHS_COLLECTION_CATEGORIES[0]
        self.bridge.seed_woolworths_category_collection()
        with self.bridge.catalogue_session() as connection:
            connection.execute(
                "UPDATE woolworths_category_collection SET state = 'running' WHERE category_path = ?",
                (category,),
            )

        status = self.bridge.woolworths_collection_status()
        category_status = next(item for item in status["categories"] if item["category_path"] == category)
        self.assertEqual(category_status["state"], "running")

    def test_collector_marks_a_completed_category_without_repeating_it(self) -> None:
        category = "/shop/browse/dairy-eggs-fridge/milk"
        self.bridge.WOOLWORTHS_COLLECTION_CATEGORIES = (category,)
        self.bridge.woolworths_browser = lambda: types.SimpleNamespace(browse=lambda _: {"subcategories": []})
        self.bridge.collect_woolworths_leaf = lambda _category, _payload: {
            "products": 7, "detailsEnriched": 7, "detailsFailed": 0, "detailError": None,
        }
        collector = self.bridge.WoolworthsCatalogueCollector()

        self.assertTrue(collector.start(None, False))
        assert collector._thread is not None
        collector._thread.join(timeout=2)
        self.assertFalse(collector._thread.is_alive())

        status = self.bridge.woolworths_collection_status()
        result = next(item for item in status["categories"] if item["category_path"] == category)
        self.assertEqual(result["state"], "completed")
        self.assertEqual(result["attempts"], 1)
        self.assertEqual(result["products_cached"], 7)

        # Starting a second non-retry run finds no pending work, so no product
        # is reacquired merely because the bridge remains alive.
        self.assertTrue(collector.start(None, False))
        assert collector._thread is not None
        collector._thread.join(timeout=2)
        self.assertEqual(next(item for item in self.bridge.woolworths_collection_status()["categories"] if item["category_path"] == category)["attempts"], 1)

    def test_collector_enqueues_discovered_descendant_categories(self) -> None:
        root = "/shop/browse/dairy-eggs-fridge"
        child = "/shop/browse/dairy-eggs-fridge/milk"
        self.bridge.WOOLWORTHS_COLLECTION_CATEGORIES = (root,)
        calls = []

        def browse(category: str) -> dict:
            calls.append(category)
            return {
                "subcategories": [child] if category == root else [],
            }

        self.bridge.woolworths_browser = lambda: types.SimpleNamespace(browse=browse)
        self.bridge.collect_woolworths_leaf = lambda _category, _payload: {
            "products": 3, "detailsEnriched": 3, "detailsFailed": 0, "detailError": None,
        }
        collector = self.bridge.WoolworthsCatalogueCollector()
        self.assertTrue(collector.start(None, False))
        assert collector._thread is not None
        collector._thread.join(timeout=2)

        self.assertEqual(calls, [root, child])
        states = {item["category_path"]: item["state"] for item in self.bridge.woolworths_collection_status()["categories"]}
        self.assertEqual(states, {root: "completed", child: "completed"})

    def test_revisit_completed_roots_does_not_reset_completed_descendants(self) -> None:
        root = "/shop/browse/dairy-eggs-fridge"
        child = "/shop/browse/dairy-eggs-fridge/milk"
        self.bridge.WOOLWORTHS_COLLECTION_CATEGORIES = (root,)
        self.bridge.enqueue_woolworths_collection_categories([root, child])
        with self.bridge.catalogue_session() as connection:
            connection.execute("UPDATE woolworths_category_collection SET state = 'completed'")

        collector = self.bridge.WoolworthsCatalogueCollector()
        self.bridge.woolworths_browser = lambda: types.SimpleNamespace(browse=lambda _: {"subcategories": []})
        self.bridge.collect_woolworths_leaf = lambda _category, _payload: {
            "products": 0, "detailsEnriched": 0, "detailsFailed": 0, "detailError": None,
        }
        self.assertTrue(collector.start(1, False, revisit_completed_roots=True))
        assert collector._thread is not None
        collector._thread.join(timeout=2)

        states = {item["category_path"]: item["state"] for item in self.bridge.woolworths_collection_status()["categories"]}
        self.assertEqual(states, {root: "completed", child: "completed"})
        attempts = {item["category_path"]: item["attempts"] for item in self.bridge.woolworths_collection_status()["categories"]}
        self.assertEqual(attempts[root], 1)
        self.assertEqual(attempts[child], 0)


if __name__ == "__main__":
    unittest.main()
