import tempfile
import unittest
from pathlib import Path

import drakes_catalogue
from drakes_catalogue import DrakesCatalogueSession, cache_products, discover_department_categories, parse_drakes_listing, prune_stale_products, sidebar_data_url, valid_store_id


class DrakesCatalogueTests(unittest.TestCase):
    def setUp(self):
        self.temporary_directory = tempfile.TemporaryDirectory()
        self.original_database = drakes_catalogue.DRAKES_CATALOGUE_DB
        drakes_catalogue.DRAKES_CATALOGUE_DB = str(Path(self.temporary_directory.name) / "drakes.sqlite")

    def tearDown(self):
        drakes_catalogue.DRAKES_CATALOGUE_DB = self.original_database
        self.temporary_directory.cleanup()

    def test_parses_selected_store_shelf_and_pagination(self):
        document = '''
        <a href="/lines/norco-full-cream-fresh-milk-2l"><img src="https://cdn.example/milk.jpg"></a>
        <span class="talker__product-name">Norco Full Cream Fresh Milk</span>
        <span class="talker__name__size">2L</span>
        <span class="talker__prices__comparison">$2.53 per L</span>
        <strong class="price__sell">$5.05</strong>
        <a href="/search?page=309&amp;sort_by=name">309</a>
        '''
        products, pages = parse_drakes_listing(document, "087")
        self.assertEqual(pages, 309)
        self.assertEqual(products, [{
            "store_id": "087", "external_id": "norco-full-cream-fresh-milk-2l",
            "name": "Norco Full Cream Fresh Milk", "brand": None, "pack_size": "2L",
            "unit_price": "$2.53 per L", "price": 5.05, "was_price": None,
            "image_url": "https://cdn.example/milk.jpg",
            "product_url": "https://087.drakes.com.au/lines/norco-full-cream-fresh-milk-2l",
            "category_path": "/search?sort_by=name",
        }])

    def test_preserves_department_path_and_discovers_only_departments(self):
        document = '''
        <a href="/category/fruit-vegetables"><span>Fruit &amp; Vegetables</span></a>
        <a href="/category/bread-bakery">Bread &amp; Bakery</a>
        <a href="/category/fresh-vegetables">Fresh Vegetables</a>
        <a href="/lines/carrot">Carrot</a>
        <a href="/lines/norco-full-cream-fresh-milk-2l"><img src="https://cdn.example/milk.jpg"></a>
        <span class="talker__product-name">Norco Full Cream Fresh Milk</span>
        <strong class="price__sell">$5.05</strong>
        '''
        self.assertEqual(discover_department_categories(document), ["/category/fruit-vegetables", "/category/bread-bakery"])
        products, _ = parse_drakes_listing(document, "087", "/category/bread-bakery")
        self.assertEqual(products[0]["category_path"], "/category/bread-bakery")

    def test_discovers_first_level_departments_from_sidebar_json(self):
        home = '<nav data-data-url="https://cdn.example/sidebar.json?group=1&amp;type=store">'
        sidebar = '''{"departments":[
          {"id":"all","name":"All Departments","parent_id":"","slug":"all"},
          {"id":"fruit","name":"Fruit & Vegetables","parent_id":"all","slug":"fruit-vegetables"},
          {"id":"bakery","name":"Bread & Bakery","parent_id":"all","slug":"bread-bakery"},
          {"id":"sub","name":"Fresh Fruit","parent_id":"fruit","slug":"fresh-fruit"}
        ]}'''
        self.assertEqual(sidebar_data_url(home), "https://cdn.example/sidebar.json?group=1&type=store")
        self.assertEqual(discover_department_categories(home, sidebar), [
            "/category/fruit-vegetables", "/category/bread-bakery",
        ])

    def test_refresh_departments_collects_sidebar_leaves_not_parents(self):
        home = '<nav data-data-url="https://cdn.example/sidebar.json?group=1&amp;type=store">'
        sidebar = '''{"departments":[
          {"id":"all","name":"All Departments","parent_id":"","slug":"all"},
          {"id":"fruit","name":"Fruit & Vegetables","parent_id":"all","slug":"fruit-vegetables"},
          {"id":"fresh","name":"Fresh Fruit","parent_id":"fruit","slug":"fresh-fruit"},
          {"id":"bakery","name":"Bread & Bakery","parent_id":"all","slug":"bread-bakery"}
        ]}'''
        seen = []

        def fetch(url):
            if url == "https://087.drakes.com.au/":
                return home
            if url.startswith("https://cdn.example/sidebar.json"):
                return sidebar
            seen.append(url)
            return ""

        session = DrakesCatalogueSession(fetch_page=fetch)
        session.refresh = lambda store, maximum, category, generation: {"category": category, "products": 0, "pages": 1, "truncated": False}  # type: ignore[method-assign]
        outcome = session.refresh_departments("087")
        self.assertEqual(outcome["categories"], ["/category/bread-bakery", "/category/fresh-fruit"])
        self.assertEqual(seen, [])

    def test_rejects_arbitrary_store_hosts(self):
        with self.assertRaises(ValueError):
            valid_store_id("087.example.com")

    def test_prunes_only_stale_products_for_selected_store(self):
        product = {
            "external_id": "old", "name": "Old product", "brand": None,
            "pack_size": None, "unit_price": None, "price": 1.0,
            "was_price": None, "image_url": None,
            "product_url": "https://087.drakes.com.au/lines/old",
            "category_path": "/category/pantry",
        }
        cache_products([{**product, "store_id": "087"}, {**product, "store_id": "088"}], 100, "old-run")
        cache_products([{**product, "store_id": "087", "external_id": "current", "name": "Current product"}], 200, "current-run")

        self.assertEqual(prune_stale_products("087", "current-run"), 1)
        with drakes_catalogue.cache_session() as connection:
            rows = connection.execute("SELECT store_id, external_id FROM drakes_products ORDER BY store_id, external_id").fetchall()
            self.assertEqual([tuple(row) for row in rows], [("087", "current"), ("088", "old")])


if __name__ == "__main__":
    unittest.main()
