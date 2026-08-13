#!/usr/bin/env python3
"""Build the Phase One v4 globe country-atlas pair.

The v3 visual atlas intentionally follows the coarse facets in ``land.glb``.
This repair keeps those assignments and only restores valid pixels from the
geographic ID atlas inside four audited regions.  Existing non-background
facet coverage is preserved unless it belongs to the other country in the
same regional pair.

Requires Pillow. Run from anywhere with:

    python scripts/globe/build-country-atlas-v4.py
"""

from __future__ import annotations

import argparse
import hashlib
import json
import shutil
from collections import Counter
from dataclasses import dataclass
from pathlib import Path

from PIL import Image


EXPECTED_SIZE = (4096, 2048)
BACKGROUND_RGB = (0, 0, 0)
EXPECTED_SOURCE_SHA256 = {
    "countryIdTexture.png": "efb41c81ab9d72419ba0b54968f1bf9becff4be1325b42e8605978fdceb32300",
    "visualCountryAtlas_v3.png": "bd18fbd90dd2da8d2792afc69fe75235622cc0e4a3c0348b7bfa43b0a1f9e5f7",
    "countryLookup.json": "d1a037c3bd496b96bb49737fc649a922e8180627d4b315e220d31b20c743175e",
}


@dataclass(frozen=True)
class RepairRegion:
    name: str
    longitude_min: float
    longitude_max: float
    latitude_min: float
    latitude_max: float
    countries: tuple[str, ...]


REPAIR_REGIONS = (
    RepairRegion("alaska_bering_seam", -180, -150, 50, 72, ("USA", "RUS")),
    RepairRegion("russia_far_east", 145, 180, 45, 80, ("RUS",)),
    RepairRegion("mainland_us_canada", -125, -60, 40, 58, ("USA", "CAN")),
    RepairRegion("australia_northeast", 135, 154, -27, -8, ("AUS",)),
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--check",
        action="store_true",
        help="verify that existing v4 files match the deterministic repair without rewriting them",
    )
    parser.add_argument(
        "--allow-source-drift",
        action="store_true",
        help="allow the script to run when a source asset hash has intentionally changed",
    )
    return parser.parse_args()


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def atlas_bounds(region: RepairRegion) -> tuple[int, int, int, int]:
    width, height = EXPECTED_SIZE
    x0 = max(0, int((region.longitude_min + 180) / 360 * width))
    x1 = min(width, int((region.longitude_max + 180) / 360 * width + 0.999999))
    y0 = max(0, int((90 - region.latitude_max) / 180 * height))
    y1 = min(height, int((90 - region.latitude_min) / 180 * height + 0.999999))
    return x0, y0, x1, y1


def load_country_colors(lookup_path: Path) -> tuple[dict[str, tuple[int, int, int]], set[tuple[int, int, int]]]:
    lookup = json.loads(lookup_path.read_text(encoding="utf-8"))
    colors_by_iso3 = {entry["iso3"]: tuple(entry["rgb"]) for entry in lookup.values()}
    valid_colors = set(colors_by_iso3.values()) | {BACKGROUND_RGB}
    return colors_by_iso3, valid_colors


def validate_source_hashes(paths: tuple[Path, ...], allow_source_drift: bool) -> dict[str, str]:
    hashes = {path.name: sha256(path) for path in paths}
    mismatches = {
        name: {"expected": EXPECTED_SOURCE_SHA256[name], "actual": actual}
        for name, actual in hashes.items()
        if EXPECTED_SOURCE_SHA256.get(name) != actual
    }
    if mismatches and not allow_source_drift:
        raise RuntimeError(
            "Source atlas inputs changed; audit the drift or rerun with --allow-source-drift:\n"
            + json.dumps(mismatches, indent=2)
        )
    return hashes


def validate_image(path: Path, expected_mode: str | None = None) -> Image.Image:
    image = Image.open(path)
    image.load()
    if image.size != EXPECTED_SIZE:
        raise RuntimeError(f"{path.name} is {image.size}, expected {EXPECTED_SIZE}")
    if expected_mode and image.mode != expected_mode:
        raise RuntimeError(f"{path.name} is {image.mode}, expected {expected_mode}")
    return image


def validate_palette(image: Image.Image, valid_colors: set[tuple[int, int, int]], label: str) -> int:
    colors = image.convert("RGB").getcolors(maxcolors=EXPECTED_SIZE[0] * EXPECTED_SIZE[1])
    if colors is None:
        raise RuntimeError(f"Unable to enumerate colors in {label}")
    unknown = sorted(color for _, color in colors if color not in valid_colors)
    if unknown:
        raise RuntimeError(f"{label} contains unknown RGB identities: {unknown[:12]}")
    return len(colors)


