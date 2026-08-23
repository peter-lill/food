import html
import json
import os
import re
import socket
import sqlite3
import sys
import threading
import time
import xml.etree.ElementTree as ET
from contextlib import contextmanager
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from queue import Queue
from urllib.parse import parse_qs, quote, urlparse
from urllib.request import Request, urlopen

from playwright.sync_api import sync_playwright

sys.path.insert(0, "/opt/grocery-mcp/upstream")

from src.supermarkets import (  # noqa: E402
    COLES_DEFAULT_STORE_ID,
    coles_search_products,
)

PORT = int(os.getenv("PORT", "8787"))


def clean_text(value: object) -> str | None:
    if not isinstance(value, str):
        return None
    value = " ".join(value.split()).strip()
    return value or None


def clean_price(value: object) -> float | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        price = float(value)
    elif isinstance(value, str):
        try:
            price = float("".join(character for character in value if character.isdigit() or character == "."))
        except ValueError:
            return None
    else:
        return None
    return round(price, 2) if price > 0 else None


def clean_coordinate(value: object) -> float | None:
    if isinstance(value, bool):
        return None
    try:
        coordinate = float(value)
    except (TypeError, ValueError):
        return None
    return coordinate if -180 <= coordinate <= 180 else None


def clean_identifier(value: object) -> str | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return str(value)
    return clean_text(value)


def first_text(item: dict, keys: tuple[str, ...]) -> str | None:
    for key in keys:
        value = clean_text(item.get(key))
        if value:
            return value
    return None


def first_identifier(item: dict, keys: tuple[str, ...]) -> str | None:
    for key in keys:
        value = clean_identifier(item.get(key))
        if value:
            return value
    return None


def nested_value(item: object, keys: tuple[str, ...]) -> object | None:
    """Find a named field in retailer payloads that move metadata into nested objects."""
    # Retailers commonly expose the same value under several field names. Honour
    # the caller's order so a specific package-size field wins over a generic
    # quantity field, regardless of JSON object ordering.
    wanted = tuple(key.casefold() for key in keys)
    if isinstance(item, dict):
        for wanted_key in wanted:
            for key, value in item.items():
                if key.casefold() == wanted_key and value is not None:
                    return value
        for value in item.values():
            found = nested_value(value, keys)
            if found is not None:
                return found
    elif isinstance(item, list):
        for value in item:
            found = nested_value(value, keys)
            if found is not None:
                return found
    return None


def nested_text(item: object, keys: tuple[str, ...]) -> str | None:
    value = nested_value(item, keys)
    if isinstance(value, dict):
        return first_text(value, ("name", "displayName", "label", "value"))
    return clean_text(value)


def nested_identifier(item: object, keys: tuple[str, ...]) -> str | None:
    value = nested_value(item, keys)
    if isinstance(value, dict):
        return first_identifier(value, ("id", "code", "value"))
    return clean_identifier(value)


def coles_products(result: dict) -> list[dict]:
    response_data = result.get("response_data")
    if not isinstance(response_data, dict):
        return []

    results = response_data.get("results")
    if not isinstance(results, list):
        return []

    products: list[dict] = []
    for source in results:
        if not isinstance(source, dict):
            continue

        pricing = source.get("pricing")
        pricing = pricing if isinstance(pricing, dict) else {}
        now_price = clean_price(pricing.get("now"))
        was_price = clean_price(pricing.get("was"))
        price = now_price or was_price
        name = first_text(source, ("name", "displayName", "productName"))
        if not name or price is None:
            continue

        brand = nested_text(source, ("brand", "brandName", "manufacturer"))
        if brand and brand.casefold() not in name.casefold():
            name = f"{brand} {name}"

        pack_size = nested_text(source, (
            "packageSize", "package_size", "packSize", "sizeDescription",
            "productSize", "netContent", "netWeight", "weight", "volume",
            "quantityDescription", "size", "quantity",
        ))
        if pack_size and pack_size.casefold() not in name.casefold():
            name = f"{name} {pack_size}"

        promotion = first_text(
            pricing,
            ("promotion", "promotionDescription", "offerDescription", "offer", "label"),
        ) or first_text(source, ("promotion", "promotionDescription", "offerDescription"))
        products.append({
            "name": name,
            "price": price,
            "wasPrice": was_price,
            "isSpecial": (
                bool(promotion)
                or (now_price is not None and was_price is not None and now_price < was_price)
            ),
            "promotion": promotion,
            "unit": pack_size,
            "packSize": pack_size,
            "store": "coles",
            "barcode": nested_identifier(source, ("barcode", "gtin", "ean", "upc")),
            "imageUrl": nested_text(source, ("imageUrl", "imageURL", "thumbnailUrl")),
            "productId": nested_identifier(
                source,
                ("id", "code", "productId", "productCode", "sku", "stockCode"),
            ),
            "raw": source,
        })
    return products


def clean_product(retailer: str, item: dict) -> dict | None:
    name = clean_text(item.get("name"))
    price = clean_price(item.get("price"))
    if not name or price is None:
        return None

    was_price = clean_price(item.get("wasPrice"))
    is_special = item.get("isSpecial") is True or (
        was_price is not None and price < was_price
    )
    return {
        "retailer": retailer,
        "name": name,
        "price": price,
        "wasPrice": was_price,
        "isSpecial": is_special,
        "promotion": clean_text(item.get("promotion")),
        "unit": clean_text(item.get("unit")),
        "store": clean_text(item.get("store")) or retailer.lower(),
        "barcode": clean_identifier(item.get("barcode")),
        "imageUrl": clean_text(item.get("image")) or clean_text(item.get("imageUrl")),
        "productId": (
            clean_identifier(item.get("id"))
            or clean_identifier(item.get("productId"))
            or clean_identifier(item.get("sku"))
        ),
        "raw": item,
    }


def normalise_products(retailer: str, products: list[dict], limit: int) -> list[dict]:
    cleaned: list[dict] = []
    seen: set[tuple[str, float]] = set()
    for item in products:
        product = clean_product(retailer, item)
        if not product:
            continue
        identity = (product["name"].casefold(), product["price"])
        if identity in seen:
            continue
        seen.add(identity)
        cleaned.append(product)
        if len(cleaned) >= limit:
            break
    return cleaned


def search_coles(query: str, limit: int, store_id: str | None) -> list[dict]:
    selected_store = store_id or os.getenv("COLES_STORE_ID") or COLES_DEFAULT_STORE_ID
    result = coles_search_products(query=query, store_id=selected_store)
    if result.get("status") == "error":
        raise RuntimeError(result.get("message") or "Coles search failed")
    return normalise_products("Coles", coles_products(result), limit)


