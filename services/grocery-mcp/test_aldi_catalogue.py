import tempfile
import unittest
from pathlib import Path

import aldi_catalogue
from aldi_catalogue import cache_products, cached_products, category_path_ancestry, discover_department_categories, discover_leaf_categories, prune_stale_products


class AldiCatalogueTests(unittest.TestCase):
    def setUp(self):
        self.temporary_directory = tempfile.TemporaryDirectory()
        self.original_database = aldi_catalogue.ALDI_CATALOGUE_DB
        aldi_catalogue.ALDI_CATALOGUE_DB = str(Path(self.temporary_directory.name) / "aldi.sqlite")

    def tearDown(self):
        aldi_catalogue.ALDI_CATALOGUE_DB = self.original_database
        self.temporary_directory.cleanup()

    def test_preserves_complete_leaf_ancestry(self):
        path = "/products/meat-seafood/sausage/k/1111111147"
        self.assertEqual(category_path_ancestry(path), ["/products", "/products/meat-seafood", "/products/meat-seafood/sausage", path])

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

    def test_discovers_only_leaf_category_links_for_collection(self):
        document = '''
        <a href="/products/pantry/k/970000000">Pantry</a>
        <a href="/products/pantry/pasta-rice-grains/k/1111111179">Pasta, Rice & Grains</a>
        <a href="/products/pantry/sauces/k/1111111173">Sauces</a>
        <a href="/products/bakery/k/920000000">Bakery</a>
        '''
        self.assertEqual(discover_leaf_categories(document), [
            "/products/bakery/k/920000000",
            "/products/pantry/pasta-rice-grains/k/1111111179",
            "/products/pantry/sauces/k/1111111173",
        ])

    def test_accumulates_category_paths_within_same_refresh_generation(self):
        product = {
            "external_id": "shared", "name": "Shared product", "brand": None,
            "pack_size": None, "unit_price": None, "price": 1.0,
            "image_url": None, "product_url": "https://example.test/shared",
            "category_path": "/products/pantry/jams-spreads/k/1",
        }
        cache_products([{
            **product,
            "category_paths": category_path_ancestry(product["category_path"]),
        }], 100, "current-run")

        second_path = "/products/pantry/health-foods/k/2"
        cache_products([{
            **product,
            "category_path": second_path,
            "category_paths": category_path_ancestry(second_path),
        }], 101, "current-run")

        with aldi_catalogue.cache_session() as connection:
            row = connection.execute(
                "SELECT category_paths FROM aldi_products WHERE external_id = ?",
                ("shared",),
            ).fetchone()

        import json
        paths = json.loads(row[0])
        self.assertIn("/products/pantry/jams-spreads/k/1", paths)
        self.assertIn("/products/pantry/health-foods/k/2", paths)


    def test_does_not_carry_category_paths_between_refresh_generations(self):
        product = {
            "external_id": "shared", "name": "Shared product", "brand": None,
            "pack_size": None, "unit_price": None, "price": 1.0,
            "image_url": None, "product_url": "https://example.test/shared",
            "category_path": "/products/pantry/jams-spreads/k/1",
        }
        cache_products([{
            **product,
            "category_paths": category_path_ancestry(product["category_path"]),
        }], 100, "old-run")

        new_path = "/products/drinks/juices-cordials/k/2"
        cache_products([{
            **product,
            "category_path": new_path,
            "category_paths": category_path_ancestry(new_path),
        }], 200, "new-run")

        with aldi_catalogue.cache_session() as connection:
            row = connection.execute(
                "SELECT category_paths FROM aldi_products WHERE external_id = ?",
                ("shared",),
            ).fetchone()

        import json
        paths = json.loads(row[0])
        self.assertEqual(paths, category_path_ancestry(new_path))


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
