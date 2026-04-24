from __future__ import annotations

"""Resource.raw_data JSON schema — internal format, not an external contract.

This module defines the on-disk shape of the ``raw_data`` column (a TEXT
field holding one JSON object per Resource) and provides the only
read/write entry points for it. The format is intentionally internal:
parser.py writes it, export.py and app.py read it, and no external
programmatic consumer depends on it.

Schema::

    {
        "provenance": {
            "<field_name>": "<source_enum>"   # e.g. "title": "jsonld"
        },
        "description": "<string, optional>"
    }

- ``provenance`` maps each tracked Resource field to the source the value
  came from. ``description`` is a sibling (not a provenance key) because
  Resource has no ``description`` column — we stash the extracted value
  here for future use without a schema migration.

Design notes:
- ``build_raw_data`` is strict (typos raise ValueError) to catch bugs
  at write time rather than silently emitting garbage downstream.
- ``parse_raw_data`` is lenient (any bad input returns the default
  shape) so readers never need try/except.
- Unknown top-level keys in inputs to ``parse_raw_data`` are silently
  ignored — this gives a cheap forward-compat path if we ever need to
  add fields without introducing a version field now.
"""

import json

# --- Provenance enum -------------------------------------------------------

PROVENANCE_JSONLD = "jsonld"
PROVENANCE_OG = "opengraph"
PROVENANCE_TWITTER = "twitter"
PROVENANCE_MICRODATA = "microdata"
PROVENANCE_DOM = "dom"
PROVENANCE_MISSING = "missing"

VALID_PROVENANCE_SOURCES = frozenset(
    {
        PROVENANCE_JSONLD,
        PROVENANCE_OG,
        PROVENANCE_TWITTER,
        PROVENANCE_MICRODATA,
        PROVENANCE_DOM,
        PROVENANCE_MISSING,
    }
)

# Resource fields that get provenance tracking. `description` is
# deliberately NOT here — it lives as a top-level sibling of provenance
# in the raw_data JSON, not as a tracked provenance entry.
PROVENANCE_FIELDS = frozenset(
    {
        "title",
        "cover_url",
        "views",
        "likes",
        "hearts",
        "tags",
        "category",
        "published_at",
    }
)


# --- Build / Parse ---------------------------------------------------------


def build_raw_data(provenance: dict, description: str = "") -> str:
    """Serialize provenance map + optional description to the v1 JSON.

    Strict: raises ``ValueError`` if any field name or source value is
    outside the whitelists. Callers must use the ``PROVENANCE_*`` and
    ``PROVENANCE_FIELDS`` constants rather than raw strings.
    """
    if not isinstance(description, str):
        raise TypeError(f"description must be str, got {type(description).__name__}")
    for field, source in provenance.items():
        if field not in PROVENANCE_FIELDS:
            raise ValueError(
                f"unknown provenance field: {field!r} "
                f"(whitelist: {sorted(PROVENANCE_FIELDS)})"
            )
        if source not in VALID_PROVENANCE_SOURCES:
            raise ValueError(
                f"unknown provenance source: {source!r} "
                f"(whitelist: {sorted(VALID_PROVENANCE_SOURCES)})"
            )
    payload = {"provenance": dict(provenance), "description": description}
    return json.dumps(payload, ensure_ascii=False, sort_keys=True)


_DEFAULT_PARSED = {"provenance": {}, "description": ""}


def parse_raw_data(raw: str) -> dict:
    """Deserialize a raw_data JSON string.

    Never raises: any malformed, empty, or structurally-wrong input
    returns the default shape ``{"provenance": {}, "description": ""}``.
    Unknown top-level keys in a well-formed object are silently dropped
    — callers on old and new versions both work without a version field.
    """
    if not raw:
        return dict(_DEFAULT_PARSED)
    try:
        data = json.loads(raw)
    except (ValueError, TypeError):
        return dict(_DEFAULT_PARSED)
    if not isinstance(data, dict):
        return dict(_DEFAULT_PARSED)

    prov = data.get("provenance")
    prov = prov if isinstance(prov, dict) else {}

    desc = data.get("description", "")
    desc = desc if isinstance(desc, str) else ""

    return {"provenance": prov, "description": desc}
