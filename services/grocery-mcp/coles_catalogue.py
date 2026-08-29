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
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from playwright.sync_api import sync_playwright


COLES_CATALOGUE_DB = os.getenv("COLES_CATALOGUE_DB", "/data/coles-catalogue.sqlite3")
COLES_CDP_URL = os.getenv("COLES_CDP_URL", os.getenv("WOOLWORTHS_CDP_URL", "")).strip()
# The human-verifiable Firefox sidecar owns Coles' persistent session. Chromium
# remains an explicit opt-in for installations that provide their own CDP URL.
COLES_BROWSER_ENGINE = os.getenv("COLES_BROWSER_ENGINE", "firefox").strip().lower()
COLES_FIREFOX_FETCH_URL = os.getenv("COLES_FIREFOX_FETCH_URL", "").strip()
COLES_API_BASE_URL = os.getenv(
    "COLES_API_BASE_URL", "https://apigw.coles.com.au/digital/colesappbff"
).rstrip("/")
COLES_LEGACY_CATEGORY_API_URL = os.getenv(
    "COLES_LEGACY_CATEGORY_API_URL", "https://www.coles.com.au/api/bff/products/categories"
).strip()
COLES_API_KEY = os.getenv("COLES_API_KEY", "").strip()
COLES_STORE_ID = os.getenv("COLES_STORE_ID", "").strip()
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


def coles_category_api() -> dict[str, Any]:
    """Read Coles' configured category endpoint without touching the browser cache.

    This is intentionally a narrow, read-only probe of the same API gateway
    already configured for product search.  It does not borrow browser cookies,
    replay a verification response, or attempt to emulate a browser session.
    """
    if not COLES_API_KEY:
        raise RuntimeError("Coles category API is not configured; set COLES_API_KEY")
    if not COLES_STORE_ID:
        raise RuntimeError("Coles category API is not configured; set COLES_STORE_ID")

    query = urlencode({"storeId": COLES_STORE_ID})
    request = Request(
        f"{COLES_API_BASE_URL}/v2/products/category?{query}",
        headers={
            "Accept": "application/json",
            "Ocp-Apim-Subscription-Key": COLES_API_KEY,
        },
    )
    try:
        with urlopen(request, timeout=30) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except HTTPError as error:
        raise RuntimeError(f"Coles category API returned HTTP {error.code}") from error
    except (URLError, UnicodeDecodeError, json.JSONDecodeError) as error:
        raise RuntimeError("Coles category API did not return valid JSON") from error
    if not isinstance(payload, dict):
        raise RuntimeError("Coles category API returned an invalid response")
    return payload


def coles_legacy_category_api(category_id: str | None = None) -> dict[str, Any]:
    """Read the legacy public category route using the configured server key.

    The subscription key stays in-process and is never included in the bridge
    response.  This is a read-only compatibility probe; it does not replace the
    verified-browser collector unless Coles returns a usable, authorised result.
    """
    if not COLES_API_KEY:
        raise RuntimeError("Coles legacy category API is not configured; set COLES_API_KEY")
    if not COLES_STORE_ID:
        raise RuntimeError("Coles legacy category API is not configured; set COLES_STORE_ID")

    query: dict[str, str] = {
        "storeId": COLES_STORE_ID,
        "subscription-key": COLES_API_KEY,
    }
    if category_id:
        query["id"] = category_id
    request = Request(
        f"{COLES_LEGACY_CATEGORY_API_URL}?{urlencode(query)}",
        headers={"Accept": "application/json"},
    )
    try:
        with urlopen(request, timeout=30) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except HTTPError as error:
        raise RuntimeError(f"Coles legacy category API returned HTTP {error.code}") from error
    except (URLError, UnicodeDecodeError, json.JSONDecodeError) as error:
        raise RuntimeError("Coles legacy category API did not return valid JSON") from error
    if not isinstance(payload, dict):
        raise RuntimeError("Coles legacy category API returned an invalid response")
    return payload


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
    browser_engine: str = COLES_BROWSER_ENGINE
    firefox_fetch_url: str = COLES_FIREFOX_FETCH_URL

    def browse(self, category_path: str, fetch_page: Callable[[str], str] | None = None) -> int:
        if not category_path.startswith("/browse/"):
            raise ValueError("category must be a /browse/ path")
        if self.browser_engine not in ("chromium-cdp", "firefox"):
            raise RuntimeError("unsupported Coles browser engine; use chromium-cdp or firefox")
        if fetch_page is None and self.browser_engine == "chromium-cdp" and not self.cdp_url:
            raise RuntimeError("verified browser session is not configured; set COLES_CDP_URL")

        def read_page(context: Any, url: str) -> str:
            page = context.new_page()
            try:
                page.goto(url, wait_until="domcontentloaded", timeout=45_000)
                verification_error = coles_browser_verification_error(
                    page.locator("body").inner_text(timeout=5_000)
                )
                if verification_error:
                    raise RuntimeError(verification_error)
                payload = page.locator("#__NEXT_DATA__").text_content(timeout=15_000)
                if not payload:
                    raise RuntimeError("Coles browse page did not expose its catalogue data")
                return payload
            finally:
                page.close()

        def collect(read: Callable[[str], str]) -> int:
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

        if fetch_page:
            return collect(fetch_page)

        if self.browser_engine == "firefox":
            if not self.firefox_fetch_url:
                raise RuntimeError("Firefox browser session is not configured; set COLES_FIREFOX_FETCH_URL")

            def read_firefox(url: str) -> str:
                request_url = f"{self.firefox_fetch_url}?{urlencode({'url': url})}"
                try:
                    with urlopen(request_url, timeout=90) as response:
                        payload = json.loads(response.read())
                except HTTPError as error:
                    try:
                        detail = json.loads(error.read())
                    except (json.JSONDecodeError, UnicodeDecodeError):
                        detail = {}
                    message = detail.get("error") if isinstance(detail, dict) else None
                    raise RuntimeError(message or f"Firefox browser session returned HTTP {error.code}") from error
                except URLError as error:
                    raise RuntimeError(f"Firefox browser session is unavailable: {error.reason}") from error
                except (json.JSONDecodeError, UnicodeDecodeError) as error:
                    raise RuntimeError("Firefox browser session returned an invalid response") from error
                if payload.get("status") != "success":
                    raise RuntimeError(payload.get("error") or "Firefox browser session did not return catalogue data")
                next_data = payload.get("nextData")
                if not isinstance(next_data, str) or not next_data:
                    raise RuntimeError("Firefox browser session did not return catalogue data")
                return next_data

            return collect(read_firefox)

        with sync_playwright() as playwright:
            browser = playwright.chromium.connect_over_cdp(self.cdp_url)
            try:
                context = browser.contexts[0]
                return collect(lambda url: read_page(context, url))
            finally:
                browser.close()


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
    configured = bool(COLES_FIREFOX_FETCH_URL) if COLES_BROWSER_ENGINE == "firefox" else bool(COLES_CDP_URL)
    mode = "verified-firefox" if COLES_BROWSER_ENGINE == "firefox" else "verified-browser"
    return {**dict(summary), "products": product_summary["products"], "lastRefreshedAt": product_summary["refreshed_at"], "acquisitionMode": mode if configured else "unconfigured"}


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
