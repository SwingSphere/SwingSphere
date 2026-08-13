#!/usr/bin/env python
"""Shared geo normalization helpers for city-state detection."""

from __future__ import annotations

import re
import unicodedata
from typing import Any, Dict, List, Optional

from geo_country import normalize_country_iso2

ADMIN1_PLACEHOLDER = '_admin1'
SELF_CITY_SLUG = '_self'

US_STATE_MAP = {
    'alabama': 'al',
    'alaska': 'ak',
    'arizona': 'az',
    'arkansas': 'ar',
    'california': 'ca',
    'colorado': 'co',
    'connecticut': 'ct',
    'delaware': 'de',
    'district of columbia': 'dc',
    'district-of-columbia': 'dc',
    'florida': 'fl',
    'georgia': 'ga',
    'hawaii': 'hi',
    'idaho': 'id',
    'illinois': 'il',
    'indiana': 'in',
    'iowa': 'ia',
    'kansas': 'ks',
    'kentucky': 'ky',
    'louisiana': 'la',
    'maine': 'me',
    'maryland': 'md',
    'massachusetts': 'ma',
    'michigan': 'mi',
    'minnesota': 'mn',
    'mississippi': 'ms',
    'missouri': 'mo',
    'montana': 'mt',
    'nebraska': 'ne',
    'nevada': 'nv',
    'new hampshire': 'nh',
    'new jersey': 'nj',
    'new mexico': 'nm',
    'new york': 'ny',
    'north carolina': 'nc',
    'north dakota': 'nd',
    'ohio': 'oh',
    'oklahoma': 'ok',
    'oregon': 'or',
    'pennsylvania': 'pa',
    'rhode island': 'ri',
    'south carolina': 'sc',
    'south dakota': 'sd',
    'tennessee': 'tn',
    'texas': 'tx',
    'utah': 'ut',
    'vermont': 'vt',
    'virginia': 'va',
    'washington': 'wa',
    'west virginia': 'wv',
    'wisconsin': 'wi',
    'wyoming': 'wy',
}


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


def normalize_country(value: str) -> str:
    return normalize_country_iso2(value)


def normalize_admin1(value: str, country_slug: str) -> str:
    if not value:
        return ''
    if country_slug == 'us':
        iso_match = re.match(r'(?i)^us[-_](.+)$', value.strip())
        if iso_match:
            return slugify_place(iso_match.group(1))
    slug = slugify_place(value)
    if country_slug == 'us':
        if len(slug) == 2:
            return slug
        return US_STATE_MAP.get(slug, slug)
    return slug


def _extract_address_value(geocode: Optional[Dict[str, Any]], key: str) -> str:
    if not geocode:
        return ''
    address = geocode.get('address', {}) or {}
    return address.get(key, '') or ''


def _extract_iso_admin1_code(geocode: Optional[Dict[str, Any]]) -> str:
    if not geocode:
        return ''
    address = geocode.get('address', {}) or {}
    candidates: List[tuple[int, str]] = []
    for key, value in address.items():
        if not isinstance(key, str) or not value:
            continue
        match = re.match(r'ISO3166-2-lvl(\d+)', key, re.IGNORECASE)
        if not match:
            continue
        try:
            level = int(match.group(1))
        except ValueError:
            level = 999
        candidates.append((level, str(value)))
    if not candidates:
        return ''
    candidates.sort(key=lambda item: item[0])
    code = candidates[0][1].strip()
    if not code:
        return ''
    parts = re.split(r'[-_]', code)
    return parts[-1].strip()


def _derive_admin1_value(
    geocode: Optional[Dict[str, Any]],
    country_slug: str,
    admin1_input: str,
) -> str:
    admin1_from_geo = (
        _extract_address_value(geocode, 'state')
        or _extract_address_value(geocode, 'region')
        or _extract_address_value(geocode, 'state_district')
    )
    iso_admin1 = _extract_iso_admin1_code(geocode)

    if country_slug == 'us' and iso_admin1:
        return iso_admin1
    if admin1_from_geo:
        return admin1_from_geo
    if admin1_input:
        return admin1_input
    if iso_admin1:
        return iso_admin1
    return ''


