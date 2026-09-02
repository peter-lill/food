"""Selected-store Drakes catalogue cache.

Drakes publishes server-rendered, store-specific Myfoodlink catalogues.  This
module retrieves the public pagination politely and keeps every cache record
scoped to the store hostname that supplied its price.
"""

from __future__ import annotations

import html
import os
import re
import sqlite3
import time
from contextlib import contextmanager
from dataclasses import dataclass
from typing import Callable
from urllib.request import Request, urlopen


DRAKES_CATALOGUE_DB = os.getenv("DRAKES_CATALOGUE_DB", "/data/drakes-catalogue.sqlite3")
DRAKES_PAGE_LIMIT = 500


def clean(value: str | None) -> str | None:
    if not value:
        return None
    value = re.sub(r"<[^>]+>", " ", html.unescape(value))
    return " ".join(value.split()) or None


def price(value: str | None) -> float | None:
    if not value:
        return None
    match = re.search(r"\$\s*(\d+(?:\.\d{1,2})?)", html.unescape(value))
    return float(match.group(1)) if match else None


def valid_store_id(value: str) -> str:
    store = value.strip().lower()
    if not re.fullmatch(r"[a-z0-9-]{1,64}", store):
        raise ValueError("store must be a Drakes catalogue hostname, for example 087")
    return store


def parse_drakes_listing(document: str, store_id: str, category_path: str = "/search?sort_by=name") -> tuple[list[dict], int]:
    products: list[dict] = []
    pattern = re.compile(
        r'<a href="(?P<href>/lines/[^"]+)">(?P<image>.*?)</a>.*?'
        r'talker__product-name">(?P<name>.*?)</span>(?P<details>.*?)'
        r'<strong class="price__sell"[^>]*>(?P<price>.*?)</strong>',
        re.S,
    )
    for match in pattern.finditer(document):
        external_id = match.group("href").rsplit("/", 1)[-1]
        name = clean(match.group("name"))
        product_price = price(clean(match.group("price")))
        if not external_id or not name or product_price is None:
            continue
        size = re.search(r'talker__name__size">(.*?)</span>', match.group("details"), re.S)
        image = re.findall(r'<img[^>]+src="([^"]+)"', match.group("image"), re.I)
        products.append({
            "store_id": store_id,
            "external_id": external_id,
            "name": name,
            "brand": None,
            "pack_size": clean(size.group(1)) if size else None,
            "unit_price": clean((re.findall(r'talker__prices__comparison[^>]*>(.*?)</span>', match.group("details"), re.S) or [None])[-1]),
            "price": product_price,
            # The alphabetical shelf exposes the current price reliably, but
            # specials markup is not consistently contained within a product
            # card.  Do not borrow a previous card's was-price.
            "was_price": None,
            "image_url": html.unescape(image[-1]) if image else None,
            "product_url": f"https://{store_id}.drakes.com.au{html.unescape(match.group('href'))}",
            "category_path": category_path,
        })
    pages = [int(value) for value in re.findall(r'[?&]page=(\d+)', document)]
    return products, max(pages, default=1)


_DRAKES_DEPARTMENT_NAMES = {
    "fruit vegetables", "bread bakery", "meat", "deli seafood",
    "ready to eat meals", "dairy", "freezer", "pantry", "drinks", "beer",
    "confectionery snacks", "baby", "health beauty", "household cleaning needs",
    "petcare", "general merchandise",
}


def discover_department_categories(document: str) -> list[str]:
    """Return the store's first-level, public department category paths.

    The home page also links to individual products and promotional shelves.
    Only retain links whose visible label is one of the department menu labels;
    this avoids assigning a product to a feature collection or search page.
    """
    paths: list[str] = []
    for match in re.finditer(r'<a\s+[^>]*href="(?P<href>/category/[^"?#]+)[^"]*"[^>]*>(?P<label>.*?)</a>', document, re.I | re.S):
        label = clean(match.group("label"))
        if not label:
            continue
        normalised = re.sub(r"[^a-z0-9]+", " ", label.casefold()).strip()
        path = html.unescape(match.group("href"))
        if normalised in _DRAKES_DEPARTMENT_NAMES and path not in paths:
            paths.append(path)
    return paths


def cache_connection() -> sqlite3.Connection:
    directory = os.path.dirname(DRAKES_CATALOGUE_DB)
    if directory:
        os.makedirs(directory, exist_ok=True)
    connection = sqlite3.connect(DRAKES_CATALOGUE_DB)
    connection.row_factory = sqlite3.Row
    connection.execute("""
        CREATE TABLE IF NOT EXISTS drakes_products (
          store_id TEXT NOT NULL, external_id TEXT NOT NULL, name TEXT NOT NULL,
          brand TEXT, pack_size TEXT, unit_price TEXT, price REAL NOT NULL,
          was_price REAL, image_url TEXT, product_url TEXT NOT NULL,
          category_path TEXT NOT NULL, refreshed_at INTEGER NOT NULL,
          PRIMARY KEY (store_id, external_id)
        )
    """)
    connection.execute("CREATE INDEX IF NOT EXISTS drakes_products_store_name ON drakes_products(store_id, name)")
    return connection