WOOLWORTHS_SEARCH_URL = "https://www.woolworths.com.au/apis/ui/Search/products"
WOOLWORTHS_CATEGORY_API_PATH = "/apis/ui/browse/category"
WOOLWORTHS_DETAIL_API_PATH = "/apis/ui/product/detail"
WOOLWORTHS_CATALOGUE_DB = os.getenv("WOOLWORTHS_CATALOGUE_DB", "/data/woolworths-catalogue.sqlite3")
WOOLWORTHS_CDP_URL = os.getenv("WOOLWORTHS_CDP_URL", "").strip()
WOOLWORTHS_TIMEOUT_SECONDS = max(3, int(os.getenv("WOOLWORTHS_TIMEOUT_SECONDS", "15")))
WOOLWORTHS_CIRCUIT_SECONDS = max(30, int(os.getenv("WOOLWORTHS_CIRCUIT_SECONDS", "300")))
WOOLWORTHS_COLLECTION_CATEGORIES = tuple(
    path.strip()
    for path in os.getenv(
        "WOOLWORTHS_COLLECTION_CATEGORIES",
        "/shop/browse/fruit-veg,"
        "/shop/browse/meat-seafood-deli,"
        "/shop/browse/bakery,"
        "/shop/browse/dairy-eggs-fridge,"
        "/shop/browse/freezer,"
        "/shop/browse/pantry,"
        "/shop/browse/drinks,"
        "/shop/browse/health-beauty,"
        "/shop/browse/baby,"
        "/shop/browse/cleaning-maintenance,"
        "/shop/browse/pet,"
        "/shop/browse/liquor",
    ).split(",")
    if path.strip()
)
_woolworths_unavailable_until = 0.0
_woolworths_circuit_lock = threading.Lock()


def resolved_cdp_url(configured_url: str) -> str:
    """Use an IP Host header accepted by Chromium's DevTools HTTP server."""
    parsed = urlparse(configured_url)
    if not parsed.hostname:
        raise ValueError("WOOLWORTHS_CDP_URL must include a hostname")
    if parsed.scheme != "http":
        return configured_url
    address = socket.gethostbyname(parsed.hostname)
    port = parsed.port or (443 if parsed.scheme == "https" else 80)
    return parsed._replace(netloc=f"{address}:{port}").geturl()


class WoolworthsBrowserSession:
    """Run Woolworths UI requests inside a storefront browser session."""

    def __init__(self) -> None:
        self._requests: Queue = Queue()
        self._thread = threading.Thread(target=self._run, daemon=True, name="woolworths-browser")
        self._thread.start()

    def search(self, query: str, limit: int) -> object:
        completed: Queue = Queue(maxsize=1)
        self._requests.put((query, limit, completed))
        try:
            success, value = completed.get(timeout=WOOLWORTHS_TIMEOUT_SECONDS + 20)
        except Exception as error:
            raise RuntimeError("browser session did not return in time") from error
        if not success:
            raise RuntimeError(str(value))
        return value

    def browse(self, category_path: str) -> object:
        completed: Queue = Queue(maxsize=1)
        self._requests.put(("browse", category_path, completed))
        try:
            success, value = completed.get(timeout=WOOLWORTHS_TIMEOUT_SECONDS + 75)
        except Exception as error:
            raise RuntimeError("browser category session did not return in time") from error
        if not success:
            raise RuntimeError(str(value))
        return value

    def details(self, stockcodes: list[str]) -> object:
        completed: Queue = Queue(maxsize=1)
        self._requests.put(("details", stockcodes, completed))
        try:
            success, value = completed.get(timeout=max(60, WOOLWORTHS_TIMEOUT_SECONDS * len(stockcodes)))
        except Exception as error:
            raise RuntimeError("browser product-detail session did not return in time") from error
        if not success:
            raise RuntimeError(str(value))
        return value

    def _run(self) -> None:
        with sync_playwright() as playwright:
            browser = None
            page = None
            owns_browser = False
            while True:
                request = self._requests.get()
                if len(request) == 3 and request[0] in ("browse", "details"):
                    operation, operation_value, completed = request
                    category_path = operation_value if operation == "browse" else None
                    stockcodes = operation_value if operation == "details" else []
                    query = None
                    limit = 0
                else:
                    query, limit, completed = request
                    operation = "search"
                try:
                    if browser is None or not browser.is_connected():
                        if WOOLWORTHS_CDP_URL:
                            browser = playwright.chromium.connect_over_cdp(
                                resolved_cdp_url(WOOLWORTHS_CDP_URL)
                            )
                            owns_browser = False
                            if not browser.contexts:
                                raise RuntimeError("verified browser has no active context")
                            context = browser.contexts[0]
                            page = next((candidate for candidate in context.pages if "woolworths.com.au" in candidate.url), None)
                            if page is None:
                                page = context.new_page()
                        else:
                            browser = playwright.chromium.launch(
                                headless=True,
                                args=["--no-sandbox", "--disable-dev-shm-usage"],
                            )
                            owns_browser = True
                            context = browser.new_context(
                                locale="en-AU",
                                timezone_id="Australia/Brisbane",
                                user_agent=(
                                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                                    "AppleWebKit/537.36 (KHTML, like Gecko) "
                                    "Chrome/143.0.0.0 Safari/537.36"
                                ),
                            )
                            page = context.new_page()
                            page.goto(
                                "https://www.woolworths.com.au/",
                                wait_until="domcontentloaded",
                                timeout=WOOLWORTHS_TIMEOUT_SECONDS * 1000,
                            )
                    if operation == "browse":
                        if not WOOLWORTHS_CDP_URL:
                            raise RuntimeError(
                                "verified browser session is not configured; set WOOLWORTHS_CDP_URL"
                            )
                        if not category_path.startswith("/shop/browse/"):
                            raise ValueError("category must be a /shop/browse/ path")
                        browse_page = context.new_page()
                        captured_responses: list[object] = []
                        def capture_category(response: object) -> None:
                            try:
                                if WOOLWORTHS_CATEGORY_API_PATH in response.url and response.ok:
                                    captured_responses.append(response)
                            except Exception:
                                return
                        browse_page.on("response", capture_category)
                        try:
                            browse_page.goto(
                                f"https://www.woolworths.com.au{category_path}",
                                wait_until="domcontentloaded",
                                timeout=(WOOLWORTHS_TIMEOUT_SECONDS + 30) * 1000,
                            )
                            # Scroll long enough for lazy pages to request their next
                            # category response. The first complete response is not an
                            # indication that a broad category has finished loading.
                            stable_rounds = 0
                            previous_height = 0
                            for _ in range(60):
                                previous = len(captured_responses)
                                current_height = browse_page.evaluate("document.body.scrollHeight")
                                browse_page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
                                browse_page.wait_for_timeout(750)
                                loaded_more = len(captured_responses) > previous
                                grew = browse_page.evaluate("document.body.scrollHeight") > current_height or current_height > previous_height
                                stable_rounds = 0 if loaded_more or grew else stable_rounds + 1
                                previous_height = current_height
                                if captured_responses and stable_rounds >= 4:
                                    break
                            browse_page.remove_listener("response", capture_category)
                            title = browse_page.title().casefold()
                            if "access denied" in title or "captcha" in title:
                                raise RuntimeError("Woolworths requires browser verification")
                            if not captured_responses:
                                raise RuntimeError("category API response was not observed")
                            captured: list[object] = []
                            decode_errors: list[str] = []
                            for response in captured_responses:
                                try:
                                    response.finished()
                                    captured.append(response.json())
                                except Exception as error:
                                    decode_errors.append(str(error))
                            if not captured:
                                detail = decode_errors[0] if decode_errors else "unknown response decoding error"
                                raise RuntimeError(
                                    f"category API response was observed but could not be decoded: {detail}"
                                )
                            descendants = browse_page.evaluate("""(parentPath) => {
                              const base = parentPath.replace(/\\/+$/, '');
                              return [...new Set([...document.querySelectorAll('a[href]')]
                                .map((anchor) => {
                                  try {
                                    const url = new URL(anchor.href, window.location.origin);
                                    return url.origin === window.location.origin ? url.pathname.replace(/\\/+$/, '') : null;
                                  } catch { return null; }
                                })
                                .filter((path) => path && path.startsWith(`${base}/`)))];
                            }""", category_path)
                            completed.put((True, {
                                "categoryResponses": captured,
                                "subcategories": descendants,
                            }))
                        finally:
                            if not browse_page.is_closed():
                                browse_page.close()
                        continue

                    if operation == "details":
                        if not WOOLWORTHS_CDP_URL:
                            raise RuntimeError(
                                "verified browser session is not configured; set WOOLWORTHS_CDP_URL"
                            )
                        result = page.evaluate(
                            """async ({basePath, stockcodes}) => {
                              const details = [];
                              for (const stockcode of stockcodes) {
                                try {
                                  const response = await fetch(`${basePath}/${encodeURIComponent(stockcode)}`, {
                                    credentials: 'include',
                                    headers: {'accept': 'application/json, text/plain, */*'}
                                  });
                                  if (!response.ok) throw new Error(`HTTP ${response.status}`);
                                  details.push({stockcode, payload: await response.json()});
                                } catch (error) {
                                  details.push({stockcode, error: String(error)});
                                }
                                await new Promise((resolve) => setTimeout(resolve, 150));
                              }
                              return details;
                            }""",
                            {"basePath": WOOLWORTHS_DETAIL_API_PATH, "stockcodes": stockcodes},
                        )
                        completed.put((True, result))
                        continue

                    search_path = f"/shop/search/products?searchTerm={quote(query)}"
                    if not page.url.startswith("https://www.woolworths.com.au/shop/search"):
                        page.goto(
                            f"https://www.woolworths.com.au{search_path}",
                            wait_until="domcontentloaded",
                            timeout=WOOLWORTHS_TIMEOUT_SECONDS * 1000,
                        )
                    title = page.title().casefold()
                    if "access denied" in title or "captcha" in title:
                        raise RuntimeError("Woolworths requires browser verification")
                    payload = {
                        "Filters": [], "IsSpecial": False, "Location": search_path,
                        "PageNumber": 1, "PageSize": min(36, max(limit, 1)),
                        "SearchTerm": query, "SortType": "TraderRelevance",
                        "IsHideEverydayMarketProducts": False,
                        "IsRegisteredRewardCardPromotion": None,
                        "ExcludeSearchTypes": ["UntraceableVendors"], "GpBoost": 0,
                        "GroupEdmVariants": False, "EnableAdReRanking": False,
                    }
                    result = page.evaluate(
                        """async ({url, payload}) => {
                          const response = await fetch(url, {
                            method: 'POST', credentials: 'include',
                            headers: {'accept': 'application/json, text/plain, */*', 'content-type': 'application/json'},
                            body: JSON.stringify(payload)
                          });
                          if (!response.ok) throw new Error(`HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`);
                          return response.json();
                        }""",
                        {"url": WOOLWORTHS_SEARCH_URL, "payload": payload},
                    )
                    completed.put((True, result))
                except Exception as error:
                    if browser is not None and owns_browser:
                        browser.close()
                    browser = None
                    page = None
                    owns_browser = False
                    completed.put((False, error))


