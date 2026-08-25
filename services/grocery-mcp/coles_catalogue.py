"""Verified-browser Coles catalogue cache.

Coles serves browse and product data in the Next.js document for each public
page.  This module deliberately obtains that document through an already
accepted Chromium profile; it does not reproduce or work around browser
verification with raw API calls.
"""

from __future__ import annotations

import json
import os
import sqlite3
import threading
import time
from contextlib import contextmanager
from dataclasses import dataclass
from typing import Any, Callable
from urllib.parse import urlencode

from playwright.sync_api import sync_playwright


COLES_CATALOGUE_DB = os.getenv("COLES_CATALOGUE_DB", "/data/coles-catalogue.sqlite3")
COLES_CDP_URL = os.getenv("COLES_CDP_URL", os.getenv("WOOLWORTHS_CDP_URL", "")).strip()
COLES_PAGE_SIZE = 48
COLES_ROOT_CATEGORIES = (
    "/browse/meat-seafood", "/browse/fruit-vegetables", "/browse/dairy-eggs-fridge",
    "/browse/bakery", "/browse/deli", "/browse/pantry", "/browse/dietary-world-foods",
    "/browse/chips-chocolates-snacks", "/browse/drinks", "/browse/frozen",
    "/browse/cleaning-laundry", "/browse/health-beauty", "/browse/baby",
    "/browse/pet", "/browse/home-garden",
)


def text(value: object) -> str | None:
    return " ".join(value.split()).strip() or None if isinstance(value, str) else None


def identifier(value: object) -> str | None:
    if isinstance(value, bool) or value is None:
        return None
    if isinstance(value, (str, int, float)):
        return str(value).strip() or None
    return None


def number(value: object) -> float | None:
    if isinstance(value, bool):
        return None
    try:
        result = float(value)
    except (TypeError, ValueError):
        return None
    return result if result >= 0 else None


def json_value(value: object) -> str | None:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":")) if value not in (None, "", [], {}) else None


def parse_coles_browse_document(raw: str) -> dict[str, Any]:
    """Return the canonical SSR browse payload, or fail before caching anything."""
    try:
        document = json.loads(raw)
        result = document["props"]["pageProps"]["searchResults"]
    except (KeyError, TypeError, json.JSONDecodeError) as error:
        raise RuntimeError("Coles browse page did not expose its catalogue data") from error
    if not isinstance(result, dict) or not isinstance(result.get("results"), list):
        raise RuntimeError("Coles browse page returned an invalid catalogue result")
    return result


def coles_browser_verification_error(body_text: object) -> str | None:
    """Recognise Coles' visible browser-verification page before parsing it."""
    visible = text(body_text)
    if not visible:
        return None
    lower = visible.lower()
    if "pardon our interruption" in lower and "made us think you were a bot" in lower:
        return "Coles requires browser verification"
    return None


def image_url(value: object) -> str | None:
    if isinstance(value, str):
        return text(value)
    if isinstance(value, list):
        for candidate in value:
            found = image_url(candidate)
            if found:
                return found
    if isinstance(value, dict):
        for key in ("large", "medium", "thumbnail", "url", "src"):
            found = image_url(value.get(key))
            if found:
                return found
    return None


def hierarchy_paths(value: object, fallback: str) -> list[str]:
    if not isinstance(value, list):
        return [fallback]
    paths: list[str] = []
    for item in value:
        if isinstance(item, str) and item.startswith("/"):
            paths.append(item.rstrip("/"))
        elif isinstance(item, dict):
            path = text(item.get("path")) or text(item.get("url")) or text(item.get("slug"))
            if path and path.startswith("/"):
                paths.append(path.rstrip("/"))
            else:
                name = text(item.get("name")) or text(item.get("displayName"))
                if name:
                    paths.append(name)
    return list(dict.fromkeys(paths)) or [fallback]


def cache_connection() -> sqlite3.Connection:
    directory = os.path.dirname(COLES_CATALOGUE_DB)
    if directory:
        os.makedirs(directory, exist_ok=True)
    connection = sqlite3.connect(COLES_CATALOGUE_DB)
    connection.row_factory = sqlite3.Row
    connection.execute("""
        CREATE TABLE IF NOT EXISTS coles_products (
          external_id TEXT PRIMARY KEY, barcode TEXT, name TEXT NOT NULL, brand TEXT,
          description TEXT, long_description TEXT, pack_size TEXT, price REAL, was_price REAL,
          is_special INTEGER NOT NULL DEFAULT 0, in_stock INTEGER NOT NULL DEFAULT 1,
          image_url TEXT, category_path TEXT NOT NULL, category_paths TEXT NOT NULL,
          raw_hierarchy TEXT, refreshed_at INTEGER NOT NULL,
          detail_refreshed_at INTEGER, detail_error TEXT
        )
    """)
    connection.execute("CREATE INDEX IF NOT EXISTS coles_products_category ON coles_products(category_path, name)")
    connection.execute("""
        CREATE TABLE IF NOT EXISTS coles_category_collection (
          category_path TEXT PRIMARY KEY,
          state TEXT NOT NULL CHECK(state IN ('pending', 'running', 'completed', 'failed')),
          attempts INTEGER NOT NULL DEFAULT 0, products_cached INTEGER NOT NULL DEFAULT 0,
          last_started_at INTEGER, last_completed_at INTEGER, last_error TEXT
        )
    """)
    return connection


