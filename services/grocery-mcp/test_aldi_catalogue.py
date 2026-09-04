import tempfile
import unittest
from pathlib import Path

import aldi_catalogue
from aldi_catalogue import cache_products, discover_department_categories, prune_stale_products


class AldiCatalogueTests(unittest.TestCase):
    def setUp(self):
        self.temporary_directory = tempfile.TemporaryDirectory()
        self.original_database = aldi_catalogue.ALDI_CATALOGUE_DB
        aldi_catalogue.ALDI_CATALOGUE_DB = str(Path(self.temporary_directory.name) / "aldi.sqlite")

    def tearDown(self):
        aldi_catalogue.ALDI_CATALOGUE_DB = self.original_database
        self.temporary_directory.cleanup()

    def test_discovers_only_top_level_department_links(self):
        document = '''
        <a href="/products/fruits-vegetables/k/950000000"><span>Fruits &amp; Vegetables</span></a>
        <a href="/products/dairy-eggs-fridge/k/960000000">Dairy, Eggs &amp; Fridge</a>
        <a href="/products/apples/k/950001000">Apples</a>
        <a href="/products/example/p/123">Example product</a>
        '''
        self.assertEqual(discover_department_categories(document), [
            "/products/fruits-vegetables/k/950000000",
            "/products/dairy-eggs-fridge/k/960000000",
        ])

    def test_prunes_products_not_seen_in_latest_complete_refresh(self):
        product = {
            "external_id": "old", "name": "Old product", "brand": None,
            "pack_size": None, "unit_price": None, "price": 1.0,
            "image_url": None, "product_url": "https://example.test/old",
            "category_path": "/products/pantry/k/1",
        }
        cache_products([product], 100, "old-run")
        cache_products([{**product, "external_id": "current", "name": "Current product"}], 200, "current-run")

        self.assertEqual(prune_stale_products("current-run"), 1)
        with aldi_catalogue.cache_session() as connection:
            self.assertEqual(connection.execute("SELECT external_id FROM aldi_products").fetchall()[0][0], "current")


if __name__ == "__main__":
    unittest.main()