_woolworths_browser: WoolworthsBrowserSession | None = None
_woolworths_browser_lock = threading.Lock()


def woolworths_browser() -> WoolworthsBrowserSession:
    global _woolworths_browser
    with _woolworths_browser_lock:
        if _woolworths_browser is None:
            _woolworths_browser = WoolworthsBrowserSession()
        return _woolworths_browser


def clean_search_query(query: str) -> str:
    cleaned = re.sub(
        r"\b(?:css|font|style|inherit|weight|webkit|text|decoration|display|flex|grid|margin|padding|border|background)\b",
        " ", query, flags=re.IGNORECASE,
    )
    return " ".join(cleaned.split())[:120]


def woolworths_product_nodes(value: object) -> list[dict]:
    if isinstance(value, list):
        return [product for item in value for product in woolworths_product_nodes(item)]
    if not isinstance(value, dict):
        return []
    own = [value] if value.get("Stockcode") and (value.get("DisplayName") or value.get("Name")) else []
    return own + [product for item in value.values() for product in woolworths_product_nodes(item)]


def catalogue_connection() -> sqlite3.Connection:
    directory = os.path.dirname(WOOLWORTHS_CATALOGUE_DB)
    if directory:
        os.makedirs(directory, exist_ok=True)
    connection = sqlite3.connect(WOOLWORTHS_CATALOGUE_DB)
    connection.row_factory = sqlite3.Row
    connection.execute("""
        CREATE TABLE IF NOT EXISTS woolworths_products (
          stockcode TEXT PRIMARY KEY, barcode TEXT, name TEXT NOT NULL, search_text TEXT NOT NULL,
          price REAL, was_price REAL, pack_size TEXT, unit_price TEXT, image_url TEXT,
          category_path TEXT NOT NULL, is_special INTEGER NOT NULL DEFAULT 0,
          in_stock INTEGER NOT NULL DEFAULT 1, refreshed_at INTEGER NOT NULL,
          brand TEXT, description TEXT, long_description TEXT, ingredients TEXT,
          allergens TEXT, nutrition TEXT, dietary_claims TEXT, country_of_origin TEXT,
          storage_instructions TEXT, preparation_instructions TEXT, additional_images TEXT,
          detail_refreshed_at INTEGER, detail_error TEXT
        )
    """)
    existing = {row[1] for row in connection.execute("PRAGMA table_info(woolworths_products)")}
    detail_columns = {
        "brand": "TEXT", "description": "TEXT", "long_description": "TEXT",
        "ingredients": "TEXT", "allergens": "TEXT", "nutrition": "TEXT",
        "dietary_claims": "TEXT", "country_of_origin": "TEXT",
        "storage_instructions": "TEXT", "preparation_instructions": "TEXT",
        "additional_images": "TEXT", "detail_refreshed_at": "INTEGER", "detail_error": "TEXT",
    }
    for name, column_type in detail_columns.items():
        if name not in existing:
            connection.execute(f"ALTER TABLE woolworths_products ADD COLUMN {name} {column_type}")
    connection.execute("CREATE INDEX IF NOT EXISTS woolworths_products_search ON woolworths_products(search_text)")
    connection.execute("""
        CREATE TABLE IF NOT EXISTS woolworths_category_collection (
          category_path TEXT PRIMARY KEY,
          state TEXT NOT NULL CHECK(state IN ('pending', 'running', 'completed', 'failed')),
          attempts INTEGER NOT NULL DEFAULT 0,
          products_cached INTEGER NOT NULL DEFAULT 0,
          details_enriched INTEGER NOT NULL DEFAULT 0,
          details_failed INTEGER NOT NULL DEFAULT 0,
          last_started_at INTEGER,
          last_completed_at INTEGER,
          last_error TEXT
        )
    """)
    return connection


