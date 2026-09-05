"""Hierarchical retailer catalogue scanner.

This is intentionally a catalogue-evidence pass. It refreshes retailer caches
using the deepest public category paths we can discover, but it never edits
Food's canonical Product.category values.
"""

from __future__ import annotations

import argparse
import json
import os
import time
from collections import deque
from http.client import RemoteDisconnected
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import urlopen

from aldi_catalogue import ALDI_PRODUCTS_URL, AldiCatalogueSession
from catalogue_taxonomy_evidence import record_coles_category_observations, coles_taxonomy_evidence_status
from drakes_catalogue import DrakesCatalogueSession, sidebar_data_url, valid_store_id
from retailer_taxonomy import aldi_category_nodes, coles_browse_paths, drakes_sidebar_nodes


COLES_ROOT_CATEGORIES = (
    "/browse/meat-seafood", "/browse/fruit-vegetables", "/browse/dairy-eggs-fridge",
    "/browse/bakery", "/browse/deli", "/browse/pantry", "/browse/dietary-world-foods",
    "/browse/chips-chocolates-snacks", "/browse/drinks", "/browse/frozen",
    "/browse/cleaning-laundry", "/browse/health-beauty", "/browse/baby",
    "/browse/pet", "/browse/home-garden",
)
COLES_BROWSER_FETCH_URL = os.getenv(
    "COLES_BROWSER_FETCH_URL", os.getenv("COLES_FIREFOX_FETCH_URL", "http://127.0.0.1:8788/fetch")
).strip()
GROCERY_MCP_BRIDGE_URL = os.getenv("GROCERY_MCP_BRIDGE_URL", "http://127.0.0.1:8790").rstrip("/")


def _json_get(url: str, timeout: int = 120, attempts: int = 3) -> dict:
    """Read one local catalogue endpoint with bounded transient retries."""
    last_error: Exception | None = None
    for attempt in range(1, attempts + 1):
        try:
            with urlopen(url, timeout=timeout) as response:
                payload = json.loads(response.read())
        except HTTPError as error:
            try:
                detail = json.loads(error.read())
            except (json.JSONDecodeError, UnicodeDecodeError):
                detail = {}
            message = detail.get("error") if isinstance(detail, dict) else None
            raise RuntimeError(message or f"HTTP {error.code} from catalogue service") from error
        except (URLError, RemoteDisconnected, ConnectionResetError, TimeoutError) as error:
            last_error = error
            if attempt == attempts:
                raise RuntimeError(f"Catalogue service connection failed after {attempts} attempts: {error}") from error
            time.sleep(2 * attempt)
            continue
        except (json.JSONDecodeError, UnicodeDecodeError) as error:
            raise RuntimeError("Catalogue service did not return valid JSON") from error
        if not isinstance(payload, dict):
            raise RuntimeError("Catalogue service returned an invalid response")
        return payload
    raise RuntimeError(f"Catalogue service connection failed: {last_error}")


def _wait_for_coles_services(timeout_seconds: int = 120) -> None:
    """Wait until both the bridge and Coles browser health endpoints respond."""
    deadline = time.monotonic() + timeout_seconds
    pending = {
        "grocery bridge": f"{GROCERY_MCP_BRIDGE_URL}/health",
        "Coles browser": COLES_BROWSER_FETCH_URL.rsplit("/fetch", 1)[0] + "/health",
    }
    while pending and time.monotonic() < deadline:
        for name, url in list(pending.items()):
            try:
                payload = _json_get(url, timeout=5, attempts=1)
            except RuntimeError:
                continue
            if payload.get("status") in ("ok", "success"):
                pending.pop(name, None)
        if pending:
            time.sleep(2)
    if pending:
        raise RuntimeError(f"Timed out waiting for {', '.join(pending)} to become healthy")


def _browser_next_data(url: str) -> str:
    if not COLES_BROWSER_FETCH_URL:
        raise RuntimeError("Coles browser fetch URL is not configured for this process")
    request_url = f"{COLES_BROWSER_FETCH_URL}?{urlencode({'url': url})}"
    payload = _json_get(request_url, 90)
    if payload.get("status") != "success" or not isinstance(payload.get("nextData"), str):
        raise RuntimeError(payload.get("error") or "Coles browser session did not expose Next data")
    return payload["nextData"]


def _refresh_coles_category(category: str) -> int:
    query = urlencode({"category": category, "resume": "true"})
    payload = _json_get(f"{GROCERY_MCP_BRIDGE_URL}/coles/catalogue/refresh?{query}", 300)
    if payload.get("status") != "success":
        raise RuntimeError(payload.get("error") or "Coles category refresh failed")
    products = payload.get("products")
    if not isinstance(products, int):
        raise RuntimeError("Coles category refresh did not return a product count")
    return products


def _discover_coles_children(category: str) -> list[str]:
    """Inspect one verified browse page without crawling its product pagination."""
    raw = _browser_next_data(f"https://www.coles.com.au{category}")
    return coles_browse_paths(raw, category)


