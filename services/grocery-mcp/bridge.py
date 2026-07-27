import asyncio
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


def clean_product(retailer: str, item: dict) -> dict:
    return {
        "retailer": retailer,
        "name": item.get("name") or "",
        "price": item.get("price"),
        "unit": item.get("unit"),
        "store": item.get("store") or retailer,
        "barcode": item.get("barcode"),
        "imageUrl": item.get("image") or item.get("imageUrl"),
        "productId": item.get("id") or item.get("productId") or item.get("sku"),
        "raw": item,
    }


def search_coles(query: str, limit: int, store_id: str | None) -> list[dict]:
    result = coles_search_products(query=query, store_id=store_id or COLES_DEFAULT_STORE_ID)
    if result.get("status") == "error":
        raise RuntimeError(result.get("message") or "Coles search failed")
    products = coles_extract_products(result)
    return [clean_product("Coles", item) for item in products[:limit]]


def search_woolworths(query: str, limit: int) -> list[dict]:
    result = woolworths_search_products(query=query)
    if result.get("status") == "error":
        raise RuntimeError(result.get("message") or "Woolworths search failed")
    products = result.get("products", [])
    return [clean_product("Woolworths", item) for item in products[:limit]]


class Handler(BaseHTTPRequestHandler):
    server_version = "FoodGroceryBridge/1.0"

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
            self.send_json(200, {"status": "ok"})
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