@contextmanager
def catalogue_session():
    connection = catalogue_connection()
    try:
        with connection:
            yield connection
    finally:
        connection.close()


def cache_woolworths_category(category_path: str, payload: object) -> int:
    products = woolworths_product_nodes(payload)
    refreshed_at = int(time.time())
    cached = 0
    with catalogue_session() as connection:
        for source in products:
            stockcode = clean_identifier(source.get("Stockcode"))
            name = first_text(source, ("DisplayName", "Name"))
            if not stockcode or not name:
                continue
            connection.execute("""
                INSERT INTO woolworths_products
                  (stockcode, barcode, name, search_text, price, was_price, pack_size, unit_price,
                   image_url, category_path, is_special, in_stock, refreshed_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(stockcode) DO UPDATE SET
                  barcode=excluded.barcode, name=excluded.name, search_text=excluded.search_text,
                  price=excluded.price, was_price=excluded.was_price, pack_size=excluded.pack_size,
                  unit_price=excluded.unit_price, image_url=excluded.image_url,
                  category_path=excluded.category_path, is_special=excluded.is_special,
                  in_stock=excluded.in_stock, refreshed_at=excluded.refreshed_at
            """, (
                stockcode, first_identifier(source, ("Barcode", "Gtin")), name, name.casefold(),
                clean_price(source.get("Price") or source.get("InstorePrice")), clean_price(source.get("WasPrice")),
                first_text(source, ("PackageSize", "Unit")), first_text(source, ("CupString", "InstoreCupString")),
                first_text(source, ("LargeImageFile", "MediumImageFile")), category_path,
                int(bool(source.get("IsOnSpecial") or source.get("InstoreIsOnSpecial"))),
                int(source.get("IsInStock") is not False), refreshed_at,
            ))
            cached += 1
    return cached


def clean_html(value: object) -> str | None:
    if not isinstance(value, str):
        return None
    return clean_text(html.unescape(re.sub(r"<[^>]+>", " ", value)))


def json_text(value: object) -> str | None:
    if value in (None, "", [], {}):
        return None
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def detail_text(*values: object) -> str | None:
    for value in values:
        cleaned = clean_html(value)
        if cleaned and cleaned.casefold() not in ("false", "null", "n/a"):
            return cleaned
    return None


def cache_woolworths_details(results: object) -> tuple[int, int]:
    if not isinstance(results, list):
        return 0, 0
    enriched = 0
    failed = 0
    refreshed_at = int(time.time())
    with catalogue_session() as connection:
        for result in results:
            if not isinstance(result, dict):
                continue
            stockcode = clean_identifier(result.get("stockcode"))
            payload = result.get("payload")
            if not stockcode or not isinstance(payload, dict):
                if stockcode:
                    connection.execute(
                        "UPDATE woolworths_products SET detail_error = ? WHERE stockcode = ?",
                        (clean_text(result.get("error")) or "Product detail was not returned", stockcode),
                    )
                failed += 1
                continue
            product = payload.get("Product") if isinstance(payload.get("Product"), dict) else payload
            attributes = product.get("AdditionalAttributes") if isinstance(product.get("AdditionalAttributes"), dict) else {}
            root_attributes = payload.get("AdditionalAttributes") if isinstance(payload.get("AdditionalAttributes"), dict) else {}
            attributes = {**root_attributes, **attributes}
            tga = product.get("TgaAttributes") if isinstance(product.get("TgaAttributes"), dict) else {}
            origin = payload.get("CountryOfOriginLabel") if isinstance(payload.get("CountryOfOriginLabel"), dict) else {}
            images = payload.get("DetailsImagePaths") or product.get("DetailsImagePaths") or []
            dietary = [
                cleaned for value in (
                    attributes.get("wool_dietaryclaim"), attributes.get("lifestyleclaim"),
                    attributes.get("lifestyleanddietarystatement"), attributes.get("suitablefor"),
                ) if (cleaned := detail_text(value))
            ]
            allergens = {
                "contains": detail_text(attributes.get("allergencontains"), attributes.get("contains"), attributes.get("allergystatement")),
                "mayContain": detail_text(attributes.get("allergenmaybepresent")),
            }
            nutrition = payload.get("Nutrition") or payload.get("NutritionalInformation") or product.get("NutritionalInformation") or attributes.get("nutritionalinformation")
            connection.execute("""
                UPDATE woolworths_products SET
                  brand = COALESCE(?, brand), description = COALESCE(?, description),
                  long_description = COALESCE(?, long_description), ingredients = COALESCE(?, ingredients),
                  allergens = COALESCE(?, allergens), nutrition = COALESCE(?, nutrition),
                  dietary_claims = COALESCE(?, dietary_claims), country_of_origin = COALESCE(?, country_of_origin),
                  storage_instructions = COALESCE(?, storage_instructions),
                  preparation_instructions = COALESCE(?, preparation_instructions),
                  additional_images = COALESCE(?, additional_images), detail_refreshed_at = ?, detail_error = NULL
                WHERE stockcode = ?
            """, (
                detail_text(product.get("Brand"), attributes.get("brand")),
                detail_text(product.get("Description"), attributes.get("description")),
                detail_text(product.get("RichDescription"), product.get("FullDescription"), attributes.get("ml_enriched_product_description")),
                detail_text(attributes.get("ingredients")), json_text({key: value for key, value in allergens.items() if value}),
                json_text(nutrition), json_text(dietary),
                detail_text(origin.get("CountryOfOrigin"), origin.get("AltText"), attributes.get("countryoforigin")),
                detail_text(attributes.get("storageinstructions"), tga.get("StorageInstructions")),
                detail_text(attributes.get("usageinstructions"), tga.get("Directions")),
                json_text(images), refreshed_at, stockcode,
            ))
            enriched += 1
    return enriched, failed


