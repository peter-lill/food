"""Hierarchical retailer catalogue scanner.

This is intentionally a catalogue-evidence pass.  It refreshes retailer caches
using the deepest public category paths we can discover, but it never edits
Food's canonical Product.category values.

Examples:
  python scan_retailer_taxonomy.py --retailer aldi --max-categories 5
  python scan_retailer_taxonomy.py --retailer coles --root /browse/pantry --max-categories 5
  python scan_retailer_taxonomy.py --retailer drakes --store 087 --max-categories 5
"""

from __future__ import annotations

import argparse
import json
import os
from collections import deque
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import urlopen

from aldi_catalogue import ALDI_PRODUCTS_URL, AldiCatalogueSession
from coles_catalogue import COLES_BROWSER_FETCH_URL, COLES_ROOT_CATEGORIES, ColesBrowserSession
from drakes_catalogue import DrakesCatalogueSession, sidebar_data_url, valid_store_id
from retailer_taxonomy import aldi_category_nodes, coles_browse_paths, drakes_sidebar_nodes


def _browser_next_data(url: str) -> str:
    if not COLES_BROWSER_FETCH_URL:
        raise RuntimeError("Coles browser fetch URL is not configured for this process")
    request_url = f"{COLES_BROWSER_FETCH_URL}?{urlencode({'url': url})}"
    try:
        with urlopen(request_url, timeout=90) as response:
            payload = json.loads(response.read())
    except HTTPError as error:
        raise RuntimeError(f"Coles browser session returned HTTP {error.code}") from error
    except (URLError, json.JSONDecodeError, UnicodeDecodeError) as error:
        raise RuntimeError("Coles browser session did not return valid catalogue data") from error
    if payload.get("status") != "success" or not isinstance(payload.get("nextData"), str):
        raise RuntimeError(payload.get("error") or "Coles browser session did not expose Next data")
    return payload["nextData"]


def scan_coles(root: str | None, max_categories: int | None) -> dict:
    roots = [root] if root else list(COLES_ROOT_CATEGORIES)
    for category in roots:
        if category not in COLES_ROOT_CATEGORIES:
            raise ValueError(f"Unknown Coles root: {category}")

    queue: deque[str] = deque(roots)
    queued = set(roots)
    completed: list[str] = []
    failures: list[dict[str, str]] = []
    session = ColesBrowserSession()

    while queue and (max_categories is None or len(completed) < max_categories):
        category = queue.popleft()
        try:
            products = session.browse(category, resume=True)
            raw = _browser_next_data(f"https://www.coles.com.au{category}")
            children = coles_browse_paths(raw, category)
        except Exception as error:  # noqa: BLE001
            failures.append({"category": category, "error": str(error)})
            continue
        completed.append(category)
        print(f"Coles {category}: {products} cached products; {len(children)} child paths discovered.")
        for child in children:
            if child not in queued:
                queue.append(child)
                queued.add(child)

    return {
        "retailer": "Coles",
        "completedCategories": len(completed),
        "discoveredCategories": len(queued),
        "failedCategories": failures,
        "remainingCategories": len(queue),
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
