#!/usr/bin/env python
"""ISO2 country normalization shared by geo tooling."""

from __future__ import annotations

import json
import os
import re
import unicodedata
from typing import Dict

ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
ALIASES_PATH = os.path.join(ROOT_DIR, 'data', 'country_iso2.json')
_ALIASES_CACHE: Dict[str, str] | None = None


def slugify_place(value: str) -> str:
    if not value:
        return ''
    normalized = unicodedata.normalize('NFKD', value)
    ascii_value = normalized.encode('ascii', 'ignore').decode('ascii')
    ascii_value = ascii_value.strip().lower()
    ascii_value = re.sub(r'[\s_]+', '-', ascii_value)
    ascii_value = re.sub(r'[^a-z0-9-]', '', ascii_value)
    ascii_value = re.sub(r'-+', '-', ascii_value)
    return ascii_value.strip('-')


def _load_aliases() -> Dict[str, str]:
    global _ALIASES_CACHE
    if _ALIASES_CACHE is not None:
        return _ALIASES_CACHE
    aliases: Dict[str, str] = {}
    try:
        with open(ALIASES_PATH, 'r', encoding='utf-8') as f:
            data = json.load(f)
            if isinstance(data, dict):
                aliases = data.get('aliases', {}) or {}
    except Exception:
        aliases = {}
    _ALIASES_CACHE = aliases
    return aliases


def normalize_country_iso2(value: str) -> str:
    slug = slugify_place(value)
    if not slug:
        return ''
    if re.fullmatch(r'[a-z]{2}', slug):
        return slug
    aliases = _load_aliases()
    return aliases.get(slug, '')