def refresh_woolworths_category(category_path: str) -> dict:
    """Cache one verified category and its rich product detail without clearing prior data."""
    payload = woolworths_browser().browse(category_path)
    count = cache_woolworths_category(category_path, payload)
    stockcodes = [
        clean_identifier(product.get("Stockcode"))
        for product in woolworths_product_nodes(payload)
        if clean_identifier(product.get("Stockcode"))
    ]
    detail_error = None
    try:
        detail_results = woolworths_browser().details(list(dict.fromkeys(stockcodes)))
        details_enriched, details_failed = cache_woolworths_details(detail_results)
    except Exception as error:  # noqa: BLE001
        # The authoritative category catalogue remains usable when a detail
        # request is temporarily unavailable. A later collector run retries it.
        details_enriched, details_failed = 0, len(stockcodes)
        detail_error = str(error)
    return {
        "category": category_path,
        "products": count,
        "detailsEnriched": details_enriched,
        "detailsFailed": details_failed,
        "detailError": detail_error,
        "subcategories": woolworths_subcategory_paths(payload, category_path),
    }


def woolworths_subcategory_paths(payload: object, parent_path: str) -> list[str]:
    if not isinstance(payload, dict):
        return []
    candidates = payload.get("subcategories")
    if not isinstance(candidates, list):
        return []
    base = parent_path.rstrip("/")
    return list(dict.fromkeys(
        candidate.rstrip("/")
        for candidate in candidates
        if isinstance(candidate, str) and candidate.startswith(f"{base}/")
    ))


def enqueue_woolworths_collection_categories(categories: list[str]) -> None:
    valid = list(dict.fromkeys(
        category.rstrip("/")
        for category in categories
        if category.startswith("/shop/browse/")
    ))
    if not valid:
        return
    with catalogue_session() as connection:
        connection.executemany(
            """INSERT INTO woolworths_category_collection (category_path, state)
               VALUES (?, 'pending') ON CONFLICT(category_path) DO NOTHING""",
            [(category,) for category in valid],
        )


def seed_woolworths_category_collection() -> None:
    enqueue_woolworths_collection_categories(list(WOOLWORTHS_COLLECTION_CATEGORIES))


def recover_woolworths_category_collection() -> None:
    """Release work interrupted by a bridge restart, never by a status read."""
    seed_woolworths_category_collection()
    with catalogue_session() as connection:
        # A process restart cannot leave a category permanently stuck in a
        # transient running state: it is safe to acquire it again.
        connection.execute(
            "UPDATE woolworths_category_collection SET state = 'pending' WHERE state = 'running'"
        )


def woolworths_collection_status() -> dict:
    seed_woolworths_category_collection()
    with catalogue_session() as connection:
        summary = connection.execute("""
            SELECT COUNT(*) total,
                   COUNT(*) FILTER (WHERE state = 'pending') pending,
                   COUNT(*) FILTER (WHERE state = 'running') running,
                   COUNT(*) FILTER (WHERE state = 'completed') completed,
                   COUNT(*) FILTER (WHERE state = 'failed') failed,
                   COALESCE(SUM(products_cached), 0) products_cached,
                   COALESCE(SUM(details_enriched), 0) details_enriched,
                   COALESCE(SUM(details_failed), 0) details_failed,
                   MAX(last_completed_at) last_completed_at
            FROM woolworths_category_collection
        """).fetchone()
        categories = [dict(row) for row in connection.execute("""
            SELECT category_path, state, attempts, products_cached, details_enriched,
                   details_failed, last_started_at, last_completed_at, last_error
            FROM woolworths_category_collection ORDER BY category_path
        """).fetchall()]
    return {**dict(summary), "categories": categories}


