import json
import os
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

sys.path.insert(0, "/opt/grocery-mcp/upstream")

from src.supermarkets import (  # noqa: E402
    COLES_DEFAULT_STORE_ID,
    coles_extract_products,
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


def clean_product(retailer: str, item: dict) -> dict | None:
    name = clean_text(item.get("name"))
    price = clean_price(item.get("price"))
    if not name or price is None:
        return None

    return {
        "retailer": retailer,
        "name": name,
        "price": price,
        "unit": clean_text(item.get("unit")),
        "store": clean_text(item.get("store")) or retailer.lower(),
        "barcode": clean_text(item.get("barcode")),
        "imageUrl": clean_text(item.get("image")) or clean_text(item.get("imageUrl")),
        "productId": (
            clean_text(item.get("id"))
            or clean_text(item.get("productId"))
            or clean_text(item.get("sku"))
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
    return normalise_products("Coles", coles_extract_products(result), limit)


def search_woolworths(query: str, limit: int) -> list[dict]:
    result = woolworths_search_products(query=query)
    if result.get("status") == "error":
        raise RuntimeError(result.get("message") or "Woolworths search failed")
    return normalise_products("Woolworths", result.get("products", []), limit)


class Handler(BaseHTTPRequestHandler):
    server_version = "FoodGroceryBridge/1.1"

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
            self.send_json(200, {"status": "ok", "version": "1.1"})
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
