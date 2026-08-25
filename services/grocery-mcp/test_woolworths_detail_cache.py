import importlib.util
import json
import os
import sys
import tempfile
import types
import unittest
from pathlib import Path


class WoolworthsDetailCacheTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        os.environ["WOOLWORTHS_CATALOGUE_DB"] = str(Path(self.temporary.name) / "catalogue.sqlite3")
        os.environ["COLES_CATALOGUE_DB"] = str(Path(self.temporary.name) / "coles-catalogue.sqlite3")
        supermarkets = types.ModuleType("src.supermarkets")
        supermarkets.COLES_DEFAULT_STORE_ID = "520"
        supermarkets.coles_search_products = lambda **_: {"status": "success", "results": []}
        sys.modules["src"] = types.ModuleType("src")
        sys.modules["src.supermarkets"] = supermarkets
        playwright = types.ModuleType("playwright.sync_api")
        playwright.sync_playwright = lambda: None
        sys.modules["playwright"] = types.ModuleType("playwright")
        sys.modules["playwright.sync_api"] = playwright
        path = Path(__file__).with_name("bridge.py")
        spec = importlib.util.spec_from_file_location("food_grocery_bridge_test", path)
        assert spec and spec.loader
        self.bridge = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(self.bridge)

    def tearDown(self) -> None:
        self.temporary.cleanup()

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
        self.assertEqual(products[0]["category_paths"], ["Meat & Seafood"])

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
        self.bridge.refresh_woolworths_category = lambda _: {
            "category": category,
            "products": 7,
            "detailsEnriched": 7,
            "detailsFailed": 0,
            "detailError": None,
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

        def refresh(category: str) -> dict:
            calls.append(category)
            return {
                "category": category,
                "products": 3,
                "detailsEnriched": 3,
                "detailsFailed": 0,
                "detailError": None,
                "subcategories": [child] if category == root else [],
            }

        self.bridge.refresh_woolworths_category = refresh
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
        self.bridge.refresh_woolworths_category = lambda _: {
            "products": 0, "detailsEnriched": 0, "detailsFailed": 0,
            "detailError": None, "subcategories": [],
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
