"""Verified-browser Coles catalogue cache.

Coles serves browse and product data in the Next.js document for each public
page.  This module deliberately obtains that document through an already
accepted Chromium profile; it does not reproduce or work around browser
verification with raw API calls.
"""

from __future__ import annotations

import json
import os
import re
import sqlite3
import threading
import time
from collections import deque
from contextlib import contextmanager
from dataclasses import dataclass
from typing import Any, Callable
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode, urlparse
from urllib.request import Request, urlopen

from playwright.sync_api import sync_playwright
from retailer_taxonomy import coles_browse_paths, deepest_paths


COLES_CATALOGUE_DB = os.getenv("COLES_CATALOGUE_DB", "/data/coles-catalogue.sqlite3")
COLES_CDP_URL = os.getenv("COLES_CDP_URL", os.getenv("WOOLWORTHS_CDP_URL", "")).strip()
# The human-verifiable undetected-Chrome sidecar owns Coles' persistent session.
# Chromium CDP and the former Firefox engine remain compatibility modes.
COLES_BROWSER_ENGINE = os.getenv("COLES_BROWSER_ENGINE", "undetected-chromedriver").strip().lower()
COLES_BROWSER_FETCH_URL = os.getenv(
    "COLES_BROWSER_FETCH_URL", os.getenv("COLES_FIREFOX_FETCH_URL", "")
).strip()
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


def product_identifier(item: dict[str, Any]) -> str | None:
    """Return Coles' product ID without treating an unrelated nested ID as one."""
    for key in ("id", "productId", "productCode", "stockCode", "sku"):
        found = identifier(item.get(key))
        if found:
            return found
    return None


def parse_coles_product_document(raw: str, external_id: str) -> dict[str, Any]:
    """Find the exact requested product in a verified Coles product document.

    Product-page Next data is not as stable as browse-page data.  We only
    accept an object that declares the requested retailer ID and has a product
    name.  This deliberately rejects look-alike search data and site chrome.
    """
    try:
        document = json.loads(raw)
    except json.JSONDecodeError as error:
        raise RuntimeError("Coles product page did not expose valid catalogue data") from error

    pending: list[object] = [document]
    visited: set[int] = set()
    while pending:
        value = pending.pop()
        if isinstance(value, dict):
            marker = id(value)
            if marker in visited:
                continue
            visited.add(marker)
            matches_id = product_identifier(value) == external_id
            name = text(value.get("name")) or text(value.get("displayName")) or text(value.get("productName"))
            if matches_id and name:
                return value
            pending.extend(value.values())
        elif isinstance(value, list):
            pending.extend(value)
    raise RuntimeError("Coles product page did not expose the requested product")


def valid_coles_product_url(value: str, external_id: str) -> bool:
    parsed = urlparse(value)
    return (
        parsed.scheme == "https"
        and parsed.netloc == "www.coles.com.au"
        and bool(re.fullmatch(rf"/product/[^/]+-{re.escape(external_id)}/?", parsed.path))
    )


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


def coles_legacy_category_api_diagnostic(category_id: str | None = None) -> dict[str, Any]:
    """Classify the legacy endpoint response without exposing credentials or body text."""
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
            body = response.read()
            return coles_response_diagnostic(response.status, response.headers.get_content_type(), body)
    except HTTPError as error:
        return coles_response_diagnostic(
            error.code,
            error.headers.get_content_type() if error.headers else None,
            error.read(),
        )
    except URLError:
        return {
            "upstreamStatus": None,
            "contentType": None,
            "responseBytes": 0,
            "classification": "network-error",
        }