@contextmanager
def cache_session():
    connection = cache_connection()
    try:
        with connection:
            yield connection
    finally:
        connection.close()


def cache_page(category_path: str, result: dict[str, Any]) -> set[str]:
    now = int(time.time())
    cached: set[str] = set()
    with cache_session() as connection:
        for item in result["results"]:
            if not isinstance(item, dict):
                continue
            external_id = identifier(item.get("id"))
            name = text(item.get("name")) or text(item.get("description"))
            if not external_id or not name:
                continue
            pricing = item.get("pricing") if isinstance(item.get("pricing"), dict) else {}
            price = number(pricing.get("now"))
            was_price = number(pricing.get("was"))
            paths = hierarchy_paths(item.get("onlineHeirs"), category_path)
            connection.execute("""
                INSERT INTO coles_products (
                  external_id, barcode, name, brand, description, long_description, pack_size,
                  price, was_price, is_special, in_stock, image_url, category_path, category_paths,
                  raw_hierarchy, refreshed_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(external_id) DO UPDATE SET
                  name=excluded.name, brand=excluded.brand, description=excluded.description,
                  pack_size=excluded.pack_size, price=excluded.price, was_price=excluded.was_price,
                  is_special=excluded.is_special, in_stock=excluded.in_stock, image_url=excluded.image_url,
                  category_path=excluded.category_path, category_paths=excluded.category_paths,
                  raw_hierarchy=excluded.raw_hierarchy, refreshed_at=excluded.refreshed_at
            """, (
                external_id, identifier(item.get("gtin")), name, text(item.get("brand")),
                text(item.get("description")), text(item.get("longDescription")), text(item.get("size")),
                price, was_price, int(bool(pricing.get("promotion")) or (price is not None and was_price is not None and price < was_price)),
                int(item.get("availability") is not False and item.get("availabilityStatus") not in ("OUT_OF_STOCK", "Unavailable")),
                image_url(item.get("imageUris")), category_path, json.dumps(paths), json_value(item.get("onlineHeirs")), now,
            ))
            cached.add(external_id)
    return cached


@dataclass
class ColesBrowserSession:
    cdp_url: str = COLES_CDP_URL

    def browse(self, category_path: str, fetch_page: Callable[[str], str] | None = None) -> int:
        if not category_path.startswith("/browse/"):
            raise ValueError("category must be a /browse/ path")
        if fetch_page is None and not self.cdp_url:
            raise RuntimeError("verified browser session is not configured; set COLES_CDP_URL")

        def read(url: str) -> str:
            if fetch_page:
                return fetch_page(url)
            with sync_playwright() as playwright:
                browser = playwright.chromium.connect_over_cdp(self.cdp_url)
                try:
                    context = browser.contexts[0]
                    page = context.new_page()
                    try:
                        page.goto(url, wait_until="domcontentloaded", timeout=45_000)
                        verification_error = coles_browser_verification_error(
                            page.locator("body").inner_text(timeout=5_000)
                        )
                        if verification_error:
                            raise RuntimeError(verification_error)
                        return page.locator("#__NEXT_DATA__").text_content(timeout=15_000)
                    finally:
                        page.close()
                finally:
                    browser.close()

        cached_ids: set[str] = set()
        offset = 0
        page_number = 1
        while True:
            query = urlencode({"sortBy": "recommendedDescending", "start": offset, "page": page_number})
            result = parse_coles_browse_document(read(f"https://www.coles.com.au{category_path}?{query}"))
            cached_ids.update(cache_page(category_path, result))
            total = int(result.get("noOfResults") or 0)
            page_size = int(result.get("pageSize") or COLES_PAGE_SIZE)
            offset += page_size
            page_number += 1
            if not result["results"] or offset >= total:
                return len(cached_ids)


def seed_collection() -> None:
    with cache_session() as connection:
        connection.executemany(
            "INSERT INTO coles_category_collection (category_path, state) VALUES (?, 'pending') ON CONFLICT(category_path) DO NOTHING",
            [(path,) for path in COLES_ROOT_CATEGORIES],
        )


def status() -> dict[str, Any]:
    seed_collection()
    with cache_session() as connection:
        summary = connection.execute("""
            SELECT COUNT(*) total, COUNT(*) FILTER (WHERE state='pending') pending,
                   COUNT(*) FILTER (WHERE state='running') running,
                   COUNT(*) FILTER (WHERE state='completed') completed,
                   COUNT(*) FILTER (WHERE state='failed') failed
            FROM coles_category_collection
        """).fetchone()
        product_summary = connection.execute("SELECT COUNT(*) products, MAX(refreshed_at) refreshed_at FROM coles_products").fetchone()
    return {**dict(summary), "products": product_summary["products"], "lastRefreshedAt": product_summary["refreshed_at"], "acquisitionMode": "verified-browser" if COLES_CDP_URL else "unconfigured"}


def cached_products(limit: int, offset: int) -> list[dict[str, Any]]:
    with cache_session() as connection:
        rows = connection.execute(
            "SELECT * FROM coles_products ORDER BY category_path, name COLLATE NOCASE, external_id LIMIT ? OFFSET ?",
            (limit, offset),
        ).fetchall()
    products: list[dict[str, Any]] = []
    for row in rows:
        product = dict(row)
        for field in ("category_paths", "raw_hierarchy"):
            try:
                product[field] = json.loads(product[field]) if product[field] else None
            except json.JSONDecodeError:
                product[field] = None
        products.append(product)
    return products