class WoolworthsCatalogueCollector:
    """Serial, restart-safe browser acquisition for the known top-level catalogue."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._thread: threading.Thread | None = None

    def start(
        self,
        max_categories: int | None,
        retry_failed: bool,
        revisit_completed_roots: bool = False,
    ) -> bool:
        with self._lock:
            if self._thread is not None and self._thread.is_alive():
                return False
            if retry_failed or revisit_completed_roots:
                with catalogue_session() as connection:
                    if retry_failed:
                        connection.execute(
                            "UPDATE woolworths_category_collection SET state = 'pending' WHERE state = 'failed'"
                        )
                    if revisit_completed_roots and WOOLWORTHS_COLLECTION_CATEGORIES:
                        placeholders = ", ".join("?" for _ in WOOLWORTHS_COLLECTION_CATEGORIES)
                        connection.execute(
                            f"""UPDATE woolworths_category_collection SET state = 'pending'
                                WHERE state = 'completed' AND category_path IN ({placeholders})""",
                            WOOLWORTHS_COLLECTION_CATEGORIES,
                        )
            self._thread = threading.Thread(
                target=self._collect,
                args=(max_categories,),
                daemon=True,
                name="woolworths-catalogue-collector",
            )
            self._thread.start()
            return True

    def _collect(self, max_categories: int | None) -> None:
        seed_woolworths_category_collection()
        processed = 0
        while max_categories is None or processed < max_categories:
            with catalogue_session() as connection:
                row = connection.execute("""
                    SELECT category_path FROM woolworths_category_collection
                    WHERE state = 'pending' ORDER BY category_path LIMIT 1
                """).fetchone()
            if row is None:
                return
            category = row["category_path"]
            processed += 1
            started_at = int(time.time())
            with catalogue_session() as connection:
                connection.execute("""
                    UPDATE woolworths_category_collection
                    SET state = 'running', attempts = attempts + 1,
                        last_started_at = ?, last_error = NULL
                    WHERE category_path = ?
                """, (started_at, category))
            try:
                outcome = refresh_woolworths_category(category)
            except Exception as error:  # noqa: BLE001
                with catalogue_session() as connection:
                    connection.execute("""
                        UPDATE woolworths_category_collection
                        SET state = 'failed', last_error = ? WHERE category_path = ?
                    """, (str(error), category))
                continue
            enqueue_woolworths_collection_categories(outcome.get("subcategories", []))
            with catalogue_session() as connection:
                connection.execute("""
                    UPDATE woolworths_category_collection
                    SET state = 'completed', products_cached = ?, details_enriched = ?,
                        details_failed = ?, last_completed_at = ?, last_error = ?
                    WHERE category_path = ?
                """, (
                    outcome["products"], outcome["detailsEnriched"], outcome["detailsFailed"],
                    int(time.time()), outcome["detailError"], category,
                ))


_woolworths_catalogue_collector = WoolworthsCatalogueCollector()


def woolworths_cached_detail(stockcode: str) -> dict | None:
    with catalogue_session() as connection:
        row = connection.execute(
            "SELECT * FROM woolworths_products WHERE stockcode = ? LIMIT 1", (stockcode,),
        ).fetchone()
    if not row:
        return None
    result = dict(row)
    for field in ("allergens", "nutrition", "dietary_claims", "additional_images"):
        try:
            result[field] = json.loads(result[field]) if result[field] else None
        except json.JSONDecodeError:
            result[field] = None
    return result


def woolworths_cached_products(limit: int, offset: int, category_path: str | None = None) -> list[dict]:
    """Return a bounded page of verified catalogue records for controlled import.

    This endpoint deliberately returns the locally verified cache only. It must
    never trigger a live Woolworths search while Food is deciding whether an
    item is safe to attach to the canonical catalogue.
    """
    where = "WHERE category_path = ?" if category_path else ""
    parameters: tuple[object, ...] = (category_path, limit, offset) if category_path else (limit, offset)
    with catalogue_session() as connection:
        rows = connection.execute(
            f"""SELECT * FROM woolworths_products {where}
                 ORDER BY category_path, name COLLATE NOCASE, stockcode
                 LIMIT ? OFFSET ?""",
            parameters,
        ).fetchall()
    products: list[dict] = []
    for row in rows:
        product = dict(row)
        for field in ("allergens", "nutrition", "dietary_claims", "additional_images"):
            try:
                product[field] = json.loads(product[field]) if product[field] else None
            except json.JSONDecodeError:
                product[field] = None
        products.append(product)
    return products


def search_woolworths_cache(query: str, limit: int) -> list[dict]:
    terms = [term.casefold() for term in re.findall(r"[a-zA-Z0-9]+", query) if len(term) > 1]
    if not terms or not os.path.exists(WOOLWORTHS_CATALOGUE_DB):
        return []
    identifier = clean_identifier(query)
    where = "(stockcode = ? OR barcode = ?) OR (" + " AND ".join("search_text LIKE ?" for _ in terms) + ")"
    with catalogue_session() as connection:
        rows = connection.execute(
            f"SELECT * FROM woolworths_products WHERE {where} ORDER BY in_stock DESC, refreshed_at DESC LIMIT ?",
            (identifier, identifier, *[f"%{term}%" for term in terms], limit),
        ).fetchall()
    return normalise_products("Woolworths", [{
        "name": row["name"], "price": row["price"], "wasPrice": row["was_price"],
        "promotion": row["unit_price"], "packSize": row["pack_size"], "unit": row["pack_size"],
        "barcode": row["barcode"], "imageUrl": row["image_url"], "productId": row["stockcode"],
    } for row in rows], limit)


def search_woolworths(query: str, limit: int) -> list[dict]:
    global _woolworths_unavailable_until
    cleaned_query = clean_search_query(query)
    if not cleaned_query:
        return []
    cached = search_woolworths_cache(cleaned_query, limit)
    if cached:
        return cached
    with _woolworths_circuit_lock:
        unavailable_for = _woolworths_unavailable_until - time.monotonic()
    if unavailable_for > 0:
        raise RuntimeError(f"search temporarily unavailable after timeout; retry in {round(unavailable_for)}s")
    try:
        payload = woolworths_browser().search(cleaned_query, limit)
    except (TimeoutError, socket.timeout, RuntimeError) as error:
        with _woolworths_circuit_lock:
            _woolworths_unavailable_until = time.monotonic() + WOOLWORTHS_CIRCUIT_SECONDS
        raise RuntimeError(
            f"browser search failed ({error}); circuit open for {WOOLWORTHS_CIRCUIT_SECONDS}s"
        ) from None
    with _woolworths_circuit_lock:
        _woolworths_unavailable_until = 0.0
    products = []
    for source in woolworths_product_nodes(payload):
        products.append({
            "name": source.get("DisplayName") or source.get("Name"),
            "price": source.get("Price") or source.get("InstorePrice") or source.get("WasPrice"),
            "wasPrice": source.get("WasPrice"),
            "promotion": source.get("Promotion") or source.get("CupString"),
            "packSize": source.get("PackageSize"),
            "unit": source.get("PackageSize") or source.get("Unit"),
            "barcode": source.get("Barcode") or source.get("Gtin"),
            "imageUrl": source.get("MediumImageFile") or source.get("LargeImageFile"),
            "productId": source.get("Stockcode"),
        })
    return normalise_products("Woolworths", products, limit)


WOOLWORTHS_STORE_LOCATOR_URL = (
    "https://contact.woolworths.com.au/storelocator/service"
)


def woolworths_stores(
    postcode: str,
    limit: int,
    latitude: float | None = None,
    longitude: float | None = None,
) -> list[dict]:
    """Return nearby Woolworths stores in the official locator's distance order."""
    if latitude is None and (not postcode.isdigit() or len(postcode) != 4):
        raise ValueError("postcode must be a four-digit Australian postcode")

    location_path = (
        f"latitude/{latitude}/longitude/{longitude}"
        if latitude is not None and longitude is not None
        else f"postcode/{quote(postcode)}"
    )
    url = f"{WOOLWORTHS_STORE_LOCATOR_URL}/proximity/SUPERMARKETS/{location_path}/range/50/max/{limit}"
    request = Request(
        url,
        headers={
            "Accept": "application/xml, text/xml;q=0.9, */*;q=0.1",
            "User-Agent": "Food price location resolver/1.0",
        },
    )
    with urlopen(request, timeout=10) as response:
        root = ET.fromstring(response.read())

    stores: list[dict] = []
    for rank in root.findall(".//{*}storeRank"):
        detail = rank.find("{*}storeDetail")
        if detail is None:
            continue

        store_id = clean_text(detail.findtext("{*}no"))
        name = clean_text(detail.findtext("{*}name"))
        if not store_id or not name:
            continue

        stores.append({
            "retailer": "Woolworths",
            "storeId": store_id,
            "name": name,
            "address": ", ".join(
                part for part in (
                    clean_text(detail.findtext("{*}addressLine1")),
                    clean_text(detail.findtext("{*}addressLine2")),
                    clean_text(detail.findtext("{*}suburb")),
                    clean_text(detail.findtext("{*}state")),
                    clean_text(detail.findtext("{*}postcode")),
                ) if part
            ),
            "postcode": clean_text(detail.findtext("{*}postcode")),
            "latitude": clean_coordinate(detail.findtext("{*}latitude")),
            "longitude": clean_coordinate(detail.findtext("{*}longtitude")),
            "distanceKm": clean_price(rank.findtext("{*}distance")),
        })
    return stores


COLES_STORE_LOCATOR_URL = "https://locator.coles.com.au/services/storelocator.asmx"
COLES_SOAP_NAMESPACE = "http://locator.coles.com.au/services/"
COLES_STORE_GRAPHQL_URL = "https://www.coles.com.au/api/graphql"


def coles_store_graphql(query: str, variables: dict, operation_name: str) -> dict:
    api_key = os.getenv("COLES_STORE_LOCATOR_API_KEY") or os.getenv("COLES_API_KEY")
    if not api_key:
        raise RuntimeError("Coles store locator API key is not configured")

    request = Request(
        COLES_STORE_GRAPHQL_URL,
        data=json.dumps({
            "query": query,
            "variables": variables,
            "operationName": operation_name,
        }).encode("utf-8"),
        headers={
            "Accept": "application/json",
            "Content-Type": "application/json",
            "User-Agent": "Food price location resolver/1.0",
            "dsch-channel": "coles.online.1site.desktop",
            "ocp-apim-subscription-key": api_key,
        },
    )
    with urlopen(request, timeout=10) as response:
        payload = json.loads(response.read())
    if payload.get("errors"):
        raise RuntimeError(payload["errors"][0].get("message") or "Coles store locator query failed")
    return payload.get("data") or {}


