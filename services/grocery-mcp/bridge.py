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


def nested_value(item: object, keys: tuple[str, ...]) -> object | None:
    """Find a named field in retailer payloads that move metadata into nested objects."""
    wanted = {key.casefold() for key in keys}
    if isinstance(item, dict):
        for key, value in item.items():
            if key.casefold() in wanted and value is not None:
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

        pack_size = nested_text(source, ("packageSize", "package_size", "packSize", "size", "quantity"))
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


def search_woolworths(query: str, limit: int) -> list[dict]:
    result = woolworths_search_products(query=query)
    if result.get("status") == "error":
        raise RuntimeError(result.get("message") or "Woolworths search failed")
    return normalise_products("Woolworths", result.get("products", []), limit)


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
