#!/usr/bin/env python
"""One-time normalization pass for geo hierarchy (city-states, legacy admin1 placeholders)."""

from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import unicodedata
from typing import Any, Dict, List

from geo_country import normalize_country_iso2

ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
PUBLIC_GEO = os.path.join(ROOT_DIR, 'public', 'geo', 'country')
LISTINGS_STORE = os.path.join(ROOT_DIR, 'data', 'listings.local.json')
ADMIN1_PLACEHOLDER = '_admin1'


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


def normalize_country_slug(value: str) -> str:
    return normalize_country_iso2(value)


def move_dir(src: str, dest: str, dry_run: bool) -> None:
    if not os.path.exists(src):
        print(f'[skip] source missing: {src}')
        return
    if os.path.exists(dest):
        print(f'[merge] destination exists: {dest}')
        promote_child_contents(src, dest, dry_run)
        if dry_run:
            return
        try:
            if os.path.isdir(src) and not os.listdir(src):
                os.rmdir(src)
                print(f'[cleanup] removed empty {src}')
        except OSError as exc:
            print(f'[warn] could not remove {src}: {exc}')
        return
    if dry_run:
        print(f'[dry-run] move {src} -> {dest}')
        return
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    try:
        shutil.move(src, dest)
        print(f'[move] {src} -> {dest}')
    except OSError as exc:
        print(f'[warn] could not move {src} -> {dest}: {exc}')


def promote_child_contents(child_dir: str, parent_dir: str, dry_run: bool) -> None:
    moved_any = False
    for item in os.listdir(child_dir):
        src = os.path.join(child_dir, item)
        dest = os.path.join(parent_dir, item)
        if os.path.exists(dest):
            print(f'[conflict] destination exists (keeping source): {dest}')
            continue
        if dry_run:
            print(f'[dry-run] move {src} -> {dest}')
        else:
            shutil.move(src, dest)
        moved_any = True
    if not dry_run and moved_any and not os.listdir(child_dir):
        os.rmdir(child_dir)
        print(f'[cleanup] removed empty {child_dir}')


def normalize_geo_folders(dry_run: bool) -> None:
    if not os.path.isdir(PUBLIC_GEO):
        print(f'[skip] geo root not found: {PUBLIC_GEO}')
        return

    for country in sorted(os.listdir(PUBLIC_GEO)):
        country_dir = os.path.join(PUBLIC_GEO, country)
        if not os.path.isdir(country_dir):
            continue

        target_country = normalize_country_slug(country)
        if not target_country:
            print(f'[warn] unknown country folder "{country}" (skipping ISO2 merge)')
            continue
        if target_country != country:
            dest_dir = os.path.join(PUBLIC_GEO, target_country)
            print(f'[normalize] merging country folder: {country} -> {target_country}')
            move_dir(country_dir, dest_dir, dry_run)
            if not dry_run:
                country_dir = dest_dir
                country = target_country
                if not os.path.isdir(country_dir):
                    continue

        for admin1 in sorted(os.listdir(country_dir)):
            admin1_dir = os.path.join(country_dir, admin1)
            if not os.path.isdir(admin1_dir):
                continue
            if admin1 != ADMIN1_PLACEHOLDER:
                child_dir = os.path.join(admin1_dir, admin1)
                if os.path.isdir(child_dir):
                    print(f'[normalize] collapsing duplicated city folder: {child_dir}')
                    dest_dir = os.path.join(admin1_dir, '_self')
                    move_dir(child_dir, dest_dir, dry_run)

        for city in sorted(os.listdir(country_dir)):
            city_dir = os.path.join(country_dir, city)
            if not os.path.isdir(city_dir):
                continue
            if city == ADMIN1_PLACEHOLDER:
                continue
            if os.path.exists(os.path.join(city_dir, 'boundary-simplified.json')):
                dest = os.path.join(country_dir, ADMIN1_PLACEHOLDER, city)
                move_dir(city_dir, dest, dry_run)


def normalize_listings(dry_run: bool) -> None:
    if not os.path.exists(LISTINGS_STORE):
        print(f'[skip] listings file not found: {LISTINGS_STORE}')
        return
    with open(LISTINGS_STORE, 'r', encoding='utf-8') as f:
        data = json.load(f)
    if not isinstance(data, list):
        print('[skip] listings file is not a JSON array.')
        return

    changed = False
    for listing in data:
        address = listing.get('geopoint', {}).get('address', {}) or {}
        city = address.get('city') or ''
        region = address.get('region') or ''
        city_slug = slugify_place(city)
        region_slug = slugify_place(region)
        if not region:
            continue
        if region_slug in (ADMIN1_PLACEHOLDER, 'self'):
            address['region'] = ''
            changed = True
            print(f'[listing] cleared legacy admin1 placeholder for {listing.get("id", "unknown")}')

    if changed and not dry_run:
        backup_path = LISTINGS_STORE.replace('.json', '.backup.json')
        shutil.copyfile(LISTINGS_STORE, backup_path)
        with open(LISTINGS_STORE, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2)
        print(f'[write] updated listings. backup saved to {backup_path}')
    elif changed:
        print('[dry-run] listings changes detected; run with --apply to write.')


def main() -> int:
    parser = argparse.ArgumentParser(description='Normalize geo folder hierarchy and listing admin1 values.')
    parser.add_argument('--apply', action='store_true', help='Apply changes (default is dry-run)')
    args = parser.parse_args()

    dry_run = not args.apply
    normalize_geo_folders(dry_run)
    normalize_listings(dry_run)
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