def coles_response_diagnostic(status: int, content_type: str | None, body: bytes) -> dict[str, Any]:
    """Return a compact, non-sensitive description of an upstream response."""
    content = (content_type or "").lower()
    preview = body[:4_096].decode("utf-8", errors="replace").lower()
    if "json" in content:
        try:
            json.loads(body.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            classification = "invalid-json"
        else:
            classification = "json"
    elif "access denied" in preview or "forbidden" in preview:
        classification = "access-denied"
    elif "captcha" in preview or "verification" in preview or "pardon our interruption" in preview:
        classification = "verification-page"
    elif status == 404:
        classification = "not-found"
    elif "html" in content or "<!doctype html" in preview or "<html" in preview:
        classification = "unexpected-html"
    else:
        classification = "unexpected-response"
    return {
        "upstreamStatus": status,
        "contentType": content_type or None,
        "responseBytes": len(body),
        "classification": classification,
        "pageSignals": coles_html_diagnostic_signals(content, body),
    }


def coles_html_diagnostic_signals(content_type: str, body: bytes) -> list[str]:
    """Return only recognised, non-sensitive HTML page markers."""
    if "html" not in content_type.lower():
        return []
    preview = body[:4_096].decode("utf-8", errors="replace").lower()
    markers = {
        "access-denied": "access denied",
        "verification": "pardon our interruption",
        "captcha": "captcha",
        "imperva": "imperva",
        "incapsula": "incapsula",
        "cloudflare": "cloudflare",
        "not-found": "not found",
    }
    return [name for name, marker in markers.items() if marker in preview]


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
          next_offset INTEGER NOT NULL DEFAULT 0, next_page INTEGER NOT NULL DEFAULT 1,
          is_leaf INTEGER,
          last_started_at INTEGER, last_completed_at INTEGER, last_error TEXT
        )
    """)
    collection_columns = {
        row["name"] for row in connection.execute("PRAGMA table_info(coles_category_collection)")
    }
    if "next_offset" not in collection_columns:
        connection.execute(
            "ALTER TABLE coles_category_collection ADD COLUMN next_offset INTEGER NOT NULL DEFAULT 0"
        )
    if "next_page" not in collection_columns:
        connection.execute(
            "ALTER TABLE coles_category_collection ADD COLUMN next_page INTEGER NOT NULL DEFAULT 1"
        )
    if "is_leaf" not in collection_columns:
        connection.execute("ALTER TABLE coles_category_collection ADD COLUMN is_leaf INTEGER")
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
            paths = list(dict.fromkeys([
                category_path,
                *hierarchy_paths(item.get("onlineHeirs"), category_path),
            ]))
            existing = connection.execute(
                "SELECT category_path, category_paths FROM coles_products WHERE external_id = ?",
                (external_id,),
            ).fetchone()
            primary_path = category_path
            if existing:
                primary_path = existing["category_path"]
                try:
                    existing_paths = json.loads(existing["category_paths"])
                except (TypeError, json.JSONDecodeError):
                    existing_paths = []
                if isinstance(existing_paths, list):
                    paths = list(dict.fromkeys([*existing_paths, *paths]))
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
                image_url(item.get("imageUris")), primary_path, json.dumps(paths), json_value(item.get("onlineHeirs")), now,
            ))
            cached.add(external_id)
    return cached


@dataclass
class ColesBrowserSession:
    cdp_url: str = COLES_CDP_URL
    browser_engine: str = COLES_BROWSER_ENGINE
    browser_fetch_url: str = COLES_BROWSER_FETCH_URL

    def browser_payload(self, url: str) -> dict[str, Any]:
        if not self.browser_fetch_url:
            raise RuntimeError("Coles browser session is not configured; set COLES_BROWSER_FETCH_URL")
        request_url = f"{self.browser_fetch_url}?{urlencode({'url': url})}"
        try:
            with urlopen(request_url, timeout=90) as response:
                payload = json.loads(response.read())
        except HTTPError as error:
            try:
                detail = json.loads(error.read())
            except (json.JSONDecodeError, UnicodeDecodeError):
                detail = {}
            message = detail.get("error") if isinstance(detail, dict) else None
            raise RuntimeError(message or f"Coles browser session returned HTTP {error.code}") from error
        except URLError as error:
            raise RuntimeError(f"Coles browser session is unavailable: {error.reason}") from error
        except (json.JSONDecodeError, UnicodeDecodeError) as error:
            raise RuntimeError("Coles browser session returned an invalid response") from error
        if payload.get("status") != "success":
            raise RuntimeError(payload.get("error") or "Coles browser session did not return catalogue data")
        if not isinstance(payload.get("nextData"), str) or not payload["nextData"]:
            raise RuntimeError("Coles browser session did not return catalogue data")
        return payload

    def children(
        self,
        category_path: str,
        fetch_payload: Callable[[str], dict[str, Any]] | None = None,
    ) -> list[str]:
        if not category_path.startswith("/browse/"):
            raise ValueError("category must be a /browse/ path")
        payload = (fetch_payload or self.browser_payload)(f"https://www.coles.com.au{category_path}")
        parent = category_path.rstrip("/")
        rendered = payload.get("browsePaths")
        children: list[str] = []
        if isinstance(rendered, list):
            for value in rendered:
                if not isinstance(value, str):
                    continue
                path = value.split("?", 1)[0].split("#", 1)[0].rstrip("/")
                if path.startswith(f"{parent}/"):
                    children.append(path)
        return deepest_paths(children) if children else coles_browse_paths(payload["nextData"], category_path)

    def browse(
        self,
        category_path: str,
        fetch_page: Callable[[str], str] | None = None,
        resume: bool = False,
    ) -> int:
        if not category_path.startswith("/browse/"):
            raise ValueError("category must be a /browse/ path")
        if self.browser_engine not in ("chromium-cdp", "undetected-chromedriver", "firefox"):
            raise RuntimeError("unsupported Coles browser engine; use undetected-chromedriver or chromium-cdp")
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
            now = int(time.time())
            with cache_session() as connection:
                checkpoint = connection.execute(
                    "SELECT state, products_cached, next_offset, next_page FROM coles_category_collection WHERE category_path = ?",
                    (category_path,),
                ).fetchone()
                can_resume = resume and checkpoint and checkpoint["state"] in ("running", "failed")
                offset = int(checkpoint["next_offset"]) if can_resume else 0
                page_number = int(checkpoint["next_page"]) if can_resume else 1
                connection.execute("""
                    INSERT INTO coles_category_collection (
                      category_path, state, attempts, products_cached, next_offset, next_page,
                      is_leaf, last_started_at, last_error
                    ) VALUES (?, 'running', 1, 0, ?, ?, 1, ?, NULL)
                    ON CONFLICT(category_path) DO UPDATE SET
                      state='running', attempts=attempts + 1,
                      products_cached=CASE WHEN ? THEN products_cached ELSE 0 END,
                      next_offset=excluded.next_offset, next_page=excluded.next_page,
                      last_started_at=excluded.last_started_at, last_error=NULL,
                      is_leaf=1
                """, (category_path, offset, page_number, now, int(bool(can_resume))))
                cached_count = int(checkpoint["products_cached"]) if can_resume else 0
            try:
                while True:
                    query = urlencode({"sortBy": "recommendedDescending", "start": offset, "page": page_number})
                    result = parse_coles_browse_document(read(f"https://www.coles.com.au{category_path}?{query}"))
                    cached_ids.update(cache_page(category_path, result))
                    total = int(result.get("noOfResults") or 0)
                    page_size = int(result.get("pageSize") or COLES_PAGE_SIZE)
                    offset += page_size
                    page_number += 1
                    complete = not result["results"] or offset >= total
                    with cache_session() as connection:
                        products_cached = cached_count + len(cached_ids)
                        connection.execute("""
                            UPDATE coles_category_collection
                            SET state=?, products_cached=?, next_offset=?, next_page=?,
                                last_completed_at=CASE WHEN ? THEN ? ELSE last_completed_at END,
                                last_error=NULL
                            WHERE category_path=?
                        """, (
                            "completed" if complete else "running", products_cached, offset, page_number,
                            int(complete), int(time.time()), category_path,
                        ))
                    if complete:
                        return products_cached
            except Exception as error:
                with cache_session() as connection:
                    connection.execute("""
                        UPDATE coles_category_collection
                        SET state='failed', last_error=? WHERE category_path=?
                    """, (str(error)[:1_000], category_path))
                raise

        if fetch_page:
            return collect(fetch_page)

        if self.browser_engine in ("undetected-chromedriver", "firefox"):
            if not self.browser_fetch_url:
                raise RuntimeError("Coles browser session is not configured; set COLES_BROWSER_FETCH_URL")

            def read_browser(url: str) -> str:
                return self.browser_payload(url)["nextData"]

            return collect(read_browser)

        with sync_playwright() as playwright:
            browser = playwright.chromium.connect_over_cdp(self.cdp_url)
            try:
                context = browser.contexts[0]
                return collect(lambda url: read_page(context, url))
            finally:
                browser.close()

    def product(self, product_url: str, external_id: str, fetch_page: Callable[[str], str] | None = None) -> dict[str, Any]:
        """Read one exact Coles product page through the verified browser session."""
        if not valid_coles_product_url(product_url, external_id):
            raise ValueError("product must be a canonical Coles product URL for the requested ID")
        if self.browser_engine not in ("chromium-cdp", "undetected-chromedriver", "firefox"):
            raise RuntimeError("unsupported Coles browser engine; use undetected-chromedriver or chromium-cdp")

        def read_page(context: Any, url: str) -> str:
            page = context.new_page()
            try:
                page.goto(url, wait_until="domcontentloaded", timeout=45_000)
                verification_error = coles_browser_verification_error(page.locator("body").inner_text(timeout=5_000))
                if verification_error:
                    raise RuntimeError(verification_error)
                payload = page.locator("#__NEXT_DATA__").text_content(timeout=15_000)
                if not payload:
                    raise RuntimeError("Coles product page did not expose its catalogue data")
                return payload
            finally:
                page.close()

        if fetch_page:
            return parse_coles_product_document(fetch_page(product_url), external_id)

        if self.browser_engine in ("undetected-chromedriver", "firefox"):
            if not self.browser_fetch_url:
                raise RuntimeError("Coles browser session is not configured; set COLES_BROWSER_FETCH_URL")
            request_url = f"{self.browser_fetch_url}?{urlencode({'url': product_url})}"
            try:
                with urlopen(request_url, timeout=90) as response:
                    payload = json.loads(response.read())
            except HTTPError as error:
                try:
                    detail = json.loads(error.read())
                except (json.JSONDecodeError, UnicodeDecodeError):
                    detail = {}
                message = detail.get("error") if isinstance(detail, dict) else None
                raise RuntimeError(message or f"Coles browser session returned HTTP {error.code}") from error
            except URLError as error:
                raise RuntimeError(f"Coles browser session is unavailable: {error.reason}") from error
            except (json.JSONDecodeError, UnicodeDecodeError) as error:
                raise RuntimeError("Coles browser session returned an invalid response") from error
            if payload.get("status") != "success" or not isinstance(payload.get("nextData"), str):
                raise RuntimeError(payload.get("error") or "Coles browser session did not return product data")
            return parse_coles_product_document(payload["nextData"], external_id)

        if not self.cdp_url:
            raise RuntimeError("verified browser session is not configured; set COLES_CDP_URL")
        with sync_playwright() as playwright:
            browser = playwright.chromium.connect_over_cdp(self.cdp_url)
            try:
                return parse_coles_product_document(read_page(browser.contexts[0], product_url), external_id)
            finally:
                browser.close()


def status() -> dict[str, Any]:
    with cache_session() as connection:
        summary = connection.execute("""
            SELECT COUNT(*) total, COUNT(*) FILTER (WHERE state='pending') pending,
                   COUNT(*) FILTER (WHERE state='running') running,
                   COUNT(*) FILTER (WHERE state='completed') completed,
                   COUNT(*) FILTER (WHERE state='failed') failed
            FROM coles_category_collection WHERE is_leaf=1
        """).fetchone()
        product_summary = connection.execute("SELECT COUNT(*) products, MAX(refreshed_at) refreshed_at FROM coles_products").fetchone()
    configured = bool(COLES_BROWSER_FETCH_URL) if COLES_BROWSER_ENGINE != "chromium-cdp" else bool(COLES_CDP_URL)
    mode = "verified-undetected-chromedriver" if COLES_BROWSER_ENGINE != "chromium-cdp" else "verified-browser"
    return {**dict(summary), "products": product_summary["products"], "lastRefreshedAt": product_summary["refreshed_at"], "acquisitionMode": mode if configured else "unconfigured"}


def discover_children(
    session: ColesBrowserSession,
    category: str,
    attempts: int = 3,
) -> list[str]:
    """Retry one discovery node after a watchdog-triggered browser restart."""
    for attempt in range(1, attempts + 1):
        try:
            return session.children(category)
        except RuntimeError:
            if attempt == attempts:
                raise
            time.sleep(5 * attempt)
    raise RuntimeError("Coles child discovery exhausted its retry budget")


def refresh_all(
    resume_category: str | None = None,
    session: ColesBrowserSession | None = None,
) -> None:
    """Discover the Coles browse tree and paginate only its leaf categories."""
    session = session or ColesBrowserSession()
    queue = deque(COLES_ROOT_CATEGORIES)
    discovered = set(queue)
    leaves: list[str] = []
    collection_nodes: list[tuple[str, int]] = []
    while queue:
        category = queue.popleft()
        children = discover_children(session, category)
        collection_nodes.append((category, int(not children)))
        if children:
            for child in children:
                if child not in discovered:
                    queue.append(child)
                    discovered.add(child)
        else:
            leaves.append(category)

    with cache_session() as connection:
        connection.execute("UPDATE coles_category_collection SET is_leaf=NULL")
        connection.executemany(
            """INSERT INTO coles_category_collection (category_path, state, is_leaf)
               VALUES (?, 'pending', ?)
               ON CONFLICT(category_path) DO UPDATE SET is_leaf=excluded.is_leaf""",
            collection_nodes,
        )

    start = leaves.index(resume_category) if resume_category else 0
    for category in leaves[start:]:
        session.browse(category, resume=category == resume_category)


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