def build_visual_v4(
    id_image: Image.Image,
    visual_v3: Image.Image,
    colors_by_iso3: dict[str, tuple[int, int, int]],
) -> tuple[Image.Image, dict[str, object]]:
    output = visual_v3.copy()
    id_pixels = id_image.convert("RGB").load()
    output_pixels = output.load()
    iso3_by_color = {color: iso3 for iso3, color in colors_by_iso3.items()}
    changed_pixels: set[tuple[int, int]] = set()
    target_country_totals: Counter[str] = Counter()
    region_reports: list[dict[str, object]] = []

    for region in REPAIR_REGIONS:
        bounds = atlas_bounds(region)
        target_colors = {colors_by_iso3[iso3] for iso3 in region.countries}
        allowed_visual_colors = target_colors | {BACKGROUND_RGB}
        transitions: Counter[tuple[tuple[int, int, int], tuple[int, int, int]]] = Counter()

        for y in range(bounds[1], bounds[3]):
            for x in range(bounds[0], bounds[2]):
                id_rgb = id_pixels[x, y]
                if id_rgb not in target_colors:
                    continue
                visual_pixel = output_pixels[x, y]
                visual_rgb = visual_pixel[:3]
                if visual_rgb not in allowed_visual_colors or visual_rgb == id_rgb:
                    continue
                transitions[(visual_rgb, id_rgb)] += 1
                target_country_totals[iso3_by_color[id_rgb]] += 1
                changed_pixels.add((x, y))
                if output.mode == "RGBA":
                    output_pixels[x, y] = (*id_rgb, visual_pixel[3])
                else:
                    output_pixels[x, y] = id_rgb

        region_reports.append(
            {
                "name": region.name,
                "atlas_bounds": list(bounds),
                "longitude": [region.longitude_min, region.longitude_max],
                "latitude": [region.latitude_min, region.latitude_max],
                "countries": list(region.countries),
                "changed_pixels": sum(transitions.values()),
                "transitions": [
                    {
                        "from": iso3_by_color.get(source, "BACKGROUND"),
                        "to": iso3_by_color[target],
                        "from_rgb": list(source),
                        "to_rgb": list(target),
                        "pixels": count,
                    }
                    for (source, target), count in sorted(transitions.items())
                ],
            }
        )

    return output, {
        "total_changed_pixels": len(changed_pixels),
        "changed_pixels_by_target_country": dict(sorted(target_country_totals.items())),
        "regions": region_reports,
    }


def seam_report(image: Image.Image, colors_by_iso3: dict[str, tuple[int, int, int]]) -> dict[str, object]:
    pixels = image.convert("RGB").load()
    width, height = image.size
    edge_width = 8
    tracked = {iso3: color for iso3, color in colors_by_iso3.items() if iso3 in {"RUS", "USA"}}
    report: dict[str, object] = {"edge_width_pixels": edge_width}
    for side, columns in (
        ("left", range(edge_width)),
        ("right", range(width - edge_width, width)),
    ):
        report[side] = {
            iso3: sum(1 for x in columns for y in range(height) if pixels[x, y] == color)
            for iso3, color in tracked.items()
        }
    if report["left"]["RUS"] == 0 or report["right"]["RUS"] == 0:
        raise RuntimeError("Russia is not continuous across both atlas seam edges")
    return report


def images_equal(left: Image.Image, right: Image.Image) -> bool:
    return left.mode == right.mode and left.size == right.size and left.tobytes() == right.tobytes()


def main() -> None:
    args = parse_args()
    repo_root = Path(__file__).resolve().parents[2]
    texture_dir = repo_root / "public" / "assets" / "globe" / "textures"
    lookup_path = repo_root / "public" / "assets" / "globe" / "data" / "countryLookup.json"
    id_v3_path = texture_dir / "countryIdTexture.png"
    visual_v3_path = texture_dir / "visualCountryAtlas_v3.png"
    id_v4_path = texture_dir / "countryIdTexture_v4.png"
    visual_v4_path = texture_dir / "visualCountryAtlas_v4.png"

    source_hashes = validate_source_hashes(
        (id_v3_path, visual_v3_path, lookup_path),
        args.allow_source_drift,
    )
    colors_by_iso3, valid_colors = load_country_colors(lookup_path)
    id_v3 = validate_image(id_v3_path, "RGB")
    visual_v3 = validate_image(visual_v3_path, "RGBA")
    id_color_count = validate_palette(id_v3, valid_colors, id_v3_path.name)
    visual_color_count = validate_palette(visual_v3, valid_colors, visual_v3_path.name)
    visual_v4, repair_report = build_visual_v4(id_v3, visual_v3, colors_by_iso3)
    visual_v4_color_count = validate_palette(visual_v4, valid_colors, visual_v4_path.name)
    visual_alpha_values = sorted(value for _, value in visual_v4.getchannel("A").getcolors())
    if visual_alpha_values != [255]:
        raise RuntimeError(f"Unexpected visual atlas alpha values: {visual_alpha_values}")

    if args.check:
        existing_id_v4 = validate_image(id_v4_path, "RGB")
        existing_visual_v4 = validate_image(visual_v4_path, "RGBA")
        if id_v4_path.read_bytes() != id_v3_path.read_bytes():
            raise RuntimeError("countryIdTexture_v4.png is not the exact synchronized copy of v3")
        if not images_equal(existing_visual_v4, visual_v4):
            raise RuntimeError("visualCountryAtlas_v4.png does not match the deterministic repair")
    else:
        shutil.copyfile(id_v3_path, id_v4_path)
        visual_v4.save(visual_v4_path, format="PNG", compress_level=9, optimize=False)

    report = {
        "mode": "check" if args.check else "write",
        "source_sha256": source_hashes,
        "outputs": {
            id_v4_path.name: {
                "size": list(id_v3.size),
                "mode": id_v3.mode,
                "pixel_changes_from_v3": 0,
                "sha256": sha256(id_v4_path),
            },
            visual_v4_path.name: {
                "size": list(visual_v4.size),
                "mode": visual_v4.mode,
                "pixel_changes_from_v3": repair_report["total_changed_pixels"],
                "sha256": sha256(visual_v4_path),
            },
        },
        "palette": {
            "id_rgb_colors": id_color_count,
            "visual_v3_rgb_colors": visual_color_count,
            "visual_v4_rgb_colors": visual_v4_color_count,
            "unknown_rgb_colors": 0,
            "visual_alpha_values": visual_alpha_values,
        },
        "seam": {
            id_v4_path.name: seam_report(id_v3, colors_by_iso3),
            visual_v4_path.name: seam_report(visual_v4, colors_by_iso3),
        },
        "repairs": repair_report,
    }
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
