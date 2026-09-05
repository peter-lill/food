"""Persistent multi-path taxonomy observations for retailer catalogue scans.

The evidence database belongs to the retailer cache, not Food's canonical
Product taxonomy.  A scan can therefore observe the same retailer product in
several navigation categories without allowing the last category visited to
replace earlier evidence.
"""

from __future__ import annotations

import json
import os
import sqlite3
import time
from contextlib import contextmanager

from coles_catalogue import COLES_CATALOGUE_DB


@contextmanager
def _coles_connection():
    connection = sqlite3.connect(COLES_CATALOGUE_DB)
    connection.row_factory = sqlite3.Row
    try:
        connection.execute("""
            CREATE TABLE IF NOT EXISTS coles_product_taxonomy_evidence (
              external_id TEXT NOT NULL,
              category_path TEXT NOT NULL,
              first_seen_at INTEGER NOT NULL,
              last_seen_at INTEGER NOT NULL,
              observations INTEGER NOT NULL DEFAULT 1,
              PRIMARY KEY (external_id, category_path)
            )
        """)
        connection.execute("""
            CREATE INDEX IF NOT EXISTS coles_taxonomy_path
            ON coles_product_taxonomy_evidence(category_path, external_id)
        """)
        yield connection
        connection.commit()
    finally:
        connection.close()


def record_coles_category_observations(category_path: str) -> dict[str, int]:
    """Persist products currently observed on one successfully refreshed path.

    ``ColesBrowserSession.browse`` writes the category being browsed into the
    product cache.  Calling this immediately after a successful category pass
    captures that observation before another category can replace the cache's
    single primary path.  The cumulative evidence is then mirrored back into
    ``category_paths`` so the existing bridge endpoint can expose it without a
    schema or endpoint change.
    """
    now = int(time.time())
    with _coles_connection() as connection:
        rows = connection.execute(
            "SELECT external_id FROM coles_products WHERE category_path = ?",
            (category_path,),
        ).fetchall()
        for row in rows:
            connection.execute("""
                INSERT INTO coles_product_taxonomy_evidence (
                  external_id, category_path, first_seen_at, last_seen_at, observations
                ) VALUES (?, ?, ?, ?, 1)
                ON CONFLICT(external_id, category_path) DO UPDATE SET
                  last_seen_at=excluded.last_seen_at,
                  observations=coles_product_taxonomy_evidence.observations + 1
            """, (row["external_id"], category_path, now, now))

        external_ids = [row["external_id"] for row in rows]
        for external_id in external_ids:
            evidence = connection.execute("""
                SELECT category_path FROM coles_product_taxonomy_evidence
                WHERE external_id = ?
                ORDER BY (LENGTH(category_path) - LENGTH(REPLACE(category_path, '/', ''))) DESC,
                         category_path COLLATE NOCASE
            """, (external_id,)).fetchall()
            paths = [entry["category_path"] for entry in evidence]
            if paths:
                connection.execute(
                    "UPDATE coles_products SET category_paths = ? WHERE external_id = ?",
                    (json.dumps(paths, separators=(",", ":")), external_id),
                )

        return {
            "productsObserved": len(rows),
            "evidenceRows": connection.execute(
                "SELECT COUNT(*) FROM coles_product_taxonomy_evidence"
            ).fetchone()[0],
        }


def coles_taxonomy_evidence_status() -> dict[str, int]:
    if not os.path.exists(COLES_CATALOGUE_DB):
        return {"products": 0, "paths": 0, "observations": 0}
    with _coles_connection() as connection:
        row = connection.execute("""
            SELECT COUNT(DISTINCT external_id) products,
                   COUNT(*) paths,
                   COALESCE(SUM(observations), 0) observations
            FROM coles_product_taxonomy_evidence
        """).fetchone()
        return dict(row)
