import unittest

from aldi_catalogue import discover_department_categories


class AldiCatalogueTests(unittest.TestCase):
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


if __name__ == "__main__":
    unittest.main()