def coles_graphql_stores(
    postcode: str,
    limit: int,
    latitude: float | None,
    longitude: float | None,
) -> list[dict]:
    if latitude is None or longitude is None:
        locality_data = coles_store_graphql(
            """query GetStoreLocationSuggestions($term: String!, $count: Int) {
              localitySearch(term: $term, count: $count) {
                results { postcode state suburb latitude longitude }
              }
            }""",
            {"term": postcode, "count": 10},
            "GetStoreLocationSuggestions",
        )
        localities = ((locality_data.get("localitySearch") or {}).get("results") or [])
        locality = next((item for item in localities if str(item.get("postcode")) == postcode), None)
        if not locality:
            return []
        latitude = clean_coordinate(locality.get("latitude"))
        longitude = clean_coordinate(locality.get("longitude"))
        if latitude is None or longitude is None:
            return []

    store_data = coles_store_graphql(
        """query FindStores($latitude: Float!, $longitude: Float!, $brandIds: [BrandId!], $count: Float!, $distance: Float) {
          stores(latitude: $latitude, longitude: $longitude, brandIds: $brandIds, count: $count, distance: $distance, isTrading: true) {
            results {
              distance
              store {
                id name
                address { state suburb addressLine postcode }
                position { latitude longitude }
                brand { id }
              }
            }
          }
        }""",
        {
            "latitude": latitude,
            "longitude": longitude,
            "brandIds": ["COL"],
            "count": float(limit),
            "distance": 50000.0,
        },
        "FindStores",
    )

    stores: list[dict] = []
    for result in ((store_data.get("stores") or {}).get("results") or []):
        store = result.get("store") or {}
        if store.get("brand", {}).get("id") != "COL":
            continue
        store_id = clean_identifier(store.get("id"))
        name = clean_text(store.get("name"))
        if store_id and ":" in store_id:
            store_id = store_id.split(":", 1)[1]
        if not store_id or not name:
            continue
        address = store.get("address") or {}
        position = store.get("position") or {}
        stores.append({
            "retailer": "Coles",
            "storeId": store_id,
            "name": name,
            "address": ", ".join(
                part for part in (
                    clean_text(address.get("addressLine")),
                    clean_text(address.get("suburb")),
                    clean_text(address.get("state")),
                    clean_text(address.get("postcode")),
                ) if part
            ),
            "postcode": clean_text(address.get("postcode")),
            "latitude": clean_coordinate(position.get("latitude")),
            "longitude": clean_coordinate(position.get("longitude")),
            "distanceKm": clean_price(result.get("distance")),
        })
    return stores


def coles_locator_request(action: str, body: str) -> ET.Element:
    payload = f"""<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>{body}</soap:Body>
</soap:Envelope>""".encode("utf-8")
    request = Request(
        COLES_STORE_LOCATOR_URL,
        data=payload,
        headers={
            "Content-Type": "text/xml; charset=utf-8",
            "SOAPAction": f'"{COLES_SOAP_NAMESPACE}{action}"',
            "User-Agent": "Food price location resolver/1.0",
        },
    )
    with urlopen(request, timeout=10) as response:
        return ET.fromstring(response.read())


def coles_stores(
    postcode: str,
    limit: int,
    latitude: float | None = None,
    longitude: float | None = None,
) -> list[dict]:
    """Resolve nearby Coles supermarkets from the official public store locator."""
    if latitude is None and (not postcode.isdigit() or len(postcode) != 4):
        raise ValueError("postcode must be a four-digit Australian postcode")

    if os.getenv("COLES_STORE_LOCATOR_API_KEY") or os.getenv("COLES_API_KEY"):
        return coles_graphql_stores(postcode, limit, latitude, longitude)

    if latitude is None or longitude is None:
        locality_root = coles_locator_request(
            "GetLocalitySuggestions",
            f'<GetLocalitySuggestions xmlns="{COLES_SOAP_NAMESPACE}"><term>{postcode}</term></GetLocalitySuggestions>',
        )
        locality = next(
            (
                item for item in locality_root.findall(".//{*}Locality")
                if clean_text(item.findtext("{*}Postcode")) == postcode
            ),
            None,
        )
        if locality is None:
            return []

        latitude = clean_coordinate(locality.findtext("{*}Latitude"))
        longitude = clean_coordinate(locality.findtext("{*}Longitude"))
        if latitude is None or longitude is None:
            return []

    stores_root = coles_locator_request(
        "GetLocationByMaxDistance",
        (
            f'<GetLocationByMaxDistance xmlns="{COLES_SOAP_NAMESPACE}">'
            f"<latitude>{latitude}</latitude><longitude>{longitude}</longitude>"
            "<brandIDs><string>2</string></brandIDs></GetLocationByMaxDistance>"
        ),
    )
    stores: list[dict] = []
    for location in stores_root.findall(".//{*}Location"):
        store_id = clean_text(location.findtext("{*}StoreID"))
        name = clean_text(location.findtext("{*}StoreName"))
        if not store_id or not name:
            continue
        stores.append({
            "retailer": "Coles",
            "storeId": store_id,
            "name": name,
            "address": ", ".join(
                part for part in (
                    clean_text(location.findtext("{*}Address")),
                    clean_text(location.findtext("{*}Suburb")),
                    clean_text(location.findtext("{*}State")),
                    clean_text(location.findtext("{*}Postcode")),
                ) if part
            ),
            "postcode": clean_text(location.findtext("{*}Postcode")),
            "latitude": clean_coordinate(location.findtext("{*}Latitude")),
            "longitude": clean_coordinate(location.findtext("{*}Longitude")),
            "distanceKm": clean_price(location.findtext("{*}Distance")),
        })
        if len(stores) >= limit:
            break
    return stores


