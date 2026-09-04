"""Public ALDI Australia catalogue cache.

ALDI publishes its everyday, Limited Time Only and Special Buys catalogue at
``aldi.com.au/products``.  This client consumes those rendered public pages
politely and stores a local, restart-safe snapshot.  It does not require an
account, browser profile, store session, or undocumented endpoint.
"""

from __future__ import annotations

import html
import json
import os
import re
import sqlite3
import time
import uuid
from contextlib import contextmanager
from dataclasses import dataclass
from typing import Callable
from urllib.parse import urljoin
from urllib.request import Request, urlopen


ALDI_CATALOGUE_DB = os.getenv("ALDI_CATALOGUE_DB", "/data/aldi-catalogue.sqlite3")
ALDI_PRODUCTS_URL = "https://www.aldi.com.au/products"
ALDI_PAGE_LIMIT = 250

_ALDI_DEPARTMENT_NAMES = {
    "fruits vegetables", "meat seafood", "deli chilled meats", "dairy eggs fridge",
    "pantry", "bakery", "freezer", "drinks", "health beauty", "baby",
    "cleaning household", "pets", "liquor", "snacks confectionery",
}


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


def aldi_product_url(path: str) -> str:
    return urljoin("https://www.aldi.com.au", html.unescape(path))


def parse_aldi_listing(document: str, category_path: str) -> tuple[list[dict], int]:
    """Parse ALDI's server-rendered product tiles and the final page number."""
    products: list[dict] = []
    tile_starts = list(re.finditer(r'<div id="product-tile-([^"]+)"', document))
    for index, start in enumerate(tile_starts):
        segment = document[start.start():tile_starts[index + 1].start() if index + 1 < len(tile_starts) else len(document)]
        link = re.search(r'<a href="([^"]+)"[^>]*class="[^"]*product-tile__link', segment)
        name = re.search(r'product-tile__name"[^>]*>\s*<p[^>]*>(.*?)</p>', segment, re.DOTALL)
        if not link or not name:
            continue
        brand = re.search(r'product-tile__brandname"[^>]*>\s*<p[^>]*>(.*?)</p>', segment, re.DOTALL)
        unit = re.search(r'product-tile__unit-of-measurement"[^>]*>\s*<p[^>]*>(.*?)</p>', segment, re.DOTALL)
        comparison = re.search(r'product-tile__comparison-price"[^>]*>\s*<p[^>]*>(.*?)</p>', segment, re.DOTALL)
        cost = re.search(r'data-test="product-tile__price".*?<span>\s*(\$[^<]+)\s*</span>', segment, re.DOTALL)
        image = re.search(r'<img[^>]+class="[^"]*base-image[^"]*"[^>]+src="([^"]+)"', segment)
        external_id = start.group(1).lstrip("0") or "0"
        name_text = clean(name.group(1))
        product_price = price(cost.group(1) if cost else None)
        if not name_text or product_price is None:
            continue
        products.append({
            "external_id": external_id,
            "name": name_text,
            "brand": clean(brand.group(1)) if brand else None,
            "pack_size": clean(unit.group(1)) if unit else None,
            "unit_price": clean(comparison.group(1)) if comparison else None,
            "price": product_price,
            "image_url": html.unescape(image.group(1)) if image else None,
            "product_url": aldi_product_url(link.group(1)),
            "category_path": category_path,
        })
    pages = [int(value) for value in re.findall(r'[?&]page=(\d+)', document)]
    return products, max(pages, default=1)


def discover_department_categories(document: str) -> list[str]:
    """Extract first-level department links from ALDI's public category menu."""
    paths: list[str] = []
    for match in re.finditer(r'<a\s+[^>]*href="(?P<href>/products/[^"?#]+/k/\d+)[^"]*"[^>]*>(?P<label>.*?)</a>', document, re.I | re.S):
        label = clean(match.group("label"))
        if not label:
            continue
        normalised = re.sub(r"[^a-z0-9]+", " ", label.casefold()).strip()
        path = html.unescape(match.group("href"))
        if normalised in _ALDI_DEPARTMENT_NAMES and path not in paths:
            paths.append(path)
    return paths


def cache_connection() -> sqlite3.Connection:
    directory = os.path.dirname(ALDI_CATALOGUE_DB)
    if directory:
        os.makedirs(directory, exist_ok=True)
    connection = sqlite3.connect(ALDI_CATALOGUE_DB)
    connection.row_factory = sqlite3.Row
    connection.execute("""
        CREATE TABLE IF NOT EXISTS aldi_products (
          external_id TEXT PRIMARY KEY, name TEXT NOT NULL, brand TEXT, pack_size TEXT,
          unit_price TEXT, price REAL NOT NULL, image_url TEXT, product_url TEXT NOT NULL,
          category_path TEXT NOT NULL, refreshed_at INTEGER NOT NULL,
          refresh_generation TEXT
        )
    """)
    columns = {row["name"] for row in connection.execute("PRAGMA table_info(aldi_products)")}
    if "refresh_generation" not in columns:
        connection.execute("ALTER TABLE aldi_products ADD COLUMN refresh_generation TEXT")
    connection.execute("CREATE INDEX IF NOT EXISTS aldi_products_category ON aldi_products(category_path, name)")
    return connection