def scan_coles(root: str | None, max_categories: int | None) -> dict:
    roots = [root] if root else list(COLES_ROOT_CATEGORIES)
    for category in roots:
        if category not in COLES_ROOT_CATEGORIES:
            raise ValueError(f"Unknown Coles root: {category}")

    _wait_for_coles_services()

    # Root pages are discovery nodes. Do not refresh their broad product sets
    # when they expose deeper retailer categories: taxonomy evidence is much
    # more useful when collected from the deepest available browse paths.
    queue: deque[str] = deque()
    queued: set[str] = set()
    discovery_failures: list[dict[str, str]] = []
    discovery_nodes = 0
    for category in roots:
        try:
            children = _discover_coles_children(category)
        except Exception as error:  # noqa: BLE001
            discovery_failures.append({"category": category, "error": str(error)})
            continue
        discovery_nodes += 1
        print(f"Coles {category}: discovery only; {len(children)} child paths discovered.")
        targets = children or [category]
        for target in targets:
            if target not in queued:
                queue.append(target)
                queued.add(target)

    completed: list[str] = []
    failures: list[dict[str, str]] = list(discovery_failures)
    discovered = set(queued)

    while queue and (max_categories is None or len(completed) < max_categories):
        category = queue.popleft()
        try:
            children = _discover_coles_children(category)
            # A category that exposes deeper descendants remains a discovery
            # node. Queue those descendants instead of crawling all products
            # at the broader level.
            if children:
                print(f"Coles {category}: discovery only; {len(children)} child paths discovered.")
                for child in children:
                    if child not in discovered:
                        queue.append(child)
                        discovered.add(child)
                continue

            products = _refresh_coles_category(category)
            evidence = record_coles_category_observations(category)
        except Exception as error:  # noqa: BLE001
            failures.append({"category": category, "error": str(error)})
            continue

        completed.append(category)
        print(
            f"Coles {category}: leaf category; {products} cached products; "
            f"{evidence['productsObserved']} taxonomy observations."
        )

    return {
        "retailer": "Coles",
        "completedCategories": len(completed),
        "discoveryNodes": discovery_nodes,
        "discoveredCategories": len(discovered),
        "failedCategories": failures,
        "remainingCategories": len(queue),
        "taxonomyEvidence": coles_taxonomy_evidence_status(),
    }


def scan_aldi(max_categories: int | None) -> dict:
    session = AldiCatalogueSession()
    first_document = session.read(ALDI_PRODUCTS_URL)
    queue: deque[str] = deque(node.path for node in aldi_category_nodes(first_document))
    queued = set(queue)
    completed: list[str] = []
    failures: list[dict[str, str]] = []

    while queue and (max_categories is None or len(completed) < max_categories):
        category = queue.popleft()
        try:
            outcome = session.refresh(category)
            document = session.read(f"https://www.aldi.com.au{category}")
            children = aldi_category_nodes(document)
        except Exception as error:  # noqa: BLE001
            failures.append({"category": category, "error": str(error)})
            continue
        completed.append(category)
        print(f"ALDI {category}: {outcome['products']} cached products; {len(children)} category links observed.")
        for child in children:
            if child.path not in queued:
                queue.append(child.path)
                queued.add(child.path)

    return {
        "retailer": "ALDI",
        "completedCategories": len(completed),
        "discoveredCategories": len(queued),
        "failedCategories": failures,
        "remainingCategories": len(queue),
    }


def scan_drakes(store_id: str, max_categories: int | None) -> dict:
    store = valid_store_id(store_id)
    session = DrakesCatalogueSession()
    home = session.read(f"https://{store}.drakes.com.au/")
    sidebar_url = sidebar_data_url(home)
    if not sidebar_url:
        raise RuntimeError("Drakes did not expose its category sidebar data URL")
    nodes = drakes_sidebar_nodes(session.read(sidebar_url))
    queue = deque(node.path for node in nodes)
    completed: list[str] = []
    failures: list[dict[str, str]] = []

    while queue and (max_categories is None or len(completed) < max_categories):
        category = queue.popleft()
        try:
            outcome = session.refresh(store, category_path=category)
        except Exception as error:  # noqa: BLE001
            failures.append({"category": category, "error": str(error)})
            continue
        completed.append(category)
        print(f"Drakes {category}: {outcome['products']} cached products.")

    return {
        "retailer": "Drakes",
        "storeId": store,
        "completedCategories": len(completed),
        "discoveredCategories": len(nodes),
        "failedCategories": failures,
        "remainingCategories": len(queue),
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--retailer", required=True, choices=("coles", "aldi", "drakes", "woolworths"))
    parser.add_argument("--root")
    parser.add_argument("--store")
    parser.add_argument("--max-categories", type=int)
    args = parser.parse_args()
    maximum = args.max_categories if args.max_categories and args.max_categories > 0 else None

    if args.retailer == "coles":
        summary = scan_coles(args.root, maximum)
    elif args.retailer == "aldi":
        summary = scan_aldi(maximum)
    elif args.retailer == "drakes":
        if not args.store:
            raise SystemExit("--store is required for Drakes")
        summary = scan_drakes(args.store, maximum)
    else:
        summary = {
            "retailer": "Woolworths",
            "status": "managed-by-existing-recursive-bridge-collector",
            "note": "Woolworths already discovers and enqueues subcategories during its catalogue collection.",
        }

    print(json.dumps(summary, indent=2))
    print("Catalogue taxonomy evidence refreshed. Food canonical classifications were not changed.")


if __name__ == "__main__":
    main()