@contextmanager
def cache_session():
    connection = cache_connection()
    try:
        with connection:
            yield connection
    finally:
        connection.close()


def cache_products(products: list[dict]) -> int:
    now = int(time.time())
    with cache_session() as connection:
        for product in products:
            connection.execute("""
                INSERT INTO drakes_products (
                  store_id, external_id, name, brand, pack_size, unit_price, price,
                  was_price, image_url, product_url, category_path, refreshed_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(store_id, external_id) DO UPDATE SET
                  name=excluded.name, brand=excluded.brand, pack_size=excluded.pack_size,
                  unit_price=excluded.unit_price, price=excluded.price, was_price=excluded.was_price,
                  image_url=excluded.image_url, product_url=excluded.product_url,
                  category_path=excluded.category_path, refreshed_at=excluded.refreshed_at
            """, tuple(product[key] for key in (
                "store_id", "external_id", "name", "brand", "pack_size", "unit_price",
                "price", "was_price", "image_url", "product_url", "category_path",
            )) + (now,))
    return len(products)


@dataclass
class DrakesCatalogueSession:
    fetch_page: Callable[[str], str] | None = None

    def read(self, url: str) -> str:
        if self.fetch_page:
            return self.fetch_page(url)
        request = Request(url, headers={"Accept": "text/html", "User-Agent": "Food catalogue indexer/1.0 (+https://github.com/peter-lill/food)"})
        with urlopen(request, timeout=30) as response:
            return response.read().decode("utf-8", errors="replace")

    def refresh(self, store_id: str, max_pages: int | None = None, category_path: str | None = None) -> dict:
        store = valid_store_id(store_id)
        if category_path and not re.fullmatch(r"/category/[a-z0-9-]+", category_path):
            raise ValueError("category must be a public Drakes /category/<slug> path")
        maximum = max_pages or DRAKES_PAGE_LIMIT
        all_products: list[dict] = []
        page = 1
        total_pages = 1
        while page <= total_pages and page <= maximum:
            base_path = category_path or "/search"
            suffix = "?sort_by=name" if page == 1 else f"?page={page}&sort_by=name"
            products, total_pages = parse_drakes_listing(
                self.read(f"https://{store}.drakes.com.au{base_path}{suffix}"), store,
                category_path or "/search?sort_by=name",
            )
            all_products.extend(products)
            page += 1
        return {"storeId": store, "category": category_path, "products": cache_products(all_products), "pages": min(total_pages, maximum), "truncated": total_pages > maximum}

    def department_categories(self, store_id: str) -> list[str]:
        store = valid_store_id(store_id)
        return discover_department_categories(self.read(f"https://{store}.drakes.com.au/"))

    def refresh_departments(self, store_id: str, max_pages: int | None = None) -> dict:
        store = valid_store_id(store_id)
        categories = self.department_categories(store)
        if not categories:
            raise RuntimeError("Drakes home page did not expose department category links")
        outcomes = [self.refresh(store, max_pages, category) for category in categories]
        return {
            "storeId": store,
            "categories": categories,
            "products": sum(outcome["products"] for outcome in outcomes),
            "pages": sum(outcome["pages"] for outcome in outcomes),
            "truncatedCategories": [outcome["category"] for outcome in outcomes if outcome["truncated"]],
        }


def status(store_id: str | None = None) -> dict:
    with cache_session() as connection:
        if store_id:
            row = connection.execute("SELECT COUNT(*) products, MAX(refreshed_at) refreshed_at FROM drakes_products WHERE store_id = ?", (valid_store_id(store_id),)).fetchone()
            return {**dict(row), "storeId": store_id, "lastRefreshedAt": row["refreshed_at"], "acquisitionMode": "selected-store-public-catalogue"}
        row = connection.execute("SELECT COUNT(*) products, COUNT(DISTINCT store_id) stores, MAX(refreshed_at) refreshed_at FROM drakes_products").fetchone()
    return {**dict(row), "lastRefreshedAt": row["refreshed_at"], "acquisitionMode": "selected-store-public-catalogue"}


def cached_products(store_id: str, limit: int, offset: int) -> list[dict]:
    with cache_session() as connection:
        rows = connection.execute("SELECT * FROM drakes_products WHERE store_id = ? ORDER BY name COLLATE NOCASE, external_id LIMIT ? OFFSET ?", (valid_store_id(store_id), limit, offset)).fetchall()
    return [dict(row) for row in rows]