class Handler(BaseHTTPRequestHandler):
    server_version = "FoodGroceryBridge/1.2"

    def send_json(self, status: int, payload: dict) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:  # noqa: N802
        parsed = urlparse(self.path)
        if parsed.path == "/health":
            self.send_json(200, {"status": "ok", "version": "1.3"})
            return

        params = parse_qs(parsed.query)
        if parsed.path == "/woolworths/catalogue/status":
            acquisition_mode = "verified-browser" if WOOLWORTHS_CDP_URL else "unconfigured"
            collection = woolworths_collection_status()
            if not os.path.exists(WOOLWORTHS_CATALOGUE_DB):
                self.send_json(200, {
                    "status": "success", "products": 0, "categories": 0, "lastRefreshedAt": None,
                    "acquisitionMode": acquisition_mode, "detailedProducts": 0,
                    "detailFailures": 0, "lastDetailRefreshedAt": None, "collection": collection,
                })
                return
            with catalogue_session() as connection:
                row = connection.execute(
                    """SELECT COUNT(*) products, COUNT(DISTINCT category_path) categories,
                              MAX(refreshed_at) refreshed_at,
                              COUNT(*) FILTER (WHERE detail_refreshed_at IS NOT NULL) detailed_products,
                              COUNT(*) FILTER (WHERE detail_error IS NOT NULL) detail_failures,
                              MAX(detail_refreshed_at) detail_refreshed_at
                       FROM woolworths_products"""
                ).fetchone()
            self.send_json(200, {
                "status": "success", "products": row["products"], "categories": row["categories"],
                "lastRefreshedAt": row["refreshed_at"], "acquisitionMode": acquisition_mode,
                "detailedProducts": row["detailed_products"], "detailFailures": row["detail_failures"],
                "lastDetailRefreshedAt": row["detail_refreshed_at"], "collection": collection,
            })
            return
        if parsed.path == "/stores":
            retailer = (params.get("retailer") or [""])[0].strip().lower()
            postcode = (params.get("postcode") or [""])[0].strip()
            if retailer not in ("coles", "woolworths"):
                self.send_json(400, {"status": "error", "error": "Supported retailers are Coles and Woolworths."})
                return
            try:
                limit = max(1, min(10, int((params.get("limit") or ["3"])[0])))
                latitude_text = (params.get("latitude") or [""])[0].strip()
                longitude_text = (params.get("longitude") or [""])[0].strip()
                if bool(latitude_text) != bool(longitude_text):
                    raise ValueError("latitude and longitude must be provided together")
                latitude = float(latitude_text) if latitude_text else None
                longitude = float(longitude_text) if longitude_text else None
                if latitude is not None and not -90 <= latitude <= 90:
                    raise ValueError("latitude is outside the valid range")
                if longitude is not None and not -180 <= longitude <= 180:
                    raise ValueError("longitude is outside the valid range")
                stores = (
                    coles_stores(postcode, limit, latitude, longitude)
                    if retailer == "coles"
                    else woolworths_stores(postcode, limit, latitude, longitude)
                )
            except ValueError as error:
                self.send_json(400, {"status": "error", "error": str(error)})
                return
            except Exception as error:  # noqa: BLE001
                self.send_json(502, {"status": "error", "error": f"{retailer.title()} store lookup failed: {error}"})
                return
            self.send_json(200, {"status": "success", "postcode": postcode, "stores": stores})
            return

        if parsed.path != "/search":
            if parsed.path == "/woolworths/catalogue/collection/start":
                if not WOOLWORTHS_CDP_URL:
                    self.send_json(409, {"status": "error", "error": "verified browser session is not configured; set WOOLWORTHS_CDP_URL"})
                    return
                try:
                    requested_max = int((params.get("maxCategories") or ["0"])[0])
                    if requested_max < 0:
                        raise ValueError
                except ValueError:
                    self.send_json(400, {"status": "error", "error": "maxCategories must be zero or a positive whole number"})
                    return
                retry_failed = (params.get("retryFailed") or ["0"])[0].strip().lower() in ("1", "true", "yes")
                revisit_completed_roots = (params.get("revisitCompletedRoots") or ["0"])[0].strip().lower() in ("1", "true", "yes")
                started = _woolworths_catalogue_collector.start(
                    requested_max or None, retry_failed, revisit_completed_roots,
                )
                if not started:
                    self.send_json(409, {"status": "error", "error": "Woolworths catalogue collection is already running", "collection": woolworths_collection_status()})
                    return
                self.send_json(202, {
                    "status": "accepted", "maxCategories": requested_max or None,
                    "retryFailed": retry_failed, "revisitCompletedRoots": revisit_completed_roots,
                    "collection": woolworths_collection_status(),
                })
                return
            if parsed.path == "/woolworths/catalogue/collection/status":
                self.send_json(200, {"status": "success", "collection": woolworths_collection_status()})
                return
            if parsed.path == "/woolworths/catalogue/refresh":
                category = (params.get("category") or [""])[0].strip()
                try:
                    outcome = refresh_woolworths_category(category)
                except Exception as error:  # noqa: BLE001
                    self.send_json(502, {"status": "error", "error": f"Woolworths category refresh failed: {error}"})
                    return
                self.send_json(200, {"status": "success", **outcome})
                return
            if parsed.path == "/woolworths/catalogue/product":
                stockcode = clean_identifier((params.get("stockcode") or [""])[0])
                if not stockcode:
                    self.send_json(400, {"status": "error", "error": "Missing stockcode parameter"})
                    return
                product = woolworths_cached_detail(stockcode)
                if not product:
                    self.send_json(404, {"status": "error", "error": "Woolworths product is not cached"})
                    return
                self.send_json(200, {"status": "success", "product": product})
                return
            if parsed.path == "/woolworths/catalogue/products":
                try:
                    # The cache is local SQLite data. Larger bounded pages keep
                    # canonical imports practical for full retailer catalogues
                    # without making the browser acquire more data per request.
                    limit = max(1, min(1000, int((params.get("limit") or ["30"])[0])))
                    offset = max(0, int((params.get("offset") or ["0"])[0]))
                except ValueError:
                    self.send_json(400, {"status": "error", "error": "limit and offset must be whole numbers"})
                    return
                category = (params.get("category") or [""])[0].strip() or None
                products = woolworths_cached_products(limit, offset, category)
                self.send_json(200, {
                    "status": "success", "products": products, "limit": limit,
                    "offset": offset, "nextOffset": offset + len(products) if len(products) == limit else None,
                })
                return
            self.send_json(404, {"status": "error", "error": "Not found"})
            return

        query = (params.get("q") or [""])[0].strip()
        retailer = (params.get("retailer") or ["all"])[0].strip().lower()
        store_id = (params.get("storeId") or [None])[0]
        try:
            limit = max(1, min(25, int((params.get("limit") or ["10"])[0])))
        except ValueError:
            limit = 10

        if not query:
            self.send_json(400, {"status": "error", "error": "Missing q parameter"})
            return
        if retailer not in ("all", "coles", "woolworths"):
            self.send_json(400, {"status": "error", "error": "Unsupported retailer"})
            return

        results: list[dict] = []
        errors: list[str] = []

        if retailer in ("all", "coles"):
            try:
                results.extend(search_coles(query, limit, store_id))
            except Exception as error:  # noqa: BLE001
                errors.append(f"Coles: {error}")

        if retailer in ("all", "woolworths"):
            try:
                results.extend(search_woolworths(query, limit))
            except Exception as error:  # noqa: BLE001
                errors.append(f"Woolworths: {error}")

        self.send_json(
            200,
            {
                "status": "success",
                "query": query,
                "results": results,
                "errors": errors,
            },
        )

    def log_message(self, format: str, *args: object) -> None:
        print(f"grocery-mcp {self.address_string()} {format % args}", flush=True)


if __name__ == "__main__":
    recover_woolworths_category_collection()
    server = ThreadingHTTPServer(("0.0.0.0", PORT), Handler)
    print(f"Food grocery MCP bridge listening on {PORT}", flush=True)
    server.serve_forever()
