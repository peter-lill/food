import unittest

from drakes_catalogue import parse_drakes_listing, valid_store_id


class DrakesCatalogueTests(unittest.TestCase):
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

    def test_rejects_arbitrary_store_hosts(self):
        with self.assertRaises(ValueError):
            valid_store_id("087.example.com")


if __name__ == "__main__":
    unittest.main()
