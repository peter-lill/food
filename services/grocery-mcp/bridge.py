import json
import os
import sys
import xml.etree.ElementTree as ET
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, quote, urlparse
from urllib.request import Request, urlopen

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


WOOLWORTHS_STORE_LOCATOR_URL = (
    "https://contact.woolworths.com.au/storelocator/service"
)


def woolworths_stores(postcode: str, limit: int) -> list[dict]:
    """Return nearby Woolworths stores in the official locator's distance order."""
    if not postcode.isdigit() or len(postcode) != 4:
        raise ValueError("postcode must be a four-digit Australian postcode")

    url = (
        f"{WOOLWORTHS_STORE_LOCATOR_URL}/proximity/SUPERMARKETS/"
        f"postcode/{quote(postcode)}/range/50/max/{limit}"
    )
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
    for rank in root.findall(".//storeRank"):
        detail = rank.find("storeDetail")
        if detail is None:
            continue

        store_id = clean_text(detail.findtext("no"))
        name = clean_text(detail.findtext("name"))
        if not store_id or not name:
            continue

        stores.append({
            "retailer": "Woolworths",
            "storeId": store_id,
            "name": name,
            "address": ", ".join(
                part for part in (
                    clean_text(detail.findtext("addressLine1")),
                    clean_text(detail.findtext("addressLine2")),
                    clean_text(detail.findtext("suburb")),
                    clean_text(detail.findtext("state")),
                    clean_text(detail.findtext("postcode")),
                ) if part
            ),
            "postcode": clean_text(detail.findtext("postcode")),
            "latitude": clean_coordinate(detail.findtext("latitude")),
            "longitude": clean_coordinate(detail.findtext("longtitude")),
            "distanceKm": clean_price(rank.findtext("distance")),
        })
    return stores


COLES_STORE_LOCATOR_URL = "https://locator.coles.com.au/services/storelocator.asmx"
COLES_SOAP_NAMESPACE = "http://locator.coles.com.au/services/"


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


def coles_stores(postcode: str, limit: int) -> list[dict]:
    """Resolve nearby Coles supermarkets from the official public store locator."""
    if not postcode.isdigit() or len(postcode) != 4:
        raise ValueError("postcode must be a four-digit Australian postcode")

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

    latitude = clean_text(locality.findtext("{*}Latitude"))
    longitude = clean_text(locality.findtext("{*}Longitude"))
    if not latitude or not longitude:
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
        if parsed.path == "/stores":
            retailer = (params.get("retailer") or [""])[0].strip().lower()
            postcode = (params.get("postcode") or [""])[0].strip()
            if retailer not in ("coles", "woolworths"):
                self.send_json(400, {"status": "error", "error": "Supported retailers are Coles and Woolworths."})
                return
            try:
                limit = max(1, min(10, int((params.get("limit") or ["3"])[0])))
                stores = coles_stores(postcode, limit) if retailer == "coles" else woolworths_stores(postcode, limit)
            except ValueError as error:
                self.send_json(400, {"status": "error", "error": str(error)})
                return
            except Exception as error:  # noqa: BLE001
                self.send_json(502, {"status": "error", "error": f"{retailer.title()} store lookup failed: {error}"})
                return
            self.send_json(200, {"status": "success", "postcode": postcode, "stores": stores})
            return

        if parsed.path != "/search":
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
    server = ThreadingHTTPServer(("0.0.0.0", PORT), Handler)
    print(f"Food grocery MCP bridge listening on {PORT}", flush=True)
    server.serve_forever()
