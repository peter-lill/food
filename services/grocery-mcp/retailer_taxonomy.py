"""Shared retailer taxonomy extraction helpers.

These helpers keep retailer navigation evidence separate from Food's canonical
product taxonomy.  Collectors can preserve the deepest public retailer path
without treating that path as an instruction to reclassify a Food product.
"""

from __future__ import annotations

import html
import json
import re
from dataclasses import dataclass
from typing import Any, Iterable


@dataclass(frozen=True)
class RetailerTaxonomyNode:
    retailer: str
    path: str
    label: str | None
    parent_path: str | None
    depth: int


def _clean(value: object) -> str | None:
    if not isinstance(value, str):
        return None
    value = re.sub(r"<[^>]+>", " ", html.unescape(value))
    return " ".join(value.split()) or None


def _normalise_path(value: str) -> str:
    path = html.unescape(value).replace("\\u002F", "/").replace("\\/", "/")
    path = path.split("?", 1)[0].split("#", 1)[0].rstrip("/")
    return path or "/"


def _path_depth(path: str) -> int:
    return len([segment for segment in path.split("/") if segment])


def deepest_paths(paths: Iterable[str]) -> list[str]:
    """Return unique paths ordered deepest-first, then lexically."""
    unique = {_normalise_path(path) for path in paths if isinstance(path, str) and path.strip()}
    return sorted(unique, key=lambda path: (-_path_depth(path), path.casefold()))


def leaf_paths(paths: Iterable[str]) -> list[str]:
    """Return paths which have no deeper descendant in the same URL hierarchy.

    Collectors use this when a retailer exposes hierarchy through nested public
    URL paths. Parent paths are navigation evidence only, never product jobs.
    """
    unique = {_normalise_path(path) for path in paths if isinstance(path, str) and path.strip()}
    return sorted(
        (path for path in unique if not any(other.startswith(f"{path}/") for other in unique if other != path)),
        key=str.casefold,
    )


def coles_browse_paths(raw_next_data: str, parent_path: str | None = None) -> list[str]:
    """Extract Coles browse paths from verified ``__NEXT_DATA__`` JSON.

    The verified browser remains responsible for acquiring the page.  This
    function only inspects the already-acquired document and never attempts to
    bypass browser verification itself.
    """
    try:
        document = json.loads(raw_next_data)
    except json.JSONDecodeError as error:
        raise ValueError("Coles browse document is not valid JSON") from error

    paths: set[str] = set()
    pending: list[object] = [document]
    while pending:
        value = pending.pop()
        if isinstance(value, dict):
            pending.extend(value.values())
        elif isinstance(value, list):
            pending.extend(value)
        elif isinstance(value, str):
            decoded = value.replace("\\u002F", "/").replace("\\/", "/")
            for match in re.finditer(r"/browse/[a-z0-9-]+(?:/[a-z0-9-]+)+", decoded, re.I):
                path = _normalise_path(match.group(0))
                if parent_path:
                    parent = _normalise_path(parent_path)
                    if path == parent or not path.startswith(f"{parent}/"):
                        continue
                paths.add(path)
    return deepest_paths(paths)


def aldi_category_nodes(document: str) -> list[RetailerTaxonomyNode]:
    """Extract all public ALDI category links present in a rendered page."""
    nodes: dict[str, RetailerTaxonomyNode] = {}
    pattern = re.compile(
        r'<a\s+[^>]*href="(?P<href>/products/[^"?#]+/k/\d+)[^"]*"[^>]*>(?P<label>.*?)</a>',
        re.I | re.S,
    )
    for match in pattern.finditer(document):
        path = _normalise_path(match.group("href"))
        label = _clean(match.group("label"))
        if not label:
            continue
        nodes.setdefault(path, RetailerTaxonomyNode(
            retailer="ALDI",
            path=path,
            label=label,
            parent_path=None,
            depth=_path_depth(path),
        ))
    return sorted(nodes.values(), key=lambda node: (node.depth, node.path.casefold()))


def drakes_sidebar_nodes(sidebar_document: str) -> list[RetailerTaxonomyNode]:
    """Build the Drakes category tree from the public sidebar JSON payload."""
    try:
        payload = json.loads(sidebar_document)
    except json.JSONDecodeError as error:
        raise ValueError("Drakes sidebar is not valid JSON") from error
    departments = payload.get("departments") if isinstance(payload, dict) else None
    if not isinstance(departments, list):
        return []

    by_id: dict[str, dict[str, Any]] = {}
    for item in departments:
        if not isinstance(item, dict):
            continue
        identifier = str(item.get("id", "")).strip()
        slug = item.get("slug")
        name = _clean(item.get("name"))
        if not identifier or not isinstance(slug, str) or not re.fullmatch(r"[a-z0-9-]+", slug) or not name:
            continue
        by_id[identifier] = item

    path_by_id = {identifier: f"/category/{item['slug']}" for identifier, item in by_id.items()}
    nodes: list[RetailerTaxonomyNode] = []
    for identifier, item in by_id.items():
        name = _clean(item.get("name"))
        if not name or name.casefold() == "all departments":
            continue
        parent_id = str(item.get("parent_id", "")).strip()
        parent_path = path_by_id.get(parent_id)
        path = path_by_id[identifier]
        depth = 1
        seen: set[str] = set()
        cursor = parent_id
        while cursor and cursor in by_id and cursor not in seen:
            seen.add(cursor)
            depth += 1
            cursor = str(by_id[cursor].get("parent_id", "")).strip()
        nodes.append(RetailerTaxonomyNode(
            retailer="Drakes",
            path=path,
            label=name,
            parent_path=parent_path,
            depth=depth,
        ))
    return sorted(nodes, key=lambda node: (node.depth, node.path.casefold()))


def ancestry_for_node(nodes: Iterable[RetailerTaxonomyNode], path: str) -> list[str]:
    """Return root-to-leaf paths for a node when parent metadata is available."""
    by_path = {node.path: node for node in nodes}
    current = by_path.get(_normalise_path(path))
    ancestry: list[str] = []
    seen: set[str] = set()
    while current and current.path not in seen:
        seen.add(current.path)
        ancestry.append(current.path)
        current = by_path.get(current.parent_path) if current.parent_path else None
    ancestry.reverse()
    return ancestry


def leaf_taxonomy_paths(nodes: Iterable[RetailerTaxonomyNode]) -> list[str]:
    """Return explicit taxonomy nodes that are not parents of another node."""
    materialised = list(nodes)
    parents = {node.parent_path for node in materialised if node.parent_path}
    return sorted((node.path for node in materialised if node.path not in parents), key=str.casefold)