def _derive_city_value(geocode: Optional[Dict[str, Any]], city_input: str) -> str:
    city_from_geo = (
        _extract_address_value(geocode, 'city')
        or _extract_address_value(geocode, 'town')
        or _extract_address_value(geocode, 'village')
        or _extract_address_value(geocode, 'municipality')
    )
    return city_from_geo or city_input


def _is_admin1_like_level(
    country_slug: str,
    city_admin_level: Optional[str],
    admin1_level: Optional[str],
    city_slug: str,
    country_name: str,
) -> bool:
    level = str(city_admin_level or '').strip()
    if not level:
        return False
    if admin1_level:
        return level == str(admin1_level).strip()
    if level in ('4', '6'):
        return True
    if level == '2':
        return bool(city_slug and country_name and slugify_place(country_name) == city_slug)
    return False


def normalize_place(
    country: str = '',
    admin1: str = '',
    city: str = '',
    geocode: Optional[Dict[str, Any]] = None,
    relation_tags: Optional[Dict[str, Any]] = None,
    city_relation_id: Optional[int] = None,
    admin1_relation_id: Optional[int] = None,
    admin1_level: Optional[str] = None,
) -> Dict[str, Any]:
    country_value = (
        _extract_address_value(geocode, 'country_code')
        or _extract_address_value(geocode, 'country')
        or country
    )
    country_name = _extract_address_value(geocode, 'country') or country
    country_slug = normalize_country(country_value)

    admin1_value = _derive_admin1_value(geocode, country_slug, admin1)
    city_value = _derive_city_value(geocode, city)
    raw_admin1_slug = normalize_admin1(admin1_value, country_slug)
    raw_city_slug = slugify_place(city_value)
    warnings: List[str] = []

    admin1_present = bool(raw_admin1_slug)
    admin1_matches_city = bool(raw_city_slug and raw_admin1_slug and raw_city_slug == raw_admin1_slug)

    relation_tags = relation_tags or {}
    relation_boundary_ok = relation_tags.get('boundary') == 'administrative'
    relation_admin_level = relation_tags.get('admin_level')

    relation_id_match = bool(city_relation_id and admin1_relation_id and city_relation_id == admin1_relation_id)
    admin1_like_level = _is_admin1_like_level(
        country_slug,
        relation_admin_level,
        admin1_level,
        raw_city_slug,
        country_name,
    )

    is_city_state = False
    if raw_city_slug and relation_boundary_ok and admin1_like_level and (admin1_matches_city or relation_id_match):
        is_city_state = True

    if admin1_present and raw_city_slug and raw_admin1_slug != raw_city_slug:
        is_city_state = False

    if country_slug == 'us':
        if is_city_state:
            warnings.append('city-state-ignored-us')
        is_city_state = False

    normalized_admin1_slug = raw_admin1_slug
    used_placeholder_admin1 = False

    if not country_slug and country_value:
        warnings.append('country-unknown')

    if not normalized_admin1_slug and raw_city_slug:
        normalized_admin1_slug = ADMIN1_PLACEHOLDER
        used_placeholder_admin1 = True
        warnings.append('admin1-missing')

    if is_city_state and raw_city_slug:
        normalized_admin1_slug = raw_city_slug
        used_placeholder_admin1 = False
        warnings.append('city-state')

    normalized_city_slug = SELF_CITY_SLUG if is_city_state and raw_city_slug else raw_city_slug

    return {
        'normalized_country_slug': country_slug,
        'normalized_admin1_slug': normalized_admin1_slug,
        'normalized_city_slug': normalized_city_slug,
        'raw_admin1_slug': raw_admin1_slug,
        'raw_city_slug': raw_city_slug,
        'is_city_state': is_city_state,
        'used_placeholder_admin1': used_placeholder_admin1,
        'normalization_warnings': warnings,
    }
