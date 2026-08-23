import importlib.util
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

        # Seeding after a bridge restart releases unfinished work without
        # resetting successfully completed categories or their counters.
        self.bridge.seed_woolworths_category_collection()
        after = self.bridge.woolworths_collection_status()
        category_status = next(item for item in after["categories"] if item["category_path"] == category)
        self.assertEqual(category_status["state"], "pending")
        self.assertEqual(category_status["attempts"], 1)
        self.assertEqual(category_status["products_cached"], 42)

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


if __name__ == "__main__":
    unittest.main()
