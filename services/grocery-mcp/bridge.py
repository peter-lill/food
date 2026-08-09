import json
import os
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

sys.path.insert(0, "/opt/grocery-mcp/upstream")

from src.supermarkets import (  # noqa: E402
    COLES_DEFAULT_STORE_ID,
    coles_search_products,
    woolworths_search_products,
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

        brand = first_text(source, ("brand", "brandName", "manufacturer"))
        if brand and brand.casefold() not in name.casefold():
            name = f"{brand} {name}"

        pack_size = first_text(source, ("packageSize", "package_size", "size", "quantity"))
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
            "store": "coles",
            "barcode": first_identifier(source, ("barcode", "gtin", "ean", "upc")),
            "imageUrl": first_text(source, ("imageUrl", "image", "imageURL", "thumbnailUrl")),
            "productId": first_identifier(source, ("id", "productId", "sku", "productCode")),
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


def search_woolworths(query: str, limit: int) -> list[dict]:
    result = woolworths_search_products(query=query)
    if result.get("status") == "error":
        raise RuntimeError(result.get("message") or "Woolworths search failed")
    return normalise_products("Woolworths", result.get("products", []), limit)


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
            self.send_json(200, {"status": "ok", "version": "1.2"})
            return

        if parsed.path != "/search":
            self.send_json(404, {"status": "error", "error": "Not found"})
            return

        params = parse_qs(parsed.query)
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
    server = ThreadingHTTPServer(("0.0.0.0", PORT), Handler)
    print(f"Food grocery MCP bridge listening on {PORT}", flush=True)
    server.serve_forever()