@contextmanager
def cache_session():
    connection = cache_connection()
    try:
        with connection:
            yield connection
    finally:
        connection.close()


def cache_products(products: list[dict], refreshed_at: int | None = None, refresh_generation: str | None = None) -> int:
    now = refreshed_at if refreshed_at is not None else int(time.time())
    with cache_session() as connection:
        for product in products:
            connection.execute("""
                INSERT INTO aldi_products (
                  external_id, name, brand, pack_size, unit_price, price, image_url,
                  product_url, category_path, refreshed_at, refresh_generation
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(external_id) DO UPDATE SET
                  name=excluded.name, brand=excluded.brand, pack_size=excluded.pack_size,
                  unit_price=excluded.unit_price, price=excluded.price, image_url=excluded.image_url,
                  product_url=excluded.product_url, category_path=excluded.category_path,
                  refreshed_at=excluded.refreshed_at,
                  refresh_generation=excluded.refresh_generation
            """, (
                product["external_id"], product["name"], product["brand"], product["pack_size"],
                product["unit_price"], product["price"], product["image_url"], product["product_url"],
                product["category_path"], now, refresh_generation,
            ))
    return len(products)


def prune_stale_products(refresh_generation: str) -> int:
    with cache_session() as connection:
        cursor = connection.execute(
            "DELETE FROM aldi_products WHERE refresh_generation IS NULL OR refresh_generation != ?",
            (refresh_generation,),
        )
        return cursor.rowcount


@dataclass
class AldiCatalogueSession:
    fetch_page: Callable[[str], str] | None = None

    def read(self, url: str) -> str:
        if self.fetch_page:
            return self.fetch_page(url)
        request = Request(url, headers={"Accept": "text/html", "User-Agent": "Food catalogue indexer/1.0 (+https://github.com/peter-lill/food)"})
        with urlopen(request, timeout=30) as response:
            return response.read().decode("utf-8", errors="replace")

    def refresh(self, category_path: str = "/products", max_pages: int | None = None, refresh_generation: str | None = None) -> dict:
        if not category_path.startswith("/products"):
            raise ValueError("category must be an ALDI /products path")
        maximum = max_pages or ALDI_PAGE_LIMIT
        all_products: list[dict] = []
        page = 1
        total_pages = 1
        while page <= total_pages and page <= maximum:
            suffix = "" if page == 1 else f"?page={page}"
            products, total_pages = parse_aldi_listing(self.read(f"https://www.aldi.com.au{category_path}{suffix}"), category_path)
            all_products.extend(products)
            page += 1
        return {"category": category_path, "products": cache_products(all_products, refresh_generation=refresh_generation), "pages": min(total_pages, maximum), "truncated": total_pages > maximum}

    def department_categories(self) -> list[str]:
        return discover_department_categories(self.read(ALDI_PRODUCTS_URL))

    def refresh_departments(self, max_pages: int | None = None) -> dict:
        categories = self.department_categories()
        if not categories:
            raise RuntimeError("ALDI products page did not expose department category links")
        refresh_generation = uuid.uuid4().hex
        outcomes = []
        for category in categories:
            outcomes.append(self.refresh(category, max_pages, refresh_generation))
        truncated = [outcome["category"] for outcome in outcomes if outcome["truncated"]]
        retired = 0 if truncated else prune_stale_products(refresh_generation)
        return {
            "categories": categories,
            "products": sum(outcome["products"] for outcome in outcomes),
            "pages": sum(outcome["pages"] for outcome in outcomes),
            "truncatedCategories": truncated,
            "retiredProducts": retired,
        }


def status() -> dict:
    with cache_session() as connection:
        row = connection.execute("SELECT COUNT(*) products, COUNT(DISTINCT category_path) categories, MAX(refreshed_at) refreshed_at FROM aldi_products").fetchone()
    return {**dict(row), "lastRefreshedAt": row["refreshed_at"], "acquisitionMode": "public-catalogue"}


def cached_products(limit: int, offset: int) -> list[dict]:
    with cache_session() as connection:
        rows = connection.execute("SELECT * FROM aldi_products ORDER BY category_path, name COLLATE NOCASE, external_id LIMIT ? OFFSET ?", (limit, offset)).fetchall()
    return [dict(row) for row in rows]


def search_cached_products(query: str, limit: int) -> list[dict]:
    """Search the local public-catalogue snapshot without reacquiring ALDI pages."""
    words = [word for word in re.findall(r"[a-z0-9]+", query.casefold()) if len(word) > 1]
    if not words:
        return []
    clauses = " AND ".join("LOWER(name || ' ' || COALESCE(brand, '')) LIKE ?" for _ in words)
    parameters = [f"%{word}%" for word in words] + [limit]
    with cache_session() as connection:
        rows = connection.execute(
            f"SELECT * FROM aldi_products WHERE {clauses} ORDER BY refreshed_at DESC, name COLLATE NOCASE LIMIT ?",
            parameters,
        ).fetchall()
    return [dict(row) for row in rows]
